/* Matey Lock — shared namespace-aware PIN + pattern lock engine
 *
 * Features:
 * - Per-namespace PIN (SHA-256 + salt) stored in IndexedDB
 * - 6-digit PIN verification
 * - In-memory unlock session state per namespace
 * - 3x3 Canvas pattern lock grid with touch/swipe sequence matcher
 * - Unified visibilitychange auto-lock watcher
 * - Zero network calls
 */
(function () {
  'use strict';

  var DB_NAME = 'matey-lock';
  var DB_VERSION = 1;
  var STORE_SETTINGS = 'settings';
  var DEFAULT_AUTO_LOCK_MS = 30000;
  var MIN_PATTERN_LENGTH = 4;

  var _db = null;
  var _unlocked = {};
  var _listeners = [];
  var _autoLockTimers = {};
  var _autoLockCallbacks = {};
  var _autoLockMs = {};
  var _backgroundTime = null;

  /* ==================== IndexedDB Helpers ==================== */
  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };
      req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function tx(mode) {
    return openDB().then(function (db) {
      return db.transaction(STORE_SETTINGS, mode).objectStore(STORE_SETTINGS);
    });
  }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* ==================== PIN Hashing ==================== */
  function hashPin(pin, salt) {
    var enc = new TextEncoder();
    var data = enc.encode(pin + salt);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  function generateSalt() {
    var arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function settingKey(namespace, name) {
    return namespace + ':' + name;
  }

  /* ==================== Public PIN API ==================== */
  function isPinEnabled(namespace) {
    return getSetting(namespace, 'pinHash', null).then(function (h) { return !!h; });
  }

  function isLocked(namespace) {
    return isPinEnabled(namespace).then(function (enabled) {
      if (!enabled) return false;
      return !_unlocked[namespace];
    });
  }

  function setPin(namespace, pin) {
    var salt = generateSalt();
    return hashPin(pin, salt).then(function (pinHash) {
      return Promise.all([
        setSetting(namespace, 'pinHash', pinHash),
        setSetting(namespace, 'pinSalt', salt)
      ]).then(function () {
        _unlocked[namespace] = true;
        notifyListeners('unlocked', namespace);
      });
    });
  }

  function verifyPin(namespace, pin) {
    return Promise.all([
      getSetting(namespace, 'pinHash', null),
      getSetting(namespace, 'pinSalt', null)
    ]).then(function (r) {
      var pinHash = r[0], salt = r[1];
      if (!pinHash || !salt) return false;
      return hashPin(pin, salt).then(function (inputHash) {
        return inputHash === pinHash;
      });
    });
  }

  function unlock(namespace, pin) {
    return verifyPin(namespace, pin).then(function (ok) {
      if (ok) {
        _unlocked[namespace] = true;
        notifyListeners('unlocked', namespace);
        return true;
      }
      return false;
    });
  }

  function lock(namespace) {
    _unlocked[namespace] = false;
    notifyListeners('locked', namespace);
  }

  function removeLock(namespace) {
    _unlocked[namespace] = false;
    return Promise.all([
      setSetting(namespace, 'pinHash', null),
      setSetting(namespace, 'pinSalt', null),
      setSetting(namespace, 'patternHash', null)
    ]).then(function () {
      notifyListeners('removed', namespace);
    });
  }

  /* ==================== Pattern Lock ==================== */
  function hashPattern(pattern) {
    if (!pattern || !pattern.length) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(pattern.join(','))).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  function isPatternEnabled(namespace) {
    return getSetting(namespace, 'patternHash', null).then(function (h) { return !!h; });
  }

  function setPattern(namespace, pattern) {
    return hashPattern(pattern).then(function (patternHash) {
      return setSetting(namespace, 'patternHash', patternHash);
    });
  }

  function verifyPattern(namespace, pattern) {
    return getSetting(namespace, 'patternHash', null).then(function (storedHash) {
      if (!storedHash) return false;
      return hashPattern(pattern).then(function (inputHash) {
        return inputHash === storedHash;
      });
    });
  }

  function renderPatternGrid(container, options) {
    options = options || {};
    var size = options.size || 300;
    var dotRadius = options.dotRadius || 12;
    var lineWidth = options.lineWidth || 3;
    var accentColor = options.accentColor || '#B583FC';
    var dotColor = options.dotColor || '#8b8b90';
    var bgColor = options.bgColor || 'transparent';
    var onComplete = options.onComplete || function () {};
    var onCancel = options.onCancel || function () {};
    var minLength = options.minLength || MIN_PATTERN_LENGTH;

    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    if (bgColor !== 'transparent') {
      canvas.style.backgroundColor = bgColor;
    }
    container.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var spacing = size / 4;
    var dots = [];
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 3; col++) {
        dots.push({
          x: spacing + col * spacing,
          y: spacing + row * spacing,
          index: row * 3 + col
        });
      }
    }

    var selectedDots = [];
    var isDrawing = false;
    var lastDot = null;
    var currentPos = null;

    function getNearestDot(x, y) {
      var nearest = null;
      var minDist = spacing * 0.4;
      dots.forEach(function (dot) {
        var dist = Math.sqrt((dot.x - x) * (dot.x - x) + (dot.y - y) * (dot.y - y));
        if (dist < minDist) {
          minDist = dist;
          nearest = dot;
        }
      });
      return nearest;
    }

    function draw() {
      ctx.clearRect(0, 0, size, size);

      // Draw connecting lines
      if (selectedDots.length > 1) {
        ctx.beginPath();
        ctx.moveTo(selectedDots[0].x, selectedDots[0].y);
        for (var i = 1; i < selectedDots.length; i++) {
          ctx.lineTo(selectedDots[i].x, selectedDots[i].y);
        }
        // Draw line to current position if dragging
        if (isDrawing && currentPos) {
          ctx.lineTo(currentPos.x, currentPos.y);
        }
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // Draw dots
      dots.forEach(function (dot) {
        var isSelected = selectedDots.indexOf(dot) !== -1;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
        if (isSelected) {
          ctx.fillStyle = accentColor;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = dotColor;
          ctx.fill();
        }
      });
    }

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var clientX, clientY;
      if (e.touches && e.touches.length) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if (e.changedTouches && e.changedTouches.length) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      return {
        x: (clientX - rect.left) * (size / rect.width),
        y: (clientY - rect.top) * (size / rect.height)
      };
    }

    function startDot(dot) {
      if (!dot) return;
      isDrawing = true;
      selectedDots = [dot];
      lastDot = dot;
      draw();
    }

    function moveDot(pos) {
      if (!isDrawing) return;
      currentPos = pos;
      var dot = getNearestDot(pos.x, pos.y);
      if (dot && dot !== lastDot && selectedDots.indexOf(dot) === -1) {
        selectedDots.push(dot);
        lastDot = dot;
      }
      draw();
    }

    function endDot() {
      if (!isDrawing) return;
      isDrawing = false;
      currentPos = null;
      var pattern = selectedDots.map(function (d) { return d.index; });
      if (pattern.length >= minLength) {
        onComplete(pattern);
      } else {
        onCancel();
      }
      selectedDots = [];
      lastDot = null;
      draw();
    }

    // Touch events
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var pos = getPos(e);
      var dot = getNearestDot(pos.x, pos.y);
      startDot(dot);
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      var pos = getPos(e);
      moveDot(pos);
    }, { passive: false });

    canvas.addEventListener('touchend', function (e) {
      e.preventDefault();
      endDot();
    }, { passive: false });

    canvas.addEventListener('touchcancel', function (e) {
      endDot();
    });

    // Mouse events (desktop testing)
    canvas.addEventListener('mousedown', function (e) {
      var pos = getPos(e);
      var dot = getNearestDot(pos.x, pos.y);
      startDot(dot);
    });

    canvas.addEventListener('mousemove', function (e) {
      if (!isDrawing) return;
      var pos = getPos(e);
      moveDot(pos);
    });

    canvas.addEventListener('mouseup', function (e) {
      if (!isDrawing) return;
      endDot();
    });

    canvas.addEventListener('mouseleave', function (e) {
      if (isDrawing) endDot();
    });

    draw();

    return {
      canvas: canvas,
      cancel: function () {
        selectedDots = [];
        isDrawing = false;
        currentPos = null;
        draw();
      },
      getPattern: function () {
        return selectedDots.map(function (d) { return d.index; });
      }
    };
  }

  /* ==================== Auto-Lock Watcher ==================== */
  function startAutoLockWatcher(namespace, callback) {
    _autoLockCallbacks[namespace] = callback;

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        _backgroundTime = Date.now();
        var ms = _autoLockMs[namespace] || DEFAULT_AUTO_LOCK_MS;
        _autoLockTimers[namespace] = setTimeout(function () {
          lock(namespace);
          if (callback) callback();
          notifyListeners('autoLocked', namespace);
        }, ms);
      } else {
        if (_autoLockTimers[namespace]) {
          clearTimeout(_autoLockTimers[namespace]);
          _autoLockTimers[namespace] = null;
        }
        _backgroundTime = null;
      }
    });
  }

  /* ==================== Settings Helpers ==================== */
  function getSetting(namespace, name, fallback) {
    var key = settingKey(namespace, name);
    return tx('readonly').then(function (store) {
      return reqToPromise(store.get(key)).then(function (r) { return r ? r.value : fallback; });
    });
  }

  function setSetting(namespace, name, value) {
    var key = settingKey(namespace, name);
    return tx('readwrite').then(function (store) {
      return reqToPromise(store.put({ key: key, value: value }));
    });
  }

  function getAutoLockMs(namespace) {
    return getSetting(namespace, 'autoLockMs', DEFAULT_AUTO_LOCK_MS);
  }

  function setAutoLockMs(namespace, ms) {
    _autoLockMs[namespace] = ms;
    return setSetting(namespace, 'autoLockMs', ms);
  }

  /* ==================== Events ==================== */
  function notifyListeners(event, namespace) {
    _listeners.forEach(function (fn) { fn(event, namespace); });
  }

  function onLockChange(fn) {
    if (_listeners.indexOf(fn) === -1) _listeners.push(fn);
  }

  /* ==================== Init ==================== */
  function init() {
    openDB().catch(function (e) {
      console.error('[MateyLock] DB init failed:', e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ==================== Public API ==================== */
  window.MateyLock = {
    /* PIN */
    isPinEnabled: isPinEnabled,
    isLocked: isLocked,
    setPin: setPin,
    verifyPin: verifyPin,
    unlock: unlock,
    lock: lock,
    removeLock: removeLock,

    /* Pattern */
    isPatternEnabled: isPatternEnabled,
    setPattern: setPattern,
    verifyPattern: verifyPattern,
    renderPatternGrid: renderPatternGrid,
    hashPattern: hashPattern,
    MIN_PATTERN_LENGTH: MIN_PATTERN_LENGTH,

    /* Auto-lock */
    startAutoLockWatcher: startAutoLockWatcher,
    getAutoLockMs: getAutoLockMs,
    setAutoLockMs: setAutoLockMs,

    /* Settings */
    getSetting: getSetting,
    setSetting: setSetting,

    /* Events */
    onLockChange: onLockChange
  };
})();

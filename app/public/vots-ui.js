/* Matey VOTS UI — link-gated private journaling
 * Zero network calls. All processing is 100% local.
 */
(function () {
  'use strict';

  var NAMESPACE = 'vots';
  var ACTION_VERBS = ['said', 'shared', 'posted', 'claimed', 'announced', 'showed', 'asked'];

  var _currentLink = null;
  var _currentLinkType = null;
  var _currentAttachments = [];
  var _currentTags = [];
  var _selectedVerb = '';
  var _currentEntryId = null;

  /* ==================== SVG Icons (inline, zero external assets) ==================== */
  var ICONS = {
    twitter: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    youtube: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    article: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'
  };

  var LINK_TYPE_COLORS = {
    twitter: '#8b8b90',
    youtube: '#E85D5D',
    article: '#B583FC'
  };

  /* ==================== Utilities ==================== */
  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatRelative(ts) {
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd ago';
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function showToast(msg) {
    var t = $('vts-toast');
    if (!t) return;
    $('vts-toast-text').textContent = msg;
    t.style.display = 'flex';
    t.classList.add('vts-toast-visible');
    setTimeout(function () {
      t.classList.remove('vts-toast-visible');
      setTimeout(function () { t.style.display = 'none'; }, 300);
    }, 2000);
  }

  function showOverlay(id) {
    var o = $(id);
    if (o) { o.style.display = 'flex'; o.classList.add('vts-overlay-visible'); }
  }

  function hideOverlay(id) {
    var o = $(id);
    if (o) { o.classList.remove('vts-overlay-visible'); setTimeout(function () { o.style.display = 'none'; }, 250); }
  }

  function showConfirm(title, text, onOk) {
    $('vts-confirm-title').textContent = title;
    $('vts-confirm-desc').textContent = text;
    showOverlay('vts-confirm');
    $('vts-confirm-ok').onclick = function () {
      hideOverlay('vts-confirm');
      onOk();
    };
    $('vts-confirm-cancel').onclick = function () { hideOverlay('vts-confirm'); };
  }

  /* ==================== Lock Screen ==================== */
  function showLockScreen() {
    showScreen('vts-lock');
    updateLockUI();
  }

  function updateLockUI() {
    var hasPin = MateyLock.isPinEnabled(NAMESPACE);
    var hasPattern = MateyLock.isPatternEnabled(NAMESPACE);
    $('vts-lock-mode-pin').style.display = hasPin ? 'block' : 'none';
    $('vts-lock-mode-pattern').style.display = hasPattern ? 'block' : 'none';
    $('vts-lock-mode-setup').style.display = (!hasPin && !hasPattern) ? 'block' : 'none';
    $('vts-pin-input').value = '';
    $('vts-pin-error').style.display = 'none';
  }

  function tryUnlockPin() {
    var pin = $('vts-pin-input').value;
    if (!pin) return;
    MateyLock.unlock(NAMESPACE, pin).then(function (ok) {
      if (ok) {
        $('vts-pin-input').value = '';
        $('vts-pin-error').style.display = 'none';
        showMain();
      } else {
        $('vts-pin-error').style.display = 'block';
        $('vts-pin-input').value = '';
      }
    });
  }

  function trySetupPin() {
    var pin = $('vts-pin-input').value;
    if (!pin || pin.length < 6) {
      showToast('PIN must be 6 digits');
      return;
    }
    MateyLock.setPin(NAMESPACE, pin).then(function () {
      $('vts-pin-input').value = '';
      showToast('PIN set successfully');
      updateLockUI();
      showMain();
    });
  }

  function openPatternSetup() {
    var container = $('vts-pattern-setup-container');
    container.innerHTML = '';
    var desc = document.createElement('p');
    desc.className = 'vts-pattern-desc';
    desc.textContent = 'Draw a pattern (connect at least 4 dots)';
    container.appendChild(desc);

    var gridWrap = document.createElement('div');
    gridWrap.className = 'vts-pattern-grid-wrap';
    container.appendChild(gridWrap);

    var status = document.createElement('p');
    status.className = 'vts-pattern-status';
    status.textContent = 'Draw your pattern';
    container.appendChild(status);

    var grid = MateyLock.renderPatternGrid(gridWrap, {
      size: 260,
      dotRadius: 14,
      lineWidth: 4,
      accentColor: '#B583FC',
      dotColor: '#8b8b90',
      minLength: 4,
      onComplete: function (pattern) {
        MateyLock.setPattern(NAMESPACE, pattern).then(function () {
          status.textContent = 'Pattern saved!';
          status.style.color = '#22c55e';
          setTimeout(function () {
            showMain();
          }, 800);
        });
      },
      onCancel: function () {
        status.textContent = 'Pattern too short — try again';
        status.style.color = '#E85D5D';
      }
    });
  }

  function openPatternUnlock() {
    var container = $('vts-pattern-unlock-container');
    container.innerHTML = '';
    var desc = document.createElement('p');
    desc.className = 'vts-pattern-desc';
    desc.textContent = 'Draw your pattern to unlock';
    container.appendChild(desc);

    var gridWrap = document.createElement('div');
    gridWrap.className = 'vts-pattern-grid-wrap';
    container.appendChild(gridWrap);

    var status = document.createElement('p');
    status.className = 'vts-pattern-status';
    status.textContent = 'Draw your pattern';
    container.appendChild(status);

    var grid = MateyLock.renderPatternGrid(gridWrap, {
      size: 260,
      dotRadius: 14,
      lineWidth: 4,
      accentColor: '#B583FC',
      dotColor: '#8b8b90',
      minLength: 4,
      onComplete: function (pattern) {
        MateyLock.verifyPattern(NAMESPACE, pattern).then(function (ok) {
          if (ok) {
            MateyLock.unlock(NAMESPACE);
            status.textContent = 'Unlocked!';
            status.style.color = '#22c55e';
            setTimeout(function () { showMain(); }, 500);
          } else {
            status.textContent = 'Wrong pattern — try again';
            status.style.color = '#E85D5D';
            grid.cancel();
          }
        });
      },
      onCancel: function () {
        status.textContent = 'Pattern too short';
        status.style.color = '#E85D5D';
      }
    });
  }

  /* ==================== Navigation ==================== */
  function showScreen(screenId) {
    ['vts-lock', 'vts-landing', 'vts-editor', 'vts-history'].forEach(function (id) {
      var el = $(id);
      if (el) el.style.display = 'none';
    });
    var el = $(screenId);
    if (el) el.style.display = 'flex';
  }

  function showMain() {
    showScreen('vts-landing');
    activateIncognitoIcon();
  }

  function showEditor() {
    showScreen('vts-editor');
  }

  function showHistory() {
    showScreen('vts-history');
    renderHistory();
  }

  function activateIncognitoIcon() {
    var incBtn = document.querySelector('.incognito-trigger');
    if (incBtn) {
      incBtn.classList.add('active');
      incBtn.setAttribute('title', 'Incognito mode is ON');
    }
  }

  /* ==================== Link Gate ==================== */
  function initLinkGate() {
    var input = $('vts-link-input');
    var submitBtn = $('vts-link-submit');
    var helper = $('vts-link-helper');

    if (!input || !submitBtn) return;

    submitBtn.addEventListener('click', function () {
      var url = input.value.trim();
      if (!url) {
        showToast('Please enter a source link');
        return;
      }
      if (!isValidUrl(url)) {
        showToast('Please enter a valid URL');
        return;
      }
      _currentLink = url;
      _currentLinkType = MateyVots.detectLinkType(url);
      enterEditor();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitBtn.click();
      }
    });

    // Real-time validation feedback
    input.addEventListener('input', function () {
      var val = input.value.trim();
      if (val && !isValidUrl(val)) {
        helper.textContent = 'Enter a valid URL (https://...)';
        helper.style.color = '#E85D5D';
      } else if (val) {
        helper.textContent = 'Paste a public link to respond to';
        helper.style.color = '';
      } else {
        helper.textContent = 'Paste a public link to respond to';
        helper.style.color = '';
      }
    });
  }

  function isValidUrl(str) {
    try {
      var url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) { return false; }
  }

  function enterEditor() {
    _selectedVerb = '';
    _currentTags = [];
    _currentAttachments = [];

    // Update link card
    updateLinkCard();

    // Show editor
    showEditor();

    // Focus first field
    setTimeout(function () {
      var whoInput = $('vts-headline-who');
      if (whoInput) whoInput.focus();
    }, 100);
  }

  /* ==================== Link Card ==================== */
  function updateLinkCard() {
    if (!_currentLink || !_currentLinkType) return;

    var card = $('vts-link-card');
    if (!card) return;

    var iconSvg = ICONS[_currentLinkType.icon] || ICONS.article;
    var accentColor = LINK_TYPE_COLORS[_currentLinkType.icon] || '#B583FC';
    var domain = MateyVots.getDomain(_currentLink);

    // Assemble headline
    var who = $('vts-headline-who') ? $('vts-headline-who').value.trim() : '';
    var about = $('vts-headline-about') ? $('vts-headline-about').value.trim() : '';
    var verb = _selectedVerb;
    var headline = assembleHeadline(who, verb, about);

    card.style.setProperty('--vts-link-accent', accentColor);
    card.style.display = 'flex';

    card.innerHTML =
      '<div class="vts-link-card-icon" style="color:' + accentColor + '">' + iconSvg + '</div>' +
      '<div class="vts-link-card-body">' +
        '<div class="vts-link-card-headline">' + escapeHtml(headline || 'Your response headline...') + '</div>' +
        '<div class="vts-link-card-meta">' +
          '<span class="vts-link-card-domain">' + escapeHtml(domain) + '</span>' +
          '<span class="vts-link-card-type">' + escapeHtml(_currentLinkType.label) + '</span>' +
        '</div>' +
      '</div>';
  }

  function assembleHeadline(who, verb, about) {
    var parts = [];
    if (who) parts.push(who);
    if (verb) parts.push(verb);
    if (about) parts.push(about);
    return parts.join(' ');
  }

  /* ==================== Headline Mini-Form ==================== */
  function initHeadlineForm() {
    var whoInput = $('vts-headline-who');
    var aboutInput = $('vts-headline-about');
    var verbContainer = $('vts-verb-chips');

    if (whoInput) {
      whoInput.addEventListener('input', debounce(function () { updateLinkCard(); }, 200));
    }
    if (aboutInput) {
      aboutInput.addEventListener('input', debounce(function () { updateLinkCard(); }, 200));
    }

    if (verbContainer) {
      verbContainer.innerHTML = '';
      ACTION_VERBS.forEach(function (verb) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'vts-verb-chip';
        chip.textContent = verb;
        chip.addEventListener('click', function () {
          if (_selectedVerb === verb) {
            _selectedVerb = '';
            chip.classList.remove('vts-verb-chip-active');
          } else {
            _selectedVerb = verb;
            verbContainer.querySelectorAll('.vts-verb-chip').forEach(function (c) {
              c.classList.remove('vts-verb-chip-active');
            });
            chip.classList.add('vts-verb-chip-active');
          }
          updateLinkCard();
        });
        verbContainer.appendChild(chip);
      });
    }
  }

  /* ==================== Entry History ==================== */
  function renderHistory() {
    MateyVots.getAllEntries().then(function (entries) {
      var container = $('vts-history-list');
      var empty = $('vts-history-empty');
      if (!container) return;

      if (!entries.length) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
      }
      if (empty) empty.style.display = 'none';

      container.innerHTML = entries.map(function (entry) {
        var lt = MateyVots.detectLinkType(entry.link || '');
        var iconSvg = ICONS[lt.icon] || ICONS.article;
        var headline = entry.headline || entry.title || 'Untitled';
        return '<div class="vts-history-item" data-id="' + entry.id + '">' +
          '<div class="vts-history-item-header">' +
            '<span class="vts-history-item-icon" style="color:' + (LINK_TYPE_COLORS[lt.icon] || '#B583FC') + '">' + iconSvg + '</span>' +
            '<span class="vts-history-item-type">' + escapeHtml(lt.label) + '</span>' +
            '<span class="vts-history-item-time">' + formatRelative(entry.timestamp) + '</span>' +
          '</div>' +
          '<div class="vts-history-item-headline">' + escapeHtml(headline) + '</div>' +
          '<div class="vts-history-item-preview">' + escapeHtml((entry.content || '').substring(0, 120)) + '</div>' +
          '<div class="vts-history-item-domain">' + escapeHtml(MateyVots.getDomain(entry.link || '')) + '</div>' +
        '</div>';
      }).join('');

      container.querySelectorAll('.vts-history-item').forEach(function (item) {
        item.addEventListener('click', function () {
          var id = item.getAttribute('data-id');
          loadEntry(id);
        });
      });
    });
  }

  function loadEntry(id) {
    MateyVots.getEntry(id).then(function (entry) {
      if (!entry) return;
      _currentEntryId = id;
      _currentLink = entry.link;
      _currentLinkType = MateyVots.detectLinkType(entry.link || '');
      _currentTags = entry.tags ? entry.tags.slice() : [];
      _currentAttachments = entry.attachments ? entry.attachments.slice() : [];

      // Parse headline back into form fields
      var parts = (entry.headline || '').split(' ');
      var whoInput = $('vts-headline-who');
      var aboutInput = $('vts-headline-about');
      if (whoInput) whoInput.value = parts[0] || '';
      if (aboutInput) aboutInput.value = parts.slice(2).join(' ') || '';

      // Try to match verb
      var verbFound = '';
      if (parts[1]) {
        ACTION_VERBS.forEach(function (v) {
          if (v === parts[1]) verbFound = v;
        });
      }
      _selectedVerb = verbFound;

      updateLinkCard();
      showEditor();
    });
  }

  /* ==================== Save Entry ==================== */
  function saveEntry() {
    var who = $('vts-headline-who') ? $('vts-headline-who').value.trim() : '';
    var about = $('vts-headline-about') ? $('vts-headline-about').value.trim() : '';
    var content = $('vts-entry-content') ? $('vts-entry-content').value.trim() : '';

    var headline = assembleHeadline(who, _selectedVerb, about);
    if (!headline) {
      showToast('Please fill in the headline');
      return;
    }
    if (!_currentLink) {
      showToast('Missing source link');
      return;
    }

    var data = {
      link: _currentLink,
      domain: MateyVots.getDomain(_currentLink),
      linkType: _currentLinkType ? _currentLinkType.type : 'article',
      headline: headline,
      title: headline,
      content: content,
      tags: _currentTags.slice(),
      attachments: _currentAttachments.slice()
    };

    var promise;
    if (_currentEntryId) {
      promise = MateyVots.updateEntry(_currentEntryId, data);
    } else {
      promise = MateyVots.createEntry(data);
    }
    promise.then(function () {
      showToast('Entry saved');
      flashSaveFeedback();
      resetEditor();
      showHistory();
    }).catch(function (err) {
      console.error('[VOTS] save failed:', err);
      showToast('Save failed');
    });
  }

  /* Lightweight visual confirmation that a manual save committed */
  function flashSaveFeedback() {
    var btn = $('vts-save-entry-btn');
    if (!btn) return;
    if (btn._saveFlashTimer) clearTimeout(btn._saveFlashTimer);
    var original = btn.textContent;
    btn.textContent = 'Saved!';
    btn.style.opacity = '0.5';
    btn._saveFlashTimer = setTimeout(function () {
      btn.textContent = original;
      btn.style.opacity = '1';
      btn._saveFlashTimer = null;
    }, 900);
  }

  function resetEditor() {
    _currentEntryId = null;
    _currentLink = null;
    _currentLinkType = null;
    _selectedVerb = '';
    _currentTags = [];
    _currentAttachments = [];
    var whoInput = $('vts-headline-who');
    var aboutInput = $('vts-headline-about');
    var contentInput = $('vts-entry-content');
    if (whoInput) whoInput.value = '';
    if (aboutInput) aboutInput.value = '';
    if (contentInput) contentInput.value = '';
    document.querySelectorAll('.vts-verb-chip').forEach(function (c) {
      c.classList.remove('vts-verb-chip-active');
    });
    var card = $('vts-link-card');
    if (card) card.style.display = 'none';
  }

  /* ==================== Debounce ==================== */
  function debounce(fn, ms) {
    var timer;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /* ==================== Init ==================== */
  function init() {
    /* Cached tab switch: skip when the VOTS region was swapped away —
       the DOMContentLoaded re-dispatch must not crash on missing nodes. */
    if (!document.getElementById('vts-landing')) return;
    // Check lock state
    MateyLock.isLocked(NAMESPACE).then(function (locked) {
      if (locked) {
        showLockScreen();
      } else {
        showMain();
      }
    });

    // Start auto-lock watcher
    MateyLock.startAutoLockWatcher(NAMESPACE, function () {
      showLockScreen();
    });

    // Lock screen events
    $('vts-unlock-btn').addEventListener('click', tryUnlockPin);
    $('vts-setup-lock-btn').addEventListener('click', trySetupPin);
    $('vts-pin-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var isSetup = $('vts-lock-mode-setup').style.display !== 'none';
        if (isSetup) trySetupPin();
        else tryUnlockPin();
      }
    });
    $('vts-setup-pattern-btn').addEventListener('click', openPatternSetup);
    $('vts-unlock-pattern-btn').addEventListener('click', openPatternUnlock);

    // Link gate
    initLinkGate();

    // Headline form
    initHeadlineForm();

    // Editor buttons
    $('vts-save-entry-btn').addEventListener('click', function () {
      saveEntry();
    });
    $('vts-back-to-landing').addEventListener('click', function () {
      showConfirm('Discard entry?', 'Your current entry will be lost.', function () {
        resetEditor();
        showMain();
      });
    });
    $('vts-confirm-cancel').addEventListener('click', function () { hideOverlay('vts-confirm'); });
    $('vts-confirm-ok').addEventListener('click', function () { hideOverlay('vts-confirm'); });

    // Double-stack keyboard + mic toolbar (mirrors journal's md-composer).
    // The toolbar injects both symbol keyboard and a mic button bound to matey-mic.js.
    if (window.MateyToolbar && typeof window.MateyToolbar.init === 'function') {
      window.MateyToolbar.init('vots', '#vots-composer.vots-toolbar');
    }

    // Listen for lock events
    MateyLock.onLockChange(function (event, ns) {
      if (ns === NAMESPACE && (event === 'locked' || event === 'autoLocked')) {
        showLockScreen();
      }
    });

    // Listen for data changes
    MateyVots.onVotsChange(function () {
      if ($('vts-history').style.display !== 'none') {
        renderHistory();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* Matey Journal — three-tier local-first journaling
 *
 * Tiers: Library → Entry List → Entry Editor
 * Storage: IndexedDB (matey-journal) with journals, entries, media stores
 * Privacy: PIN-hashed lock via MateyAppLock, auto-lock on background
 */
(function () {
  'use strict';

  var DB_NAME = 'matey-journal';
  var DB_VERSION = 2;
  var STORE_JOURNALS = 'journals';
  var STORE_ENTRIES = 'entries';
  var STORE_MEDIA = 'media';
  var STORE_SETTINGS = 'settings';

  var _db = null;
  var _listeners = [];

  /* ==================== UUID ==================== */
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /* ==================== IndexedDB ==================== */
  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_JOURNALS)) {
          db.createObjectStore(STORE_JOURNALS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
          var es = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
          es.createIndex('journalId', 'journalId', { unique: false });
          es.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };
      req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function tx(store, mode) {
    return openDB().then(function (db) {
      return db.transaction(store, mode).objectStore(store);
    });
  }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function txDone(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function () { reject(transaction.error); };
      transaction.onabort = function () { reject(transaction.error || new Error('tx aborted')); };
    });
  }

  /* ==================== Journal CRUD ==================== */
  function createJournal(name, coverStyle) {
    var journal = {
      id: uuid(),
      name: name || 'Untitled Journal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      coverStyle: coverStyle || '--journal-cover-1'
    };
    return tx(STORE_JOURNALS, 'readwrite').then(function (store) {
      return reqToPromise(store.put(journal));
    }).then(function () {
      notifyListeners('journalsChanged');
      return journal;
    });
  }

  function getJournal(id) {
    return tx(STORE_JOURNALS, 'readonly').then(function (store) {
      return reqToPromise(store.get(id));
    });
  }

  function getAllJournals() {
    return tx(STORE_JOURNALS, 'readonly').then(function (store) {
      return reqToPromise(store.getAll());
    });
  }

  function updateJournal(id, updates) {
    return getJournal(id).then(function (journal) {
      if (!journal) return null;
      Object.keys(updates).forEach(function (k) { journal[k] = updates[k]; });
      journal.updatedAt = new Date().toISOString();
      return tx(STORE_JOURNALS, 'readwrite').then(function (store) {
        return reqToPromise(store.put(journal));
      }).then(function () {
        notifyListeners('journalsChanged');
        return journal;
      });
    });
  }

  function deleteJournal(id) {
    return openDB().then(function (db) {
      var t = db.transaction([STORE_JOURNALS, STORE_ENTRIES, STORE_MEDIA], 'readwrite');
      t.objectStore(STORE_JOURNALS).delete(id);
      var idx = t.objectStore(STORE_ENTRIES).index('journalId');
      var req = idx.openCursor(IDBKeyRange.only(id));
      req.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          var entry = cursor.value;
          if (entry.photos) entry.photos.forEach(function (m) { t.objectStore(STORE_MEDIA).delete(m.id); });
          if (entry.voiceNotes) entry.voiceNotes.forEach(function (m) { t.objectStore(STORE_MEDIA).delete(m.id); });
          cursor.delete();
          cursor.continue();
        }
      };
      return txDone(t);
    }).then(function () {
      notifyListeners('journalsChanged');
      notifyListeners('entriesChanged');
    });
  }

  function getEntryCount(journalId) {
    return tx(STORE_ENTRIES, 'readonly').then(function (store) {
      var idx = store.index('journalId');
      return reqToPromise(idx.count(journalId));
    });
  }

  /* ==================== Entry CRUD ==================== */
  function createEntry(journalId, data) {
    var entry = {
      id: uuid(),
      journalId: journalId,
      title: data.title || '',
      body: data.body || '',
      mood: data.mood || null,
      tags: data.tags || [],
      photos: data.photos || [],
      voiceNotes: data.voiceNotes || [],
      location: data.location || '',
      fontChoice: data.fontChoice || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return tx(STORE_ENTRIES, 'readwrite').then(function (store) {
      return reqToPromise(store.put(entry));
    }).then(function () {
      return updateJournal(journalId, { updatedAt: new Date().toISOString() });
    }).then(function () {
      notifyListeners('entriesChanged');
      return entry;
    });
  }

  function getEntry(id) {
    return tx(STORE_ENTRIES, 'readonly').then(function (store) {
      return reqToPromise(store.get(id));
    });
  }

  function getEntriesByJournal(journalId) {
    return tx(STORE_ENTRIES, 'readonly').then(function (store) {
      var idx = store.index('journalId');
      return reqToPromise(idx.getAll(journalId));
    }).then(function (entries) {
      entries.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      return entries;
    });
  }

  function updateEntry(id, updates) {
    return getEntry(id).then(function (entry) {
      if (!entry) return null;
      Object.keys(updates).forEach(function (k) { entry[k] = updates[k]; });
      entry.updatedAt = new Date().toISOString();
      return tx(STORE_ENTRIES, 'readwrite').then(function (store) {
        return reqToPromise(store.put(entry));
      }).then(function () {
        notifyListeners('entriesChanged');
        return entry;
      });
    });
  }

  function deleteEntry(id) {
    return getEntry(id).then(function (entry) {
      if (!entry) return;
      return openDB().then(function (db) {
        var t = db.transaction([STORE_ENTRIES, STORE_MEDIA], 'readwrite');
        t.objectStore(STORE_ENTRIES).delete(id);
        if (entry.photos) entry.photos.forEach(function (m) { t.objectStore(STORE_MEDIA).delete(m.id); });
        if (entry.voiceNotes) entry.voiceNotes.forEach(function (m) { t.objectStore(STORE_MEDIA).delete(m.id); });
        return txDone(t);
      }).then(function () {
        notifyListeners('entriesChanged');
      });
    });
  }

  /* ==================== Media (Blobs) ==================== */
  function saveMedia(blob, meta) {
    var media = {
      id: uuid(),
      blob: blob,
      type: blob.type,
      size: blob.size,
      name: meta && meta.name || '',
      duration: meta && meta.duration || 0,
      createdAt: new Date().toISOString()
    };
    return tx(STORE_MEDIA, 'readwrite').then(function (store) {
      return reqToPromise(store.put(media));
    }).then(function () { return media; });
  }

  function getMedia(id) {
    return tx(STORE_MEDIA, 'readonly').then(function (store) {
      return reqToPromise(store.get(id));
    });
  }

  function getMediaBlob(id) {
    return getMedia(id).then(function (m) { return m ? m.blob : null; });
  }

  function deleteMedia(id) {
    return tx(STORE_MEDIA, 'readwrite').then(function (store) {
      return reqToPromise(store.delete(id));
    });
  }

  /* ==================== Search ==================== */
  function searchEntries(journalId, query) {
    var q = (query || '').toLowerCase().trim();
    if (!q) return getEntriesByJournal(journalId);
    return getEntriesByJournal(journalId).then(function (entries) {
      return entries.filter(function (e) {
        return (e.title && e.title.toLowerCase().indexOf(q) !== -1) ||
               (e.body && e.body.toLowerCase().indexOf(q) !== -1) ||
               (e.tags && e.tags.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; })) ||
               (e.location && e.location.toLowerCase().indexOf(q) !== -1);
      });
    });
  }

  /* ==================== Tags ==================== */
  function getAllTags(journalId) {
    return getEntriesByJournal(journalId).then(function (entries) {
      var tagSet = {};
      entries.forEach(function (e) {
        if (e.tags) e.tags.forEach(function (t) { tagSet[t] = true; });
      });
      return Object.keys(tagSet).sort();
    });
  }

  /* ==================== Settings (IndexedDB) ==================== */
  function getSetting(key, fallback) {
    return tx(STORE_SETTINGS, 'readonly').then(function (store) {
      return reqToPromise(store.get(key)).then(function (r) { return r ? r.value : fallback; });
    });
  }

  function setSetting(key, value) {
    return tx(STORE_SETTINGS, 'readwrite').then(function (store) {
      return reqToPromise(store.put({ key: key, value: value }));
    });
  }

  function getSettings() {
    return Promise.all([
      getSetting('autoLockMs', 30000),
      getSetting('journalPinHash', null),
      getSetting('journalPinSalt', null)
    ]).then(function (r) {
      return { autoLockMs: r[0], pinHash: r[1], pinSalt: r[2] };
    });
  }

  function saveSettings(settings) {
    var promises = [];
    if (typeof settings.autoLockMs !== 'undefined') {
      promises.push(setSetting('autoLockMs', settings.autoLockMs));
    }
    if (typeof settings.pinHash !== 'undefined') {
      promises.push(setSetting('journalPinHash', settings.pinHash));
    }
    if (typeof settings.pinSalt !== 'undefined') {
      promises.push(setSetting('journalPinSalt', settings.pinSalt));
    }
    return Promise.all(promises).then(function () {
      notifyListeners('settingsChanged');
    });
  }

  /* ==================== Lock (IndexedDB PIN, no localStorage) ==================== */
  function hashPin(pin, salt) {
    var enc = new TextEncoder();
    var data = enc.encode(pin + salt);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      var arr = Array.from(new Uint8Array(buf));
      return arr.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  function generateSalt() {
    var arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function isLockEnabled() {
    return getSetting('journalPinHash', null).then(function (h) { return !!h; });
  }

  function isLocked() {
    return isLockEnabled().then(function (enabled) {
      if (!enabled) return false;
      return !_unlocked;
    });
  }

  function setPin(pin) {
    var salt = generateSalt();
    return hashPin(pin, salt).then(function (pinHash) {
      return saveSettings({ pinHash: pinHash, pinSalt: salt }).then(function () {
        _unlocked = true;
        notifyListeners('unlocked');
      });
    });
  }

  function verifyPin(pin) {
    return Promise.all([getSetting('journalPinHash', null), getSetting('journalPinSalt', null)]).then(function (r) {
      var pinHash = r[0], salt = r[1];
      if (!pinHash || !salt) return false;
      return hashPin(pin, salt).then(function (inputHash) { return inputHash === pinHash; });
    });
  }

  function unlockJournal(pin) {
    return verifyPin(pin).then(function (ok) {
      if (ok) {
        _unlocked = true;
        notifyListeners('unlocked');
        return true;
      }
      return false;
    });
  }

  function lockJournal() {
    _unlocked = false;
    notifyListeners('locked');
  }

  var _unlocked = false;

  /* ==================== Auto-lock ==================== */
  var _backgroundTime = null;
  var _autoLockTimer = null;

  function startAutoLockWatcher() {
    /* Guard: the DOMContentLoaded re-dispatch (cached tab swap) re-runs
       init() — never add a second visibilitychange watcher. */
    if (startAutoLockWatcher._wired) return;
    startAutoLockWatcher._wired = true;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        _backgroundTime = Date.now();
        isLockEnabled().then(function (enabled) {
          if (!enabled) return;
          getSetting('autoLockMs', 30000).then(function (ms) {
            _autoLockTimer = setTimeout(function () {
              lockJournal();
              notifyListeners('autoLocked');
            }, ms);
          });
        });
      } else {
        if (_autoLockTimer) { clearTimeout(_autoLockTimer); _autoLockTimer = null; }
        _backgroundTime = null;
      }
    });
  }

  /* ==================== Events ==================== */
  function notifyListeners(event) {
    _listeners.forEach(function (fn) { fn(event); });
  }

  function onJournalChange(fn) {
    if (_listeners.indexOf(fn) === -1) _listeners.push(fn);
  }

  /* ==================== Init ==================== */
  function init() {
    openDB().catch(function (e) { console.error('[MateyJournal] DB init failed:', e); });
    startAutoLockWatcher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ==================== Public API ==================== */
  window.MateyJournal = {
    /* Journals */
    createJournal: createJournal,
    getJournal: getJournal,
    getAllJournals: getAllJournals,
    updateJournal: updateJournal,
    deleteJournal: deleteJournal,
    getEntryCount: getEntryCount,

    /* Entries */
    createEntry: createEntry,
    getEntry: getEntry,
    getEntriesByJournal: getEntriesByJournal,
    updateEntry: updateEntry,
    deleteEntry: deleteEntry,

    /* Media */
    saveMedia: saveMedia,
    getMedia: getMedia,
    getMediaBlob: getMediaBlob,
    deleteMedia: deleteMedia,

    /* Search */
    searchEntries: searchEntries,
    getAllTags: getAllTags,

    /* Settings */
    getSettings: getSettings,
    saveSettings: saveSettings,

    /* Lock */
    isLockEnabled: isLockEnabled,
    isLocked: isLocked,
    lockJournal: lockJournal,
    unlockJournal: unlockJournal,

    /* Events */
    onJournalChange: onJournalChange,

    /* Utils */
    uuid: uuid
  };
})();

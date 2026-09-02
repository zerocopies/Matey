/* Matey VOTS — My-VOTS: link-gated private journaling with media embedding
 *
 * Storage: IndexedDB (matey-vots) with entries, media, settings stores
 * Lock: uses MateyLock namespace 'vots'
 * Privacy: 100% local — zero network calls, zero cloud sync
 *
 * Legacy migration: reads localStorage['matey-vots-encrypted'] and
 * localStorage['matey-vots-lock'], converts plaintext PIN to SHA-256 hash,
 * writes entries to IndexedDB, then purges legacy keys.
 */
(function () {
  'use strict';

  var DB_NAME = 'matey-vots';
  var DB_VERSION = 1;
  var STORE_ENTRIES = 'entries';
  var STORE_MEDIA = 'media';
  var STORE_SETTINGS = 'settings';
  var LEGACY_DATA_KEY = 'matey-vots-encrypted';
  var LEGACY_LOCK_KEY = 'matey-vots-lock';
  var NAMESPACE = 'vots';

  var _db = null;
  var _listeners = [];
  var _migrationDone = false;

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
        if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
          var es = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
          es.createIndex('linkType', 'linkType', { unique: false });
          es.createIndex('timestamp', 'timestamp', { unique: false });
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

  /* ==================== Legacy Migration ==================== */
  function migrateLegacyLocalStorage() {
    if (_migrationDone) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        var legacyData = localStorage.getItem(LEGACY_DATA_KEY);
        var legacyLock = localStorage.getItem(LEGACY_LOCK_KEY);
        if (!legacyData && !legacyLock) {
          resolve(false);
          return;
        }

        var lockConfig = null;
        try { lockConfig = JSON.parse(legacyLock || 'null'); } catch (e) { lockConfig = null; }

        // If there's a plaintext PIN, hash it and store in IndexedDB
        if (lockConfig && lockConfig.pin) {
          var salt = generateSalt();
          hashPin(lockConfig.pin, salt).then(function (pinHash) {
            return setSetting('pinHash', pinHash).then(function () {
              return setSetting('pinSalt', salt);
            });
          }).then(function () {
            return finishMigration(legacyData);
          }).then(function (migrated) {
            resolve(migrated);
          }).catch(function () {
            resolve(false);
          });
        } else {
          finishMigration(legacyData).then(function (migrated) {
            resolve(migrated);
          }).catch(function () {
            resolve(false);
          });
        }
      } catch (e) {
        resolve(false);
      }
    });
  }

  function finishMigration(legacyData) {
    return new Promise(function (resolve) {
      try {
        var data = JSON.parse(legacyData || '{"entries":[]}');
        var entries = data.entries || [];
        if (!entries.length) {
          purgeLegacy();
          _migrationDone = true;
          resolve(false);
          return;
        }

        var t = openDB().then(function (db) {
          var tx = db.transaction([STORE_ENTRIES, STORE_SETTINGS], 'readwrite');
          var entryStore = tx.objectStore(STORE_ENTRIES);
          entries.forEach(function (entry) {
            entryStore.put(entry);
          });
          return txDone(tx);
        }).then(function () {
          purgeLegacy();
          _migrationDone = true;
          notifyListeners('migrated');
          resolve(true);
        }).catch(function () {
          resolve(false);
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  function purgeLegacy() {
    try { localStorage.removeItem(LEGACY_DATA_KEY); } catch (e) {}
    try { localStorage.removeItem(LEGACY_LOCK_KEY); } catch (e) {}
    try { localStorage.removeItem('matey-vots-link-draft'); } catch (e) {}
    try { localStorage.removeItem('matey-vots-title-draft'); } catch (e) {}
    try { localStorage.removeItem('matey-vots-text-draft'); } catch (e) {}
    try { localStorage.removeItem('matey-vots-view'); } catch (e) {}
    try { localStorage.removeItem('matey-vots-incognito'); } catch (e) {}
    try { localStorage.removeItem('matey-vots-temp'); } catch (e) {}
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

  /* ==================== Settings ==================== */
  function getSetting(key, fallback) {
    var fullKey = NAMESPACE + ':' + key;
    return tx(STORE_SETTINGS, 'readonly').then(function (store) {
      return reqToPromise(store.get(fullKey)).then(function (r) { return r ? r.value : fallback; });
    });
  }

  function setSetting(key, value) {
    var fullKey = NAMESPACE + ':' + key;
    return tx(STORE_SETTINGS, 'readwrite').then(function (store) {
      return reqToPromise(store.put({ key: fullKey, value: value }));
    });
  }

  /* ==================== Entry CRUD ==================== */
  function createEntry(data) {
    var entry = {
      id: uuid(),
      link: data.link || '',
      domain: data.domain || '',
      linkType: data.linkType || 'article',
      headline: data.headline || '',
      title: data.title || '',
      content: data.content || '',
      tags: data.tags || [],
      attachments: data.attachments || [],
      timestamp: Date.now(),
      updatedAt: Date.now()
    };
    return tx(STORE_ENTRIES, 'readwrite').then(function (store) {
      return reqToPromise(store.put(entry));
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

  function getAllEntries() {
    return tx(STORE_ENTRIES, 'readonly').then(function (store) {
      return reqToPromise(store.getAll());
    }).then(function (entries) {
      entries.sort(function (a, b) { return b.timestamp - a.timestamp; });
      return entries;
    });
  }

  function updateEntry(id, updates) {
    return getEntry(id).then(function (entry) {
      if (!entry) return null;
      Object.keys(updates).forEach(function (k) { entry[k] = updates[k]; });
      entry.updatedAt = Date.now();
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
        if (entry.attachments) {
          entry.attachments.forEach(function (a) {
            if (a.mediaId) t.objectStore(STORE_MEDIA).delete(a.mediaId);
          });
        }
        return txDone(t);
      }).then(function () {
        notifyListeners('entriesChanged');
      });
    });
  }

  function deleteAllEntries() {
    return getAllEntries().then(function (entries) {
      var t = openDB().then(function (db) {
        var tx = db.transaction([STORE_ENTRIES, STORE_MEDIA], 'readwrite');
        var entryStore = tx.objectStore(STORE_ENTRIES);
        var mediaStore = tx.objectStore(STORE_MEDIA);
        entries.forEach(function (entry) {
          entryStore.delete(entry.id);
          if (entry.attachments) {
            entry.attachments.forEach(function (a) {
              if (a.mediaId) mediaStore.delete(a.mediaId);
            });
          }
        });
        return txDone(tx);
      }).then(function () {
        notifyListeners('entriesChanged');
      });
    });
  }

  /* ==================== Search ==================== */
  function searchEntries(query) {
    var q = (query || '').toLowerCase().trim();
    if (!q) return getAllEntries();
    return getAllEntries().then(function (entries) {
      return entries.filter(function (e) {
        return (e.title && e.title.toLowerCase().indexOf(q) !== -1) ||
               (e.content && e.content.toLowerCase().indexOf(q) !== -1) ||
               (e.headline && e.headline.toLowerCase().indexOf(q) !== -1) ||
               (e.tags && e.tags.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; })) ||
               (e.domain && e.domain.toLowerCase().indexOf(q) !== -1);
      });
    });
  }

  /* ==================== Tags ==================== */
  function getAllTags() {
    return getAllEntries().then(function (entries) {
      var tagSet = {};
      entries.forEach(function (e) {
        if (e.tags) e.tags.forEach(function (t) { tagSet[t] = true; });
      });
      return Object.keys(tagSet).sort();
    });
  }

  /* ==================== Link Type Detection (100% local) ==================== */
  var TWITTER_HOSTS = ['twitter.com', 'x.com', 'mobile.twitter.com', 'm.twitter.com'];
  var YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'm.youtube.com', 'www.youtube.com'];

  function detectLinkType(url) {
    try {
      var hostname = new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return { type: 'article', label: 'Article/Website', icon: 'article' };
    }
    if (TWITTER_HOSTS.indexOf(hostname) !== -1) {
      return { type: 'twitter', label: 'Tweet / X Post', icon: 'twitter' };
    }
    if (YOUTUBE_HOSTS.indexOf(hostname) !== -1) {
      return { type: 'youtube', label: 'YouTube Video', icon: 'youtube' };
    }
    return { type: 'article', label: 'Article / Website', icon: 'article' };
  }

  function getDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
  }

  /* ==================== Media ==================== */
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

  function getMediaBlob(id) {
    return tx(STORE_MEDIA, 'readonly').then(function (store) {
      return reqToPromise(store.get(id));
    }).then(function (m) { return m ? m.blob : null; });
  }

  /* ==================== Events ==================== */
  function notifyListeners(event) {
    _listeners.forEach(function (fn) { fn(event); });
  }

  function onVotsChange(fn) {
    if (_listeners.indexOf(fn) === -1) _listeners.push(fn);
  }

  /* ==================== Init ==================== */
  function init() {
    openDB().then(function () {
      return migrateLegacyLocalStorage();
    }).then(function (migrated) {
      if (migrated) {
        console.log('[MateyVots] Legacy localStorage data migrated to IndexedDB');
      }
    }).catch(function (e) {
      console.error('[MateyVots] Init failed:', e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ==================== Public API ==================== */
  window.MateyVots = {
    /* Migration */
    migrateLegacyLocalStorage: migrateLegacyLocalStorage,
    isMigrationDone: function () { return _migrationDone; },

    /* Entries */
    createEntry: createEntry,
    getEntry: getEntry,
    getAllEntries: getAllEntries,
    updateEntry: updateEntry,
    deleteEntry: deleteEntry,
    deleteAllEntries: deleteAllEntries,
    searchEntries: searchEntries,
    getAllTags: getAllTags,

    /* Media */
    saveMedia: saveMedia,
    getMediaBlob: getMediaBlob,

    /* Link parsing */
    detectLinkType: detectLinkType,
    getDomain: getDomain,

    /* Events */
    onVotsChange: onVotsChange
  };
})();

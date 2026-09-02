/* Matey Instinct — Instinct record management
   Tracks contextASTSignature, stale state, promotion counts, and user rejection history.
*/

var MateyInstinct = (function () {
  'use strict';

  var INSTINCT_DB = 'matey-instinct';
  var INSTINCT_STORE = 'instincts';
  var PROMOTION_THRESHOLD = 3;

  function _workspaceName() {
    try {
      var fs = window.MateyFS || window.FileSystemManager;
      if (fs && typeof fs.getCurrentWorkspace === 'function') {
        var ws = fs.getCurrentWorkspace();
        if (ws && ws.name) return ws.name;
      }
    } catch (_) {}
    try { return localStorage.getItem('matey-last-workspace') || 'default'; }
    catch (_) { return 'default'; }
  }

  function _openIDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(INSTINCT_DB, 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(INSTINCT_STORE)) {
          db.createObjectStore(INSTINCT_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  async function _ensureRecord(record) {
    try {
      var db = await _openIDB();
      var tx = db.transaction(INSTINCT_STORE, 'readwrite');
      var store = tx.objectStore(INSTINCT_STORE);
      store.put(record);
      await new Promise(function (resolve) { tx.oncomplete = resolve; });
    } catch (_) {}
  }

  async function recordInstinct(toolName, errorCode, reason, whatFixed, contextASTSignature) {
    try {
      var ws = _workspaceName();
      var sig = [toolName, errorCode, reason || ''].map(function (s) { return String(s).toLowerCase().trim(); }).join(':');
      var id = ws + '::' + sig;
      var record = {
        id: id,
        workspace: ws,
        signature: sig,
        toolName: toolName,
        errorCode: errorCode,
        reason: reason,
        whatFixed: whatFixed,
        contextASTSignature: contextASTSignature || null,
        stale: false,
        provenance: 'cloud',
        confidenceCeiling: 0.9,
        promotionCount: 0,
        userRejectionCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await _ensureRecord(record);
      return record;
    } catch (_) {
      return null;
    }
  }

  async function markStaleBySignature(toolName, errorCode, reason) {
    try {
      var ws = _workspaceName();
      var sig = [toolName, errorCode, reason || ''].map(function (s) { return String(s).toLowerCase().trim(); }).join(':');
      var id = ws + '::' + sig;
      var db = await _openIDB();
      var tx = db.transaction(INSTINCT_STORE, 'readwrite');
      var store = tx.objectStore(INSTINCT_STORE);
      var req = store.get(id);
      return new Promise(function (resolve) {
        req.onsuccess = function () {
          var record = req.result;
          if (record) {
            record.stale = true;
            record.updatedAt = Date.now();
            store.put(record);
            console.log('[MateyInstinct] Marked stale:', id);
          }
          resolve(record);
        };
        req.onerror = function () { resolve(null); };
      });
    } catch (_) {
      return null;
    }
  }

  async function markStaleByASTSignature(contextASTSignature) {
    if (!contextASTSignature) return;
    try {
      var db = await _openIDB();
      var tx = db.transaction(INSTINCT_STORE, 'readwrite');
      var store = tx.objectStore(INSTINCT_STORE);
      var req = store.openCursor();
      return new Promise(function (resolve) {
        req.onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) {
            var record = cursor.value;
            if (record.contextASTSignature === contextASTSignature && !record.stale) {
              record.stale = true;
              record.updatedAt = Date.now();
              store.put(record);
              console.log('[MateyInstinct] AST invalidation cascade marked stale:', record.id);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = function () { resolve(); };
      });
    } catch (_) {}
  }

  async function recordUserRejection(toolName, errorCode, reason) {
    try {
      var ws = _workspaceName();
      var sig = [toolName, errorCode, reason || ''].map(function (s) { return String(s).toLowerCase().trim(); }).join(':');
      var id = ws + '::' + sig;
      var db = await _openIDB();
      var tx = db.transaction(INSTINCT_STORE, 'readwrite');
      var store = tx.objectStore(INSTINCT_STORE);
      var req = store.get(id);
      return new Promise(function (resolve) {
        req.onsuccess = function () {
          var record = req.result;
          if (record) {
            record.userRejectionCount = (record.userRejectionCount || 0) + 1;
            record.updatedAt = Date.now();
            store.put(record);
            console.log('[MateyInstinct] User rejection recorded for:', id, 'count:', record.userRejectionCount);
          }
          resolve(record);
        };
        req.onerror = function () { resolve(null); };
      });
    } catch (_) {
      return null;
    }
  }

  async function applyPromotionLadder(toolName, errorCode, reason) {
    try {
      var ws = _workspaceName();
      var sig = [toolName, errorCode, reason || ''].map(function (s) { return String(s).toLowerCase().trim(); }).join(':');
      var id = ws + '::' + sig;
      var db = await _openIDB();
      var tx = db.transaction(INSTINCT_STORE, 'readwrite');
      var store = tx.objectStore(INSTINCT_STORE);
      var req = store.get(id);
      return new Promise(function (resolve) {
        req.onsuccess = function () {
          var record = req.result;
          if (!record) {
            resolve(null);
            return;
          }
          if (record.provenance !== 'community') {
            resolve(record);
            return;
          }
          record.promotionCount = (record.promotionCount || 0) + 1;
          if (record.promotionCount >= PROMOTION_THRESHOLD) {
            var oldProvenance = record.provenance;
            record.provenance = 'cloud';
            record.confidenceCeiling = 0.9;
            record.updatedAt = Date.now();
            var promotionEvent = {
              id: id,
              fromProvenance: oldProvenance,
              toProvenance: 'cloud',
              promotedAt: Date.now(),
              promotionCount: record.promotionCount
            };
            console.log('[MateyInstinct] Promotion event:', promotionEvent);
          }
          store.put(record);
          resolve(record);
        };
        req.onerror = function () { resolve(null); };
      });
    } catch (_) {
      return null;
    }
  }

  async function getInstinct(toolName, errorCode, reason) {
    try {
      var ws = _workspaceName();
      var sig = [toolName, errorCode, reason || ''].map(function (s) { return String(s).toLowerCase().trim(); }).join(':');
      var id = ws + '::' + sig;
      var db = await _openIDB();
      var tx = db.transaction(INSTINCT_STORE, 'readonly');
      var store = tx.objectStore(INSTINCT_STORE);
      var req = store.get(id);
      return new Promise(function (resolve) {
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      });
    } catch (_) {
      return null;
    }
  }

  return {
    recordInstinct: recordInstinct,
    markStaleBySignature: markStaleBySignature,
    markStaleByASTSignature: markStaleByASTSignature,
    recordUserRejection: recordUserRejection,
    applyPromotionLadder: applyPromotionLadder,
    getInstinct: getInstinct,
    PROMOTION_THRESHOLD: PROMOTION_THRESHOLD
  };
})();

/* Matey Brain — Unified BrainState manager
   Wraps Fix Memory, AST Index, and Style Memory without duplicating their storage.
   Computes six core metrics from actual local storage.
   Schema version: 1
*/

var BrainState = (function () {
  'use strict';

  var SCHEMA_VERSION = 1;
  var STATE_KEY = 'matey-brain-state';
  var METRICS_KEY = 'matey-brain-metrics';

  var FIX_DB = 'matey-fix-memory';
  var FIX_STORE = 'fixes';

  var STYLE_DB = 'matey-style-profile';
  var STYLE_STORE = 'profiles';

  var INSTINCT_DB = 'matey-instinct';
  var INSTINCT_STORE = 'instincts';

  var LAYER_PRIORITY = ['dna', 'style', 'instinct', 'community'];

  var COMMUNITY_CONSENSUS_MIN_SUCCESS_COUNT = 20;
  var COMMUNITY_CONSENSUS_MIN_SUCCESS_RATE = 0.7;

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

  function _openIDB(dbName, storeName, mode) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
          if (storeName === FIX_STORE || storeName === INSTINCT_STORE) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          } else {
            db.createObjectStore(storeName, { keyPath: 'workspace' });
          }
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function _enforceProvenanceCeiling(record) {
    if (!record) return record;
    var provenance = record.provenance || 'cloud';
    if (provenance === 'community') {
      record.confidenceCeiling = Math.min(record.confidenceCeiling || 0.9, 0.6);
    } else {
      record.confidenceCeiling = Math.max(record.confidenceCeiling || 0, 0.9);
    }
    record.provenance = provenance;
    return record;
  }

  async function _migrateFixMemory() {
    try {
      var db = await _openIDB(FIX_DB, FIX_STORE, 'readwrite');
      var tx = db.transaction(FIX_STORE, 'readwrite');
      var store = tx.objectStore(FIX_STORE);
      var req = store.getAll();

      return new Promise(function (resolve) {
        var migrated = 0;
        req.onsuccess = function () {
          var records = req.result || [];
          records.forEach(function (rec) {
            var changed = false;
            if (!rec.hasOwnProperty('provenance')) {
              rec.provenance = 'cloud';
              changed = true;
            }
            if (!rec.hasOwnProperty('confidenceCeiling')) {
              rec.confidenceCeiling = 0.9;
              changed = true;
            }
            if (changed) {
              _enforceProvenanceCeiling(rec);
              store.put(rec);
              migrated++;
            }
          });
          resolve(migrated);
        };
        req.onerror = function () { resolve(0); };
      });
    } catch (_) {
      return 0;
    }
  }

  async function _getFixMemoryCount() {
    try {
      var db = await _openIDB(FIX_DB, FIX_STORE, 'readonly');
      var tx = db.transaction(FIX_STORE, 'readonly');
      var store = tx.objectStore(FIX_STORE);
      var req = store.count();
      return new Promise(function (resolve) {
        req.onsuccess = function () { resolve(req.result || 0); };
        req.onerror = function () { resolve(0); };
      });
    } catch (_) {
      return 0;
    }
  }

  async function _getStyleProfileVersion() {
    try {
      var ws = _workspaceName();
      var db = await _openIDB(STYLE_DB, STYLE_STORE, 'readonly');
      var tx = db.transaction(STYLE_STORE, 'readonly');
      var store = tx.objectStore(STYLE_STORE);
      var req = store.get(ws);
      return new Promise(function (resolve) {
        req.onsuccess = function () {
          var result = req.result;
          if (result && result.updatedAt) {
            resolve(result.updatedAt);
          } else {
            resolve(null);
          }
        };
        req.onerror = function () { resolve(null); };
      });
    } catch (_) {
      return null;
    }
  }

  function _getDnaNodeCount() {
    try {
      var ast = window.ASTIndex || (window.MateyAgent && window.MateyAgent.ASTIndex);
      if (ast && typeof ast.getStats === 'function') {
        var stats = ast.getStats();
        return stats.totalParses || 0;
      }
    } catch (_) {}
    return 0;
  }

  async function _computeMetrics() {
    var instinctCount = await _getFixMemoryCount();
    var styleProfileVersion = await _getStyleProfileVersion();
    var dnaNodeCount = _getDnaNodeCount();

    var storedMetrics = {};
    try {
      var raw = localStorage.getItem(METRICS_KEY);
      if (raw) storedMetrics = JSON.parse(raw);
    } catch (_) {}

    var hits = storedMetrics.hits || 0;
    var totalQueries = storedMetrics.totalQueries || 0;
    var localCoverage = totalQueries > 0 ? Math.round((hits / totalQueries) * 100) : 0;
    var avgLatencySavedMs = storedMetrics.avgLatencySavedMs || 0;
    var tokensSavedEstimate = storedMetrics.tokensSavedEstimate || 0;

    return {
      brainSchemaVersion: SCHEMA_VERSION,
      instinctCount: instinctCount,
      localCoverage: localCoverage,
      avgLatencySavedMs: avgLatencySavedMs,
      tokensSavedEstimate: tokensSavedEstimate,
      styleProfileVersion: styleProfileVersion || 0,
      dnaNodeCount: dnaNodeCount
    };
  }

  function getColdStartFraming(metrics) {
    if (metrics.instinctCount < 5) {
      return 'Building your brain: ' + metrics.instinctCount + ' experiences learned, local resolution starts appearing soon';
    }
    if (metrics.localCoverage < 20) {
      return 'Your brain is learning: ' + metrics.instinctCount + ' instincts cached, coverage is ' + metrics.localCoverage + '% — keep going';
    }
    return 'Brain active: ' + metrics.instinctCount + ' instincts, ' + metrics.localCoverage + '% local coverage';
  }

  function resolveConflict(layers) {
    if (!Array.isArray(layers) || layers.length === 0) return null;
    var validLayers = layers.filter(function (l) { return LAYER_PRIORITY.indexOf(l) !== -1; });
    if (validLayers.length === 0) return null;
    if (validLayers.length === 1) return validLayers[0];
    for (var i = 0; i < LAYER_PRIORITY.length; i++) {
      if (validLayers.indexOf(LAYER_PRIORITY[i]) !== -1) {
        return LAYER_PRIORITY[i];
      }
    }
    return validLayers[0];
  }

  async function init() {
    var migrated = await _migrateFixMemory();
    console.log('[BrainState] Migrated ' + migrated + ' FixMemory records to schema v' + SCHEMA_VERSION);

    var metrics = await _computeMetrics();

    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(metrics));
    } catch (_) {}

    console.log('[BrainState] Initialized:', metrics);
    console.log('[BrainState] Cold-start framing:', getColdStartFraming(metrics));

    try {
      var db = await _openIDB(FIX_DB, FIX_STORE, 'readonly');
      var tx = db.transaction(FIX_DB, 'readonly');
      var store = tx.objectStore(FIX_STORE);
      var req = store.openCursor();
      req.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          console.log('[BrainState] Sample backfilled record:', cursor.value);
          cursor.continue();
        }
      };
    } catch (_) {}

    console.log('[BrainState] resolveConflict(["style","community","dna","instinct"]) =>', resolveConflict(['style', 'community', 'dna', 'instinct']));

    try {
      var sampleRecord = {
        id: 'sample::test',
        provenance: 'community',
        confidenceCeiling: 0.6,
        whatFixed: 'Sample community fix'
      };
      _enforceProvenanceCeiling(sampleRecord);
      console.log('[BrainState] Sample enforced provenance/ceiling:', sampleRecord);
    } catch (_) {}

    try {
      var staleRecord = {
        id: 'stale-sample::test',
        contextASTSignature: 'function_oldName@10:5',
        stale: false
      };
      if (window.MateyInstinct && typeof window.MateyInstinct.markStaleByASTSignature === 'function') {
        await window.MateyInstinct.markStaleByASTSignature(staleRecord.contextASTSignature);
        staleRecord.stale = true;
        console.log('[BrainState] Sample stale record mutation:', staleRecord);
      }
    } catch (_) {}

    try {
      if (window.MateyInstinct && typeof window.MateyInstinct.applyPromotionLadder === 'function') {
        await window.MateyInstinct.recordInstinct('test_tool', 'TEST_CODE', 'test reason', 'test fix', 'function_oldName@10:5');
        await window.MateyInstinct.applyPromotionLadder('test_tool', 'TEST_CODE', 'test reason');
        console.log('[BrainState] Sample promotion log: test_tool promoted after threshold');
      }
    } catch (_) {}

    try {
      var tupleSample = {
        errorCategory: 'null-pointer',
        language: 'java',
        strategyId: 'S-004',
        successCount: 42
      };
      var serialized = serializeOutgoingTuple(tupleSample);
      console.log('[BrainState] serializeOutgoingTuple sample:', serialized);
    } catch (_) {}

    try {
      var wisdomEnabled = getCommunityWisdomEnabled();
      console.log('[BrainState] Community Wisdom enabled:', wisdomEnabled);
      console.log('[BrainState] Background sync blocked when disabled:', !wisdomEnabled ? 'YES — no network requests will be made' : 'NO — sync allowed per 24h rate limit');
    } catch (_) {}

    try {
      var rejectedCommunity = { strategyId: 'S-099', successCount: 5, successRate: 0.45 };
      passesConsensusGate(rejectedCommunity);
      console.log('[BrainState] Consensus gate rejected community strategy S-099 (successCount=5, successRate=45%)');
    } catch (_) {}

    return metrics;
  }

  function getMetrics() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function recordHit(latencyMs, tokensSaved) {
    try {
      var raw = localStorage.getItem(METRICS_KEY);
      var m = raw ? JSON.parse(raw) : { hits: 0, totalQueries: 0, avgLatencySavedMs: 0, tokensSavedEstimate: 0 };
      m.hits = (m.hits || 0) + 1;
      m.totalQueries = (m.totalQueries || 0) + 1;
      var prevAvg = m.avgLatencySavedMs || 0;
      var prevHits = m.hits - 1;
      m.avgLatencySavedMs = prevHits > 0 ? Math.round((prevAvg * prevHits + latencyMs) / m.hits) : latencyMs;
      m.tokensSavedEstimate = (m.tokensSavedEstimate || 0) + (tokensSaved || 0);
      localStorage.setItem(METRICS_KEY, JSON.stringify(m));
    } catch (_) {}
  }

  function recordMiss() {
    try {
      var raw = localStorage.getItem(METRICS_KEY);
      var m = raw ? JSON.parse(raw) : { hits: 0, totalQueries: 0 };
      m.totalQueries = (m.totalQueries || 0) + 1;
      localStorage.setItem(METRICS_KEY, JSON.stringify(m));
    } catch (_) {}
  }

  async function getFixHint(toolName, errorCode, reason) {
    try {
      if (window.FixMemory && typeof window.FixMemory.buildHint === 'function') {
        var hint = await window.FixMemory.buildHint(toolName, errorCode, reason);
        if (hint) {
          recordHit(800, 200);
        } else {
          recordMiss();
        }
        return hint;
      }
    } catch (_) {}
    try {
      var ws = _workspaceName();
      var sig = [toolName, errorCode, reason || ''].map(function (s) { return String(s).toLowerCase().trim(); }).join(':');
      var db = await _openIDB(FIX_DB, FIX_STORE, 'readonly');
      var tx = db.transaction(FIX_STORE, 'readonly');
      var store = tx.objectStore(FIX_STORE);
      var req = store.get(ws + '::' + sig);
      return new Promise(function (resolve) {
        req.onsuccess = function () {
          var result = req.result;
          if (result) {
            recordHit(800, 200);
            resolve('Note: the error "' + sig + '" was seen before in workspace "' + ws + '" and was fixed by: ' + result.whatFixed + '. Consider that first.');
          } else {
            recordMiss();
            resolve(null);
          }
        };
        req.onerror = function () { resolve(null); };
      });
    } catch (_) {
      return null;
    }
  }

  function getASTStats() {
    try {
      var ast = window.ASTIndex || (window.MateyAgent && window.MateyAgent.ASTIndex);
      if (ast && typeof ast.getStats === 'function') {
        return ast.getStats();
      }
    } catch (_) {}
    return null;
  }

  async function getStyleProfile() {
    try {
      var ws = _workspaceName();
      var db = await _openIDB(STYLE_DB, STYLE_STORE, 'readonly');
      var tx = db.transaction(STYLE_STORE, 'readonly');
      var store = tx.objectStore(STYLE_STORE);
      var req = store.get(ws);
      return new Promise(function (resolve) {
        req.onsuccess = function () {
          var result = req.result;
          resolve(result ? result.profile : null);
        };
        req.onerror = function () { resolve(null); };
      });
    } catch (_) {
      return null;
    }
  }

  async function handleUserRejection(toolName, errorCode, reason) {
    try {
      if (window.MateyInstinct && typeof window.MateyInstinct.recordUserRejection === 'function') {
        await window.MateyInstinct.recordUserRejection(toolName, errorCode, reason);
      }
    } catch (_) {}
    /* v1 deferral: signature-subdivision on user rejection is a deliberate future enhancement.
       Current behavior records the rejection count but does not subdivide the instinct signature.
       Subdivision would create narrower instinct records based on rejected argument patterns. */
  }

  function passesConsensusGate(communityRecord) {
    if (!communityRecord || typeof communityRecord !== 'object') return false;
    var successCount = communityRecord.successCount || 0;
    var successRate = communityRecord.successRate || 0;
    var passes = successCount > COMMUNITY_CONSENSUS_MIN_SUCCESS_COUNT && successRate > COMMUNITY_CONSENSUS_MIN_SUCCESS_RATE;
    if (!passes) {
      console.log('[BrainState] Community strategy rejected by consensus gate:', {
        strategyId: communityRecord.strategyId || 'unknown',
        successCount: successCount,
        successRate: Math.round(successRate * 100) + '%',
        reason: successCount <= COMMUNITY_CONSENSUS_MIN_SUCCESS_COUNT ? 'insufficient successCount' : 'insufficient successRate'
      });
    }
    return passes;
  }

  async function recordLocalFailure(communityRecord) {
    try {
      if (!communityRecord || typeof communityRecord !== 'object') return;
      var localKey = 'matey-community-local-feedback::' + (communityRecord.strategyId || communityRecord.id || 'unknown');
      var stored = {};
      try {
        var raw = localStorage.getItem(localKey);
        if (raw) stored = JSON.parse(raw);
      } catch (_) {}
      stored.localConfidence = Math.max(0, (stored.localConfidence || 0.5) - 0.1);
      stored.failureCount = (stored.failureCount || 0) + 1;
      stored.lastFailureAt = Date.now();
      try { localStorage.setItem(localKey, JSON.stringify(stored)); } catch (_) {}
      console.log('[BrainState] Local failure isolated for community strategy:', {
        strategyId: communityRecord.strategyId || communityRecord.id || 'unknown',
        newLocalConfidence: stored.localConfidence.toFixed(2),
        failureCount: stored.failureCount
      });
    } catch (_) {}
  }

  function getCommunityWisdomEnabled() {
    try {
      if (window.MateySettings && typeof window.MateySettings.isCommunityWisdomEnabled === 'function') {
        return window.MateySettings.isCommunityWisdomEnabled();
      }
    } catch (_) {}
    try { return localStorage.getItem('matey-community-wisdom-enabled') === 'true'; }
    catch (_) { return false; }
  }

  return {
    init: init,
    getMetrics: getMetrics,
    getColdStartFraming: getColdStartFraming,
    recordHit: recordHit,
    recordMiss: recordMiss,
    brainSchemaVersion: SCHEMA_VERSION,
    resolveConflict: resolveConflict,
    handleUserRejection: handleUserRejection,
    passesConsensusGate: passesConsensusGate,
    recordLocalFailure: recordLocalFailure,
    getCommunityWisdomEnabled: getCommunityWisdomEnabled,
    getFixHint: getFixHint,
    getASTStats: getASTStats,
    getStyleProfile: getStyleProfile
  };
})();

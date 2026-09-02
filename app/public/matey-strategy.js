/* Matey Strategy — Bundled strategy library + anonymized community sync */

var MateyStrategy = (function () {
  'use strict';

  var STRATEGY_LIST = [
    { id: 'S-001', title: 'Wrap recursive struct in Box<T>', category: 'memory', language: 'rust' },
    { id: 'S-002', title: 'Add explicit type cast on assignment', category: 'typing', language: 'typescript' },
    { id: 'S-003', title: 'Initialize variable before use', category: 'initialization', language: 'javascript' },
    { id: 'S-004', title: 'Add null check before dereferencing', category: 'null-safety', language: 'java' },
    { id: 'S-005', title: 'Close resource in finally block', category: 'resource-management', language: 'python' },
    { id: 'S-006', title: 'Await async call before using result', category: 'async', language: 'javascript' },
    { id: 'S-007', title: 'Import missing module', category: 'imports', language: 'python' },
    { id: 'S-008', title: 'Add explicit return type', category: 'typing', language: 'typescript' },
    { id: 'S-009', title: 'Handle error case explicitly', category: 'error-handling', language: 'rust' },
    { id: 'S-010', title: 'Use let instead of var in block scope', category: 'scope', language: 'javascript' },
    { id: 'S-011', title: 'Add mut borrow or clone for ownership', category: 'memory', language: 'rust' },
    { id: 'S-012', title: 'Wrap callback in Promise', category: 'async', language: 'javascript' },
    { id: 'S-013', title: 'Add type annotation to function parameter', category: 'typing', language: 'python' },
    { id: 'S-014', title: 'Check array bounds before access', category: 'bounds', language: 'rust' }
  ];

  var COMMUNITY_STRATEGY_URL = 'https://static.matey-app.dev/community-strategies.json';
  var COMMUNITY_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
  var COMMUNITY_SYNC_KEY = 'matey-community-strategy-last-sync';

  function getStrategies() {
    return STRATEGY_LIST.slice();
  }

  function getStrategyById(id) {
    return STRATEGY_LIST.find(function (s) { return s.id === id; }) || null;
  }

  function serializeOutgoingTuple(record) {
    if (!record || typeof record !== 'object') return null;
    var errorCategory = record.errorCategory || 'unknown';
    var language = record.language || 'unknown';
    var strategyId = record.strategyId || '';
    var successCount = typeof record.successCount === 'number' ? record.successCount : 0;
    return {
      errorCategory: String(errorCategory),
      language: String(language),
      strategyId: String(strategyId),
      successCount: Math.max(0, Math.round(successCount))
    };
  }

  function canSyncCommunity() {
    try {
      if (!window.MateySettings || typeof window.MateySettings.isCommunityWisdomEnabled !== 'function') {
        return false;
      }
      if (!window.MateySettings.isCommunityWisdomEnabled()) return false;
      var lastSync = parseInt(localStorage.getItem(COMMUNITY_SYNC_KEY) || '0', 10);
      return (Date.now() - lastSync) >= COMMUNITY_SYNC_INTERVAL_MS;
    } catch (_) {
      return false;
    }
  }

  async function fetchCommunityStrategies() {
    if (!canSyncCommunity()) {
      console.log('[MateyStrategy] Community sync blocked by settings or rate limit');
      return [];
    }
    try {
      var response = await fetch(COMMUNITY_STRATEGY_URL, { method: 'GET', mode: 'cors' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var data = await response.json();
      var strategies = Array.isArray(data.strategies) ? data.strategies : [];
      try { localStorage.setItem(COMMUNITY_SYNC_KEY, String(Date.now())); } catch (_) {}
      console.log('[MateyStrategy] Fetched ' + strategies.length + ' community strategies');
      return strategies;
    } catch (e) {
      console.warn('[MateyStrategy] Community sync failed:', e.message || e);
      return [];
    }
  }

  function passesConsensusGate(communityRecord) {
    if (!communityRecord || typeof communityRecord !== 'object') return false;
    var successCount = communityRecord.successCount || 0;
    var successRate = communityRecord.successRate || 0;
    return successCount > 20 && successRate > 0.7;
  }

  return {
    STRATEGY_LIST: STRATEGY_LIST,
    getStrategies: getStrategies,
    getStrategyById: getStrategyById,
    serializeOutgoingTuple: serializeOutgoingTuple,
    canSyncCommunity: canSyncCommunity,
    fetchCommunityStrategies: fetchCommunityStrategies,
    passesConsensusGate: passesConsensusGate,
    COMMUNITY_STRATEGY_URL: COMMUNITY_STRATEGY_URL,
    COMMUNITY_SYNC_INTERVAL_MS: COMMUNITY_SYNC_INTERVAL_MS
  };
})();

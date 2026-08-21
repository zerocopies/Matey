/* Matey Behavioral Tracking — local interaction metrics */
(function () {
  'use strict';

  var KEY = 'matey-behavior-log';
  var METRICS_KEY = 'matey-behavior-metrics';

  function now() { return Date.now(); }

  function getLog() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch (e) { return []; }
  }

  function getMetrics() {
    try { return JSON.parse(localStorage.getItem(METRICS_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function saveLog(log) {
    localStorage.setItem(KEY, JSON.stringify(log.slice(-500)));
  }

  function saveMetrics(metrics) {
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
  }

  function record(type, data) {
    var log = getLog();
    log.push({
      type: type,
      data: data || {},
      time: now()
    });
    saveLog(log);
    recalculateMetrics();
  }

  function recalculateMetrics() {
    var log = getLog();
    var syntaxCounts = {};
    var responseLengths = [];
    var pageVisits = {};
    var edits = 0;
    var rejections = 0;

    log.forEach(function (entry) {
      var d = entry.data || {};
      if (entry.type === 'syntax_used' && d.token) {
        syntaxCounts[d.token] = (syntaxCounts[d.token] || 0) + 1;
      }
      if (entry.type === 'chat_response' && typeof d.length === 'number') {
        responseLengths.push(d.length);
      }
      if (entry.type === 'page_visit' && d.page) {
        pageVisits[d.page] = (pageVisits[d.page] || 0) + 1;
      }
      if (entry.type === 'edit') edits++;
      if (entry.type === 'rejection') rejections++;
    });

    var avgResponseLength = responseLengths.length ?
      responseLengths.reduce(function (a, b) { return a + b; }, 0) / responseLengths.length : 0;

    saveMetrics({
      syntaxCounts: syntaxCounts,
      avgResponseLength: Math.round(avgResponseLength),
      preferredResponseLength: avgResponseLength > 300 ? 'long' : (avgResponseLength > 100 ? 'medium' : 'short'),
      pageVisits: pageVisits,
      topPages: Object.keys(pageVisits).sort(function (a, b) { return pageVisits[b] - pageVisits[a]; }).slice(0, 3),
      edits: edits,
      rejections: rejections,
      totalInteractions: log.length,
      lastUpdated: now()
    });
  }

  function trackPage(page) {
    record('page_visit', { page: page });
  }

  function trackSyntax(token) {
    record('syntax_used', { token: token });
  }

  function trackChatResponse(text) {
    record('chat_response', { length: (text || '').length });
  }

  function trackEdit(original, edited) {
    record('edit', { originalLength: (original || '').length, editedLength: (edited || '').length });
  }

  function trackRejection(reason) {
    record('rejection', { reason: reason });
  }

  function getProfileBoost() {
    var metrics = getMetrics();
    var boost = {};
    if (metrics.syntaxCounts) {
      var top = Object.keys(metrics.syntaxCounts).sort(function (a, b) {
        return metrics.syntaxCounts[b] - metrics.syntaxCounts[a];
      })[0];
      boost.favoriteSyntax = top;
    }
    boost.preferredLength = metrics.preferredResponseLength || 'medium';
    boost.topPages = metrics.topPages || [];
    return boost;
  }

  window.MateyBehavior = {
    record: record,
    trackPage: trackPage,
    trackSyntax: trackSyntax,
    trackChatResponse: trackChatResponse,
    trackEdit: trackEdit,
    trackRejection: trackRejection,
    getMetrics: getMetrics,
    getProfileBoost: getProfileBoost
  };
})();

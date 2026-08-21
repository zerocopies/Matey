/* Matey Adaptive Personalization — evolutionary profile + upskilling */
(function () {
  'use strict';

  var PROFILE_KEY = 'matey-profile';
  var ADAPTIVE_KEY = 'matey-adaptive-profile';

  function getProfile() {
    return localStorage.getItem(PROFILE_KEY) || '';
  }

  function getAdaptiveProfile() {
    try { return JSON.parse(localStorage.getItem(ADAPTIVE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function saveAdaptiveProfile(p) {
    localStorage.setItem(ADAPTIVE_KEY, JSON.stringify(p));
  }

  function refineProfile() {
    if (!window.MateyBehavior) return;
    var metrics = MateyBehavior.getMetrics();
    var adaptive = getAdaptiveProfile();

    adaptive.communicationStyle = metrics.preferredResponseLength === 'short' ? 'concise' :
      metrics.preferredResponseLength === 'long' ? 'detailed' : 'balanced';

    if (metrics.topPages && metrics.topPages.length > 0) {
      adaptive.topInterests = metrics.topPages;
    }

    if (metrics.syntaxCounts) {
      var top = Object.keys(metrics.syntaxCounts).sort(function (a, b) {
        return metrics.syntaxCounts[b] - metrics.syntaxCounts[a];
      }).slice(0, 3);
      adaptive.preferredTools = top;
    }

    adaptive.refinementCount = (adaptive.refinementCount || 0) + 1;
    adaptive.lastRefined = Date.now();

    saveAdaptiveProfile(adaptive);
  }

  function suggestPrompt(query) {
    if (!query || query.trim().length < 4) {
      return 'Try: "summarize my notes" or "what should I wear today?"';
    }
    if (query.trim().split(/\s+/).length < 2) {
      return 'Add more detail, like: "' + query + ' for a hot day in Dubai"';
    }
    return null;
  }

  function buildSystemContext() {
    var base = [];
    var profile = getProfile();
    var adaptive = getAdaptiveProfile();

    if (profile) base.push('User profile: ' + profile);
    if (adaptive.communicationStyle) base.push('Preferred style: ' + adaptive.communicationStyle);
    if (adaptive.topInterests) base.push('Top interests: ' + adaptive.topInterests.join(', '));
    if (adaptive.preferredTools) base.push('Frequent tools: ' + adaptive.preferredTools.join(', '));

    return base.join(' | ');
  }

  window.MateyAdaptive = {
    refineProfile: refineProfile,
    suggestPrompt: suggestPrompt,
    buildSystemContext: buildSystemContext,
    getAdaptiveProfile: getAdaptiveProfile
  };
})();

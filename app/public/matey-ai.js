/* Matey AI — on-device behavior learning (unified matey-* stores) */
(function () {
  'use strict';
  var LEARNING_KEY = 'matey-ai-learning';
  var LEARNING_START_KEY = 'matey-ai-start';
  function j(k, d) { try { return JSON.parse(localStorage.getItem(k) || d); } catch (e) { return JSON.parse(d); } }
  function getLearning() { return j(LEARNING_KEY, '{}'); }
  function saveLearning(d) { localStorage.setItem(LEARNING_KEY, JSON.stringify(d)); }
  function initLearning() { if (!localStorage.getItem(LEARNING_START_KEY)) localStorage.setItem(LEARNING_START_KEY, JSON.stringify(Date.now())); }
  function getDaysSinceStart() { var s = localStorage.getItem(LEARNING_START_KEY); if (!s) return 0; return (Date.now() - JSON.parse(s)) / 86400000; }
  function analyzeBehavior() {
    var learning = getLearning();
    var vault = j('matey-vault', '[]'), session = j('matey-session-notes', '[]'), priorities = j('matey-priority', '[]');
    var profile = localStorage.getItem('matey-profile') || '';
    var topicFreq = {}, timePrefs = {};
    var totalInteractions = vault.length + session.length + priorities.length;
    function block(t) { var h = new Date(t).getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; }
    vault.forEach(function (v) { if (v.topic) topicFreq[v.topic] = (topicFreq[v.topic] || 0) + 1; timePrefs[block(v.created || v.time)] = (timePrefs[block(v.created || v.time)] || 0) + 1; });
    session.forEach(function (s) { timePrefs[block(s.created || s.time)] = (timePrefs[block(s.created || s.time)] || 0) + 1; });
    learning.topicFrequency = topicFreq;
    learning.topTopics = Object.keys(topicFreq).sort(function (a, b) { return topicFreq[b] - topicFreq[a]; });
    learning.activeTime = Object.keys(timePrefs).sort(function (a, b) { return timePrefs[b] - timePrefs[a]; })[0] || 'morning';
    learning.totalInteractions = totalInteractions;
    learning.lastAnalysis = Date.now();
    learning.confidence = Math.min(1, totalInteractions / 20);
    learning.profileLength = profile.length;
    saveLearning(learning);
    return learning;
  }
  function getContextualInsight() {
    var learning = getLearning(), days = getDaysSinceStart();
    if (days < 1 || learning.totalInteractions < 3) return null;
    var insights = [];
    if ((learning.topTopics || []).length) insights.push('Based on your notes, you seem most interested in ' + learning.topTopics[0].toLowerCase() + '.');
    if (learning.activeTime && learning.confidence > 0.5) insights.push('You tend to be most active in the ' + learning.activeTime + '.');
    if (days >= 3 && learning.confidence > 0.6) insights.push('After ' + Math.floor(days) + ' days, your feed is becoming more personalized.');
    return insights[0] || null;
  }
  function getPrioritizedTopics() {
    var learning = getLearning();
    var base = ['Grooming', 'Wardrobe', 'Culinary', 'Lifestyle'];
    if (learning.confidence < 0.2) return base;
    var freq = learning.topicFrequency || {}, ranked = {};
    base.forEach(function (t) { ranked[t] = freq[t] || 0; });
    var text = (localStorage.getItem('matey-profile') || '').toLowerCase();
    if (/groom|skin|hair/.test(text)) ranked.Grooming += 3;
    if (/cloth|fashion|style/.test(text)) ranked.Wardrobe += 3;
    if (/cook|food|recipe/.test(text)) ranked.Culinary += 3;
    if (/read|gym|travel|music/.test(text)) ranked.Lifestyle += 3;
    return base.sort(function (a, b) { return ranked[b] - ranked[a]; });
  }
  function init() { initLearning(); analyzeBehavior(); }
  window.MateyAI = { analyze: analyzeBehavior, insight: getContextualInsight, prioritizedTopics: getPrioritizedTopics, learning: getLearning, daysSinceStart: getDaysSinceStart };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

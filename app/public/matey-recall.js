/* Matey Recall — '??' Ask Matey retrieval: ranks vault/scratchpads/priorities/markdown/profile by relevance (personalization + topic recency).
   Optional semantic embeddings adapter: MateyRecall.embeddingModel(text) -> if a Tiny ONNX embedder is loaded, plug it here.
 */
(function () {
  'use strict';
  function j(k, d) { try { return JSON.parse(localStorage.getItem(k) || d); } catch (e) { return JSON.parse(d); } }
  function profileText() { try { return (localStorage.getItem('matey-profile') || '').toLowerCase(); } catch (e) { return ''; } }
  var TOPIC_TERMS = {
    Grooming: ['groom', 'skin', 'hair', 'shave', 'beard', 'face', 'skincare', 'perfume', 'cologne'],
    Wardrobe: ['cloth', 'outfit', 'shirt', 'pant', 'shoe', 'fashion', 'dress', 'wardrobe', 'style'],
    Culinary: ['cook', 'recipe', 'food', 'meal', 'diet', 'restaurant', 'eat', 'chef', 'bake'],
    Lifestyle: ['gym', 'workout', 'read', 'book', 'meditat', 'yoga', 'hobby', 'learn', 'music', 'travel'],
    Work: ['work', 'job', 'office', 'meeting', 'project', 'deadline', 'client', 'code', 'dev', 'api'],
    Tech: ['tech', 'software', 'app', 'bug', 'fix', 'deploy', 'server', 'git', 'docker'],
    Health: ['health', 'doctor', 'sleep', 'diet', 'exercise', 'run', 'mental'],
    Finance: ['money', 'budget', 'invest', 'save', 'stock', 'crypto', 'bill']
  };

  function words(txt) { return (txt || '').toLowerCase().split(/\W+/).filter(function (w) { return w.length > 2; }); }
  function score(text, qwords, prof, created) {
    var s = 0, t = text.toLowerCase(), qw = {};
    qwords.forEach(function (w) { qw[w] = true; });
    Object.keys(qw).forEach(function (w) { if (t.indexOf(w) !== -1) s += 3; });
    // topic scope boost
    var tw = words(t);
    Object.keys(TOPIC_TERMS).forEach(function (topic) {
      if (t.indexOf(topic.toLowerCase()) !== -1) {
        s += 2;
        if (prof.indexOf(topic.toLowerCase()) !== -1) s += 3;
      }
    });
    // personalization terms
    var profTerms = new Set(words(prof.substring(0, 600)));
    tw.forEach(function (w) { if (profTerms.has(w)) s += 1; });
    // recency (within last 30 days)
    if (created) { var days = (Date.now() - created) / 86400000; if (days < 30) s += Math.max(0, 1 - days / 30); }
    return s;
  }

  function rank(query) {
    var q = (query || '').trim(); if (!q) return [];
    var qw = words(q), prof = profileText();
    var hits = [];
    function push(source, text, created) {
      if (!text) return;
      var sc = score(text, qw, prof, created);
      if (sc > 0) hits.push({ source: source, text: text, created: created || Date.now(), relevance: Math.min(100, Math.round(sc / 3 * 100)) });
    }
    j('matey-vault', '[]').forEach(function (n) { push('permanent-note', n.content || n.text, n.created || n.time); });
    j('matey-session-notes', '[]').forEach(function (n) { push('scratchpad', n.content || n.text, n.created || n.time); });
    j('matey-priority', '[]').forEach(function (n) { push('priority', n.content || n.text, n.created || n.time); });
    try { var md = localStorage.getItem('matey-markdown') || ''; if (md) push('markdown', md.substring(0, 400), Date.now()); } catch (e) {}
    hits.sort(function (a, b) { return (b.relevance - a.relevance) || ((b.created || 0) - (a.created || 0)); });
    return hits.slice(0, 8);
  }

  window.MateyRecall = { rank: rank, score: score };
})();

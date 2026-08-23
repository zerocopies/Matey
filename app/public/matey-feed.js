/* Matey Feed — personalized daily brief + live RSS reader (unified stores) */
(function () {
  'use strict';
  var FEED_KEY = 'matey-intel-feed';
  var FEED_GENERATED_KEY = 'matey-feed-generated';
  var DEFAULT_FEEDS = [
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' }
  ];

  var INSIGHTS = {
    Grooming: [
      { title: 'The science of cold-water face washing', body: 'Cold exposure boosts circulation and tightens pores. A 30-second splash each morning can reduce puffiness and sharpen alertness without caffeine.' },
      { title: 'Minimal skincare, maximum effect', body: 'Three steps is enough: cleanser, moisturizer, SPF. Over-complicating strips your skin barrier and wastes time.' },
      { title: 'Fragrance layering is having a moment', body: 'A light citrus top note with a woody base creates a signature scent that evolves through the day.' }
    ],
    Wardrobe: [
      { title: 'Fit beats brand every time', body: 'A well-fitted $30 shirt looks better than a poorly fitted $300 one. Invest in a tailor before investing in labels.' },
      { title: 'The capsule wardrobe principle', body: 'Seven versatile pieces in complementary tones create 20+ outfits. Neutrals as base, one accent color for personality.' },
      { title: 'Shoes carry the outfit', body: 'Clean, well-maintained shoes elevate everything above them. Two pairs in rotation extend their life.' }
    ],
    Culinary: [
      { title: 'Meal prep saves more than time', body: 'Preparing 3-4 base ingredients on Sunday means weekday meals take 10 minutes.' },
      { title: 'Seasoning is the real skill gap', body: 'Salt at every stage, acid at the end. Most meals taste flat because they need brightness, not more spice.' },
      { title: 'One-pan meals are underrated', body: 'Sheet pan dinners with seasonal vegetables and protein require minimal cleanup.' }
    ],
    Lifestyle: [
      { title: 'The 2-minute rule for productivity', body: 'If a task takes less than 2 minutes, do it now. This eliminates the mental clutter of small undone things.' },
      { title: 'Walking is the most underrated exercise', body: '30 minutes of walking improves mood, creativity, and cardiovascular health.' },
      { title: 'Digital sunset at 9 PM', body: 'Reducing screen exposure an hour before sleep improves sleep quality significantly.' }
    ]
  };
  var GENERAL = [
    { title: 'Consistency compounds', body: 'Small daily actions beat occasional intense efforts. The systems you repeat are the results you get.' },
    { title: 'Environment design beats willpower', body: 'Make the good habit the easiest path: lay out clothes, prep the desk, remove friction.' }
  ];

  function j(k, d) { try { return JSON.parse(localStorage.getItem(k) || d); } catch (e) { return JSON.parse(d); } }
  function getProfile() { return { about: localStorage.getItem('matey-profile') || '' }; }
  function getVault() { return j('matey-vault', '[]'); }

  function getRelevantTopics(profile) {
    var topics = [], text = (profile.about || '').toLowerCase();
    if (/groom|skin|hair|care|beauty|perfume/.test(text)) topics.push('Grooming');
    if (/cloth|fashion|style|wardrobe|outfit/.test(text)) topics.push('Wardrobe');
    if (/cook|food|meal|recipe|chef|culinary/.test(text)) topics.push('Culinary');
    if (/read|gym|workout|travel|learn|music|hobby|productivity/.test(text)) topics.push('Lifestyle');
    if (!topics.length) topics = ['Grooming', 'Wardrobe', 'Culinary', 'Lifestyle'];
    return topics;
  }

  function generateFeed() {
    var profile = getProfile(), vault = getVault();
    var topics = (window.MateyAI && MateyAI.prioritizedTopics) ? MateyAI.prioritizedTopics() : getRelevantTopics(profile);
    var feed = [], now = Date.now();
    topics.forEach(function (topic, i) {
      var pool = INSIGHTS[topic] || [];
      var insight = pool[Math.floor(Math.random() * pool.length)];
      if (insight) feed.push({ id: 'feed-' + i, topic: topic, title: insight.title, body: insight.body, personal: '', time: now - i * 600000, saved: false, source: 'Matey' });
    });
    var general = GENERAL[Math.floor(Math.random() * GENERAL.length)];
    feed.push({ id: 'feed-general', topic: 'General', title: general.title, body: general.body, personal: '', time: now - topics.length * 600000, saved: false, source: 'Matey' });
    vault.slice(0, 3).forEach(function (v, i) {
      feed.push({ id: 'feed-vault-' + i, topic: v.topic || 'Note', title: 'From your vault', body: v.content || v.text || '', personal: '', time: v.created || v.time || now, saved: true, source: 'Vault' });
    });
    if (window.MateyAI && MateyAI.insight) {
      var aiInsight = MateyAI.insight();
      if (aiInsight) feed.push({ id: 'feed-ai-insight', topic: 'AI Insight', title: 'Adaptive intelligence', body: aiInsight, personal: '', time: now - 999999, saved: false, source: 'Matey AI' });
    }
    localStorage.setItem(FEED_KEY, JSON.stringify(feed));
    localStorage.setItem(FEED_GENERATED_KEY, new Date().toDateString());
    return feed;
  }

  function getFeed() {
    if (localStorage.getItem(FEED_GENERATED_KEY) !== new Date().toDateString()) return generateFeed();
    return j(FEED_KEY, '[]');
  }

  function saveFeedItem(id) {
    var feed = getFeed();
    feed.forEach(function (item) { if (item.id === id) item.saved = true; });
    localStorage.setItem(FEED_KEY, JSON.stringify(feed));
  }

  /* ---- RSS integration ---- */
  function ensureDefaultFeeds() {
    if (window.MateyRSS && !MateyRSS.feeds().length) MateyRSS.saveFeeds(DEFAULT_FEEDS);
  }
  function pullRSS(onDone) {
    if (!window.MateyRSS) { if (onDone) onDone([]); return; }
    ensureDefaultFeeds();
    var collected = [];
    MateyRSS.refreshAll(function (item, feedName) {
      collected.push({ id: 'rss-' + collected.length + '-' + (item.link || '').length, topic: feedName, title: item.title, body: item.desc, personal: '', time: Date.now(), saved: false, source: feedName, link: item.link });
    });
    setTimeout(function () { if (onDone) onDone(collected); }, 2500);
  }

  /* ---- render into #feed-list if present ---- */
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function render() {
    var list = document.getElementById('feed-list');
    if (!list) return;
    var feed = getFeed();
    function paint(items) {
      list.innerHTML = items.map(function (it) {
        var inner = '<div class="feed-item-head"><span class="feed-topic">' + esc(it.topic) + '</span><span class="feed-source">' + esc(it.source || 'Matey') + '</span></div>' +
          '<div class="feed-title">' + esc(it.title) + '</div>' +
          '<div class="feed-body">' + esc(it.body) + '</div>';
        if (it.link) inner += '<a class="feed-link" href="' + esc(it.link) + '" target="_blank" rel="noopener">Read more</a>';
        return '<div class="feed-item' + (it.saved ? ' saved' : '') + '" data-id="' + esc(it.id) + '">' + inner + '</div>';
       }).join('') || '<div class="feed-loading"><p class="settings-placeholder">Loading your daily brief...</p></div>';
      list.querySelectorAll('.feed-item').forEach(function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.classList.contains('feed-link')) return;
          el.classList.toggle('saved');
          saveFeedItem(el.getAttribute('data-id'));
        });
      });
    }
    paint(feed);
    pullRSS(function (rssItems) {
      if (rssItems.length) {
        paint(rssItems.concat(feed));
      } else {
        var list = document.getElementById('feed-list');
        if (list) list.innerHTML = '<p class="settings-placeholder">No new articles matching your interests.</p>';
      }
    });
  }

  window.MateyFeed = { get: getFeed, generate: generateFeed, save: saveFeedItem, render: render, pullRSS: pullRSS };
  window.SnapFeed = window.MateyFeed; // legacy alias
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();

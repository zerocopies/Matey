/* Matey Hooks — keyword intelligence monitor: Google News RSS keyword fetch + AI natural-language recaps */
(function () {
  'use strict';
  var HOOKS_KEY = 'matey-hooks', BRIEFS_KEY = 'matey-hook-briefs';
  function hooks() { try { return JSON.parse(localStorage.getItem(HOOKS_KEY) || '[]'); } catch (e) { return []; } }
  function saveHooks(d) { localStorage.setItem(HOOKS_KEY, JSON.stringify(d)); }
  function briefs() { try { return JSON.parse(localStorage.getItem(BRIEFS_KEY) || '{}'); } catch (e) { return {}; } }
  function saveBriefs(d) { localStorage.setItem(BRIEFS_KEY, JSON.stringify(d)); }
  function uid() { try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {} return 'hook-' + Date.now(); }

  function addHook(keyword) {
    var k = (keyword || '').trim(); if (!k) return null;
    var list = hooks().filter(function (h) { return h.keyword.toLowerCase() !== k.toLowerCase(); });
    list.unshift({ id: uid(), keyword: k, createdAt: Date.now() });
    saveHooks(list.slice(0, 20));
    return list[0];
  }
  function removeHook(id) { saveHooks(hooks().filter(function (h) { return h.id !== id; })); }

  function fetchNews(keyword, limit) {
    var q = encodeURIComponent(keyword);
    var url = 'https://hn.algolia.com/api/v1/search?query=' + q + '&tags=story&hitsPerPage=' + (limit || 10) + '';
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      return (j.hits || []).map(function (h) {
        return {
          title: ((h.title || h.story_title) || '').trim(),
          link: (h.url || ('https://news.ycombinator.com/item?id=' + h.objectID)),
          desc: ((h.story_text || '').replace(/<[^>]+>/g, '') || '').substring(0, 240),
          points: h.points || 0,
          comments: h.num_comments || 0,
          time: (h.created_at_i || Math.floor(Date.now() / 1000)) * 1000
        };
      });
    }).catch(function () { return []; });
  }
  function summarize(items, keyword) {
    if (!items.length) return Promise.resolve('No fresh stories found for "' + keyword + '" right now. Try again shortly.');
    if (window.MateyByok && MateyByok.hasProviders()) {
      var src = items.map(function (it) { return '- ' + it.title + '. ' + (it.desc || ''); }).join('\n');
      var messages = [{ role: 'system', content: 'You are Matey. Turn the most recent headlines about ' + keyword + ' into 3-6 plain-language takeaways. Group related stories, keep it scannable, no bullet markers or markdown. Tell the user the gist and why it matters.' }, { role: 'user', content: src }];
      return MateyByok.chat(messages).then(function (reply) { return (typeof reply === 'string' ? reply : '') || 'Summarized.'; });
    }
    var lead = items.slice(0, 5).map(function (it) { return it.title; }).join('. ');
    return Promise.resolve(lead + (items.length > 5 ? '.' : '.') + ' (Connect a provider in Settings → Custom for richer natural-language recaps.)');
  }

  function fetchHookBrief(hk) {
    return fetchNews(hk.keyword, 10).then(function (items) {
      return summarize(items, hk.keyword).then(function (natural) {
        var b = { keyword: hk.keyword, items: items.slice(0, 10), natural: natural, time: Date.now() };
        var all = briefs(); all[hk.id] = b; saveBriefs(all);
        return b;
      });
    }).catch(function () { var all = briefs(); delete all[hk.id]; saveBriefs(all); return null; });
  }

  function briefAll(onDone) {
    var list = hooks(); if (!list.length) { if (onDone) onDone({}); return Promise.resolve({}); }
    var results = 0;
    list.forEach(function (hk) {
      fetchHookBrief(hk).then(function () { results++; if (results >= list.length && onDone) onDone(briefs()); })
        .catch(function () { results++; if (results >= list.length && onDone) onDone(briefs()); });
    });
    return Promise.resolve(briefs());
  }

  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function timeAgo(t) { var d = Date.now() - (t || 0), m = Math.floor(d / 60000); if (m < 1) return 'now'; if (m < 60) return m + 'm'; if (m < 1440) return Math.floor(m / 60) + 'h'; return Math.floor(m / 1440) + 'd'; }

  function render() {
    var feed = document.getElementById('intel-feed');
    if (!feed) return;
    var list = hooks(), bs = briefs();
    if (!list.length) { feed.innerHTML = '<div class="feed-empty">Add keywords above — Matey will pull the latest ~10 stories per keyword and recap them here.</div>'; return; }
    var html = '';
    list.forEach(function (hk) {
      var b = bs[hk.id];
      html += '<div class="hook-brief"><div class="hook-head">' + esc(hk.keyword) + (b ? ' <span class="hook-time">' + timeAgo(b.time) + '</span>' : '') + '<button class="hook-remove" data-id="' + esc(hk.id) + '" title="Remove">✕</button></div>';
      if (!b) { html += '<p class="hook-pending">Fetching latest stories…</p>'; }
      else if (!b.items.length) { html += '<p class="hook-pending">No fresh stories found yet.</p>'; }
      else {
        html += '<p class="hook-natural">' + esc(b.natural || '') + '</p>';
        var items = b.items.slice(0, 5);
        items.forEach(function (it) {
          html += '<a class="hook-item" href="' + esc(it.link) + '" target="_blank" rel="noopener"><span class="hook-item-title">' + esc(it.title || '') + '</span><span class="hook-item-desc">' + esc(it.desc || '') + '</span></a>';
        });
      }
      html += '</div>';
    });
    feed.innerHTML = html;
    feed.querySelectorAll('.hook-remove').forEach(function (btn) {
      btn.addEventListener('click', function () { removeHook(btn.getAttribute('data-id')); render(); });
    });
  }

  function init() {
    var form = document.getElementById('hook-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var keyword = document.getElementById('keyword-input');
      if (!keyword) return;
      addHook(keyword.value);
      keyword.value = '';
    });
    var btn = document.getElementById('brief-btn');
    if (btn) btn.addEventListener('click', function () {
      btn.textContent = 'Fetching…';
      briefAll();
      render();
      setTimeout(function () { btn.textContent = 'Refresh briefs'; }, 3000);
    });
    render();
  }

  window.MateyHooks = { hooks: hooks, add: addHook, remove: removeHook, fetchNews: fetchNews, summarize: summarize, briefAll: briefAll, briefs: briefs, refresh: briefAll, render: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

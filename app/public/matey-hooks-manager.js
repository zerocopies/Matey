/* Matey Hooks Manager — Web monitor & keyword tracking system */
(function () {
  'use strict';

  var HOOKS_KEY = 'matey-hooks';
  var CHECK_INTERVAL = 300000; /* 5 minutes */

  function loadHooks() {
    try {
      return JSON.parse(localStorage.getItem(HOOKS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveHooks(hooks) {
    try {
      localStorage.setItem(HOOKS_KEY, JSON.stringify(hooks));
    } catch (e) {}
  }

  function createHook(type, config) {
    var hook = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      type: type,
      name: config.name || (type === 'web' ? 'Web Monitor' : 'Keyword Tracker'),
      url: config.url || '',
      keywords: config.keywords || [],
      schedule: config.schedule || 'daily',
      duration: config.duration || 7,
      description: config.description || '',
      status: 'active',
      createdAt: Date.now(),
      lastChecked: 0,
      lastResult: null,
      results: []
    };
    var hooks = loadHooks();
    hooks.push(hook);
    saveHooks(hooks);
    return hook;
  }

  function updateHook(id, updates) {
    var hooks = loadHooks();
    var idx = hooks.findIndex(function (h) { return h.id === id; });
    if (idx !== -1) {
      hooks[idx] = Object.assign({}, hooks[idx], updates);
      saveHooks(hooks);
      return hooks[idx];
    }
    return null;
  }

  function deleteHook(id) {
    var hooks = loadHooks();
    var filtered = hooks.filter(function (h) { return h.id !== id; });
    saveHooks(filtered);
    return true;
  }

  function getHooksByType(type) {
    return loadHooks().filter(function (h) { return h.type === type; });
  }

  async function checkWebHook(hook) {
    if (!hook.url) return { error: 'No URL configured' };
    try {
      var now = Date.now();
      var response = await fetch(hook.url, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      var content = '';
      try {
        content = await response.text();
      } catch (e) {
        /* no-cors mode doesn't give us content */
      }

      var result = {
        timestamp: now,
        url: hook.url,
        statusCode: response.status,
        contentLength: content.length,
        changed: false
      };

      var lastResult = hook.lastResult;
      if (lastResult) {
        result.changed = content !== lastResult.content;
      }

      /* Check for specific conditions in description */
      if (hook.description && content) {
        var conditions = hook.description.toLowerCase().split(/[,;]/);
        result.matches = conditions.map(function (c) {
          return { condition: c.trim(), found: content.toLowerCase().includes(c.trim()) };
        });
        result.hasMatches = result.matches.some(function (m) { return m.found; });
      }

      hook.lastResult = {
        timestamp: now,
        content: content,
        statusCode: response.status,
        contentLength: content.length
      };
      hook.results.push(result);
      if (hook.results.length > 100) hook.results.shift();
      hook.lastChecked = now;
      updateHook(hook.id, { lastResult: hook.lastResult, results: hook.results, lastChecked: now });

      return result;
    } catch (e) {
      return { error: e.message, timestamp: Date.now() };
    }
  }

  async function checkKeywordHook(hook) {
    var keywords = hook.keywords;
    if (!keywords || !keywords.length) return { error: 'No keywords configured' };

    var results = [];
    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i];
      try {
        /* Web search using a fetch-based approach */
        /* In a real implementation, this would call a search API */
        /* For now, we use a simple fetch to a search endpoint */
        var searchUrl = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(kw) + '&format=json&no_html=1';
        var response = await fetch(searchUrl);
        var data = '';
        try {
          data = await response.text();
        } catch (e) {}

        results.push({
          keyword: kw,
          timestamp: Date.now(),
          result: data ? data.substring(0, 500) : 'No results',
          hasResults: !!data
        });
      } catch (e) {
        results.push({
          keyword: kw,
          error: e.message,
          timestamp: Date.now()
        });
      }
    }

    var hookResult = {
      timestamp: Date.now(),
      keywords: results,
      topResults: results.filter(function (r) { return r.hasResults; }).slice(0, 10)
    };

    hook.lastResult = hookResult;
    hook.results.push(hookResult);
    if (hook.results.length > 50) hook.results.shift();
    hook.lastChecked = Date.now();
    updateHook(hook.id, { lastResult: hookResult, results: hook.results, lastChecked: Date.now() });

    return hookResult;
  }

  function shouldCheck(hook) {
    var now = Date.now();
    var intervals = {
      '3d': 3 * 24 * 3600000,
      '7d': 7 * 24 * 3600000,
      'daily': 24 * 3600000,
      'hourly': 3600000
    };
    var interval = intervals[hook.schedule] || CHECK_INTERVAL;
    return (now - (hook.lastChecked || 0)) > interval;
  }

  async function runAllChecks() {
    var hooks = loadHooks();
    var activeHooks = hooks.filter(function (h) { return h.status === 'active'; });

    for (var i = 0; i < activeHooks.length; i++) {
      var hook = activeHooks[i];
      if (shouldCheck(hook)) {
        if (hook.type === 'web') {
          await checkWebHook(hook);
        } else if (hook.type === 'keyword') {
          await checkKeywordHook(hook);
        }
      }
    }

    return activeHooks;
  }

  function renderHooksUI() {
    var webList = document.getElementById('hook-list-web');
    var kwList = document.getElementById('hook-list-keywords');
    if (!webList || !kwList) return;

    renderHookList(webList, getHooksByType('web'), 'web');
    renderHookList(kwList, getHooksByType('keyword'), 'keyword');
  }

  function renderHookList(container, hooks, type) {
    var emptyMsg = type === 'web'
      ? 'No web monitors configured. Add a URL and natural language description of what to monitor.'
      : 'No keyword hooks configured. Track topics, brands, people, or languages.';

    if (!hooks.length) {
      container.innerHTML = '<p class="settings-placeholder-small">' + emptyMsg + '</p>';
      return;
    }

    var html = '';
    hooks.forEach(function (hook) {
      var statusClass = hook.status === 'active' ? '' : hook.status;
      var lastChecked = hook.lastChecked
        ? new Date(hook.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Never';
      html += '<div class="hook-item">';
      html += '<div class="hook-item-info">';
      html += '<div class="hook-item-name">' + escapeHtml(hook.name) + '</div>';
      if (hook.url) html += '<div class="hook-item-desc">' + escapeHtml(hook.url) + '</div>';
      if (hook.keywords && hook.keywords.length) {
        html += '<div class="hook-item-desc">Keywords: ' + escapeHtml(hook.keywords.join(', ')) + '</div>';
      }
      html += '</div>';
      html += '<div class="hook-item-status ' + statusClass + '">' + hook.status + '</div>';
      html += '<button class="hook-delete-btn" data-id="' + hook.id + '" type="button" title="Remove">×</button>';
      html += '</div>';
    });
    container.innerHTML = html;

    /* Wire delete buttons */
    container.querySelectorAll('.hook-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteHook(btn.dataset.id);
        renderHooksUI();
      });
    });
  }

  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function init() {
    /* Render hooks UI if in settings page */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderHooksUI);
    } else {
      renderHooksUI();
    }

    /* Wire add hook buttons */
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('#hook-add-web, #hook-add-keyword');
      if (!btn) return;

      if (btn.id === 'hook-add-web') {
        showAddHookModal('web');
      } else if (btn.id === 'hook-add-keyword') {
        showAddHookModal('keyword');
      }
    });
  }

  function showAddHookModal(type) {
    var name = prompt(type === 'web' ? 'Monitor name:' : 'Hook name:');
    if (!name) return;

    var config = { name: name };

    if (type === 'web') {
      var url = prompt('URL to monitor:');
      if (!url) return;
      config.url = url;
      var desc = prompt('What to monitor (natural language, e.g. "track when price drops below $100"):');
      config.description = desc || '';
    } else {
      var kws = prompt('Keywords (comma separated, e.g. "AI, machine learning, Python"):');
      if (!kws) return;
      config.keywords = kws.split(',').map(function (k) { return k.trim(); }).filter(Boolean);
    }

    var schedule = prompt('Schedule (3d, 7d, daily, hourly):', 'daily');
    if (schedule) config.schedule = schedule;

    var duration = prompt('Duration in days (3-30):', '7');
    if (duration) config.duration = parseInt(duration, 10);

    createHook(type, config);
    renderHooksUI();
  }

  /* Auto-check hooks periodically */
  if (typeof window !== 'undefined') {
    setInterval(runAllChecks, CHECK_INTERVAL);
  }

  /* Public API */
  window.MateyHooks = {
    loadHooks: loadHooks,
    saveHooks: saveHooks,
    createHook: createHook,
    updateHook: updateHook,
    deleteHook: deleteHook,
    getHooksByType: getHooksByType,
    checkWebHook: checkWebHook,
    checkKeywordHook: checkKeywordHook,
    runAllChecks: runAllChecks,
    renderHooksUI: renderHooksUI,
    init: init
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

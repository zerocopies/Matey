/* Matey Tabs — Draggable reorder + instant cached tab navigation.
 * Tab links are handled in JS (preventDefault + switchTab); the plain <a href>
 * stays in the markup as a no-JS fallback. Captured screen regions persist in
 * sessionStorage (version-keyed by MATEY_CSS_VERSION), so a repeat visit to a
 * tab is instant instead of a full page reload:
 *  - lifestyle: true DOM swap below the tab bar (its UI modules load on every
 *    screen and re-initialize via the DOMContentLoaded re-dispatch);
 *  - vots / journal / agent: the cached shell is stashed as a pending view and
 *    painted instantly at page start by matey-boot.js while the real page
 *    loads and wires underneath (their per-element wiring lives in scripts
 *    that only load on their own page, so a bare swap would leave them dead).
 * '>edit' is never cached (full-screen IDE wiring, separate track).
 * Freshness: snapshots are taken at boot, at every tab tap (post-population
 * state) and on pagehide; a MATEY_CSS_VERSION bump discards all snapshots. */
(function () {
  'use strict';
  var TAB_ORDER = ['lifestyle', 'vots', 'editor', 'journal', 'agent'];
  var TAB_URLS = {
    'lifestyle': './lifestyle.html',
    'vots': './vots.html',
    'editor': './raw-editor.html',
    'journal': './journal.html',
    'agent': './preview.html'
  };
  var TAB_LABELS = {
    'lifestyle': 'Lifestyle',
    'vots': 'My-VOTS',
    'editor': '>edit',
    'journal': 'Journal',
    'agent': '>agent'
  };
  var LONG_PRESS_MS = 800;

  /* Tabs that may be swapped in-place (their UI scripts load on every screen).
     Others reload with an instant cached paint on top (see matey-boot.js). */
  var SWAPPABLE = { 'lifestyle': true };
  /* Tabs whose content is captured for repeat-visit instant delivery. */
  var CACHABLE = { 'lifestyle': true, 'vots': true, 'journal': true, 'agent': true };

  var CACHE_KEY = 'matey-nav-cache';
  var PENDING_KEY = 'matey-pending-view';
  var MAX_CAPTURE = 400000;   /* per-screen sessionStorage budget (chars) */
  var KEEP_LARGER = 0.9;      /* replace a snapshot only if the new one is >= 90% of its size */

  var isDragging = false, dragTab = null, dragStartX = 0, dragStartY = 0;
  var longPressTimer = null, touchMoved = false, placeholder = null, tabsContainer = null;
  var mouseDownTab = null;

  /* --- Navigation cache: id -> { ver, ts, shell, region, scrolls } --- */
  var _navCache = {};
  var _currentTab = null;      /* tab id of THIS page, null on secondary pages */
  var _activeObserver = null;  /* Track IntersectionObserver for cleanup */

  function cacheVersion() {
    return String(window.MATEY_CSS_VERSION || '0');
  }

  function loadCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return {};
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return {};
      if (data.ver !== cacheVersion()) return {};   /* app updated -> discard stale snapshots */
      return (data.tabs && typeof data.tabs === 'object') ? data.tabs : {};
    } catch (e) { return {}; }
  }

  function persist() {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ver: cacheVersion(), tabs: _navCache })); }
    catch (e) {
      /* Quota hit: drop the heaviest capture and retry once. */
      try {
        var heaviest = null, heaviestLen = 0;
        for (var k in _navCache) {
          var s = _navCache[k] && _navCache[k].shell ? _navCache[k].shell.length : 0;
          if (s > heaviestLen) { heaviestLen = s; heaviest = k; }
        }
        if (heaviest) delete _navCache[heaviest];
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ver: cacheVersion(), tabs: _navCache }));
      } catch (e2) {}
    }
  }

  function tabUrl(id) { return TAB_URLS[id] || '#'; }
  function tabLabel(id) { return TAB_LABELS[id] || id; }

  function tabIdFromHref(href) {
    if (!href) return null;
    for (var id in TAB_URLS) {
      if (href.indexOf(TAB_URLS[id].replace('./', '')) !== -1) return id;
    }
    return null;
  }

  /* Which tab is this page? The root route (localhost/ or /index.html) IS the
   * lifestyle home screen, so it maps to 'lifestyle'. Other secondary pages
   * (markdown, hooks, voice-models, home, beat) return null — they must never
   * capture over a real tab's snapshot (the old default-'lifestyle' fallback
   * poisoned the cache). */
  function detectActive() {
    var path = window.location.pathname.replace(/\/$/, ''), hash = window.location.hash || '';
    if (path === '' || path === '/index.html' || path.indexOf('lifestyle') !== -1) return 'lifestyle';
    if (path.indexOf('vots') !== -1) return 'vots';
    if (path.indexOf('raw-editor') !== -1) return 'editor';
    if (path.indexOf('journal') !== -1) return 'journal';
    if (hash === '#agent' || path.indexOf('preview') !== -1 || path.indexOf('agent') !== -1) return 'agent';
    return null;
  }

  function appShell() { return document.querySelector('.app-shell'); }
  function tabWrap() { return document.querySelector('.tabs-wrap'); }

  /* Screen content = every .app-shell child AFTER the tab bar (multi-tier
   * mains, lock screens, overlays, FABs) — not just the first <main>, which
   * on journal/vots is a hidden tier. */
  function captureRegion() {
    var shell = appShell(), wrap = tabWrap();
    if (!shell || !wrap || wrap.parentNode !== shell) {
      var mainEl = document.querySelector('main.content') || document.querySelector('main');
      return mainEl ? mainEl.outerHTML : '';
    }
    var html = '', node = wrap.nextElementSibling;
    while (node) { html += node.outerHTML; node = node.nextElementSibling; }
    return html;
  }

  function captureShell() {
    var shell = appShell();
    return shell ? shell.innerHTML : '';
  }

  function replaceRegion(html) {
    var shell = appShell(), wrap = tabWrap();
    if (!shell || !wrap || wrap.parentNode !== shell) {
      var mainEl = document.querySelector('main.content') || document.querySelector('main');
      if (!mainEl) return false;
      mainEl.innerHTML = html;
      return true;
    }
    var node = wrap.nextElementSibling, next;
    while (node) { next = node.nextElementSibling; shell.removeChild(node); node = next; }
    if (html) wrap.insertAdjacentHTML('afterend', html);
    return true;
  }

  /* Scroll positions of the region's scrollable containers (restored by
   * positional match — the captured DOM has the same shape). */
  function captureScrolls() {
    var out = [];
    try {
      var shell = appShell();
      if (!shell) return out;
      var els = shell.querySelectorAll('*');
      for (var i = 0; i < els.length && out.length < 12; i++) {
        var el = els[i];
        if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 40) out.push(el.scrollTop || 0);
      }
      out.push(window.scrollY || 0);
    } catch (e) {}
    return out;
  }

  function restoreScrolls(stored) {
    if (!stored || !stored.length) return;
    try {
      var shell = appShell();
      if (!shell) return;
      var els = shell.querySelectorAll('*'), k = 0;
      for (var i = 0; i < els.length && k < stored.length - 1; i++) {
        var el = els[i];
        if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 40) el.scrollTop = stored[k++] || 0;
      }
      window.scrollTo(0, stored[stored.length - 1] || 0);
    } catch (e) {}
  }

  /* Snapshot the CURRENT screen. keep-larger guards against caching a
   * not-yet-populated skeleton over a fully rendered snapshot. */
  function snapshotCurrent() {
    if (!_currentTab || !CACHABLE[_currentTab]) return;
    var shellHtml = captureShell();
    if (!shellHtml || shellHtml.length > MAX_CAPTURE) return;
    var prev = _navCache[_currentTab];
    if (prev && prev.shell && shellHtml.length < prev.shell.length * KEEP_LARGER) return;
    _navCache[_currentTab] = {
      ver: cacheVersion(),
      ts: Date.now(),
      shell: shellHtml,
      region: captureRegion(),
      scrolls: captureScrolls()
    };
    persist();
  }

  function markActive(id) {
    if (!tabsContainer) return;
    var tabs = tabsContainer.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === id);
    }
  }

  /* Reveal (or discard) the instant-paint overlay installed by matey-boot.js. */
  function consumePendingView() {
    var ov = document.getElementById('matey-instant-view');
    var pv = null;
    try { pv = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { pv = null; }
    var here = detectActive();
    if (ov && (!pv || (here && pv.tab !== here))) {
      /* Stale overlay (e.g. back navigation): drop it immediately. */
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
    if (ov && here && pv && pv.tab === here) {
      /* The real page is parsed and its init scripts have run; reveal it. */
      var steps = 0;
      var tick = function () {
        if (++steps < 2) { requestAnimationFrame(tick); return; }
        var o = document.getElementById('matey-instant-view');
        if (o && o.parentNode) o.parentNode.removeChild(o);
      };
      requestAnimationFrame(tick);
    }
  }

  /* Navigate to a tab. Cached lifestyle = instant swap. Other cached tabs =
     instant cached paint while the page loads. Unknown = full load. */
  function switchTab(id) {
    if (!id || id === _currentTab) return;

    /* Event listener teardown: clean up heavy listeners before view switch */
    teardownViewListeners();

    /* Click-time freshness: capture what is on screen right now (post-
       population: Beat badge, open journal tier, agent chat DOM). */
    snapshotCurrent();

    var entry = _navCache[id];
    if (entry && (entry.region || entry.shell)) {
      if (SWAPPABLE[id] && _currentTab && _currentTab !== 'editor') {
        /* Instant DOM swap below the tab bar — no reload. The lifestyle UI
           modules exist on every screen and re-bind via the re-dispatch. */
        var region = entry.region || '';
        if (region && replaceRegion(region)) {
          _currentTab = id;

          markActive(id);
          restoreScrolls(entry.scrolls);

          /* Automatic incognito routing on instant (cached) tab switches —
             MY-VOTS / JOURNAL force ON; others revert OFF unless locked. */
          if (window.MateyIncognito && window.MateyIncognito.routeForTab) {
            try { window.MateyIncognito.routeForTab(id); } catch (e) {}
          }

          if (window.history && window.history.replaceState) {
            try { window.history.replaceState({ tab: id }, '', tabUrl(id) + (id === 'agent' ? '#agent' : '')); } catch (e) {}
          }

          /* Re-run DOMContentLoaded-idiom initializations (matey-lifestyle
             boot, matey-beat, ...) so per-element listeners bind to the
             injected region; guarded scripts no-op safely. */
          try { document.dispatchEvent(new Event('DOMContentLoaded')); } catch (e) {}
          try { document.dispatchEvent(new CustomEvent('matey:tabswap', { detail: { tab: id } })); } catch (e) {}

          persist();
          return;
        }
      }
      /* Cached but not swappable here: stash the shell so matey-boot.js paints
         it instantly at the top of the target page (no white flash), while
         the real page loads and wires underneath. */
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({
          ver: cacheVersion(),
          tab: id,
          html: entry.shell || entry.region || '',
          scrolls: entry.scrolls || []
        }));
      } catch (e) {}
    }

    /* Not cached (or swap failed): full page load (the page will capture
       itself on the way out). */
    window.location.href = tabUrl(id) + (id === 'agent' ? '#agent' : '');
  }

  /* Teardown heavy listeners before view switch — prevents memory leaks */
  function teardownViewListeners() {
    /* Clear STT streaming callback */
    if (window.MateyMic && window.MateyMic.setStreamInterimCallback) {
      window.MateyMic.setStreamInterimCallback(null);
    }
    /* Stop any active recording */
    if (window.MateyMic && window.MateyMic.getState && window.MateyMic.getState().active) {
      try { window.MateyMic.stopRecording(); } catch (e) {}
    }
    /* Stop MateySpeech streaming */
    if (window.MateySpeech && window.MateySpeech.stopStreaming) {
      try { window.MateySpeech.stopStreaming(); } catch (e) {}
    }
    /* Disconnect any active IntersectionObserver */
    if (_activeObserver) {
      try { _activeObserver.disconnect(); } catch (e) {}
      _activeObserver = null;
    }
  }

  function loadOrder() {
    try {
      var raw = localStorage.getItem('matey-tab-order');
      if (raw) { var p = JSON.parse(raw); if (Array.isArray(p) && p.length === TAB_ORDER.length) return p; }
    } catch (e) {}
    return TAB_ORDER.slice();
  }
  var order = loadOrder();
  function saveOrder(o) { try { localStorage.setItem('matey-tab-order', JSON.stringify(o)); } catch (e) {} }

  function renderTabs() {
    var c = document.querySelector('.tabs');
    if (!c) return;
    /* Preserve the static markup's active tab on secondary pages
       (detectActive is intentionally null there). */
    var staticActive = null;
    var cur = c.querySelector('.tab.active');
    if (cur) staticActive = tabIdFromHref(cur.getAttribute('href') || '');
    tabsContainer = c; c.innerHTML = '';
    var active = detectActive() || staticActive;
    order.forEach(function (id) {
      var a = document.createElement('a');
      a.className = 'tab' + (id === active ? ' active' : '');
      a.href = tabUrl(id); a.setAttribute('data-tab', id);
      a.textContent = tabLabel(id);
      c.appendChild(a);
    });
  }

  /* Step 1 — wire the tab links: every .tab click is handled in JS
     (preventDefault + switchTab) on every screen; href stays as fallback.
     One delegated listener covers the static markup, the rebuilt bar and
     any screen that renders tabs late. */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var a = (t && t.closest) ? t.closest('a.tab') : null;
    if (!a) return;
    if (isDragging) return;   /* drag already squashes clicks in capture phase */
    e.preventDefault();
    var id = a.getAttribute('data-tab') || tabIdFromHref(a.getAttribute('href') || '');
    if (id) switchTab(id);
    else window.location.href = a.getAttribute('href') || './lifestyle.html';
  }, false);

  function mkPlaceholder() { var d = document.createElement('div'); d.className = 'tab drag-placeholder'; return d; }

  function insertIdx(x) {
    if (!tabsContainer) return -1;
    var tabs = tabsContainer.querySelectorAll('.tab:not(.drag-placeholder)');
    if (!tabs.length) return 0;
    var best = -1, bestDist = Infinity;
    for (var i = 0; i < tabs.length; i++) {
      var r = tabs[i].getBoundingClientRect(), mid = r.left + r.width / 2;
      var d = Math.abs(x - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    var last = tabs[best];
    if (last && x > last.getBoundingClientRect().left + last.getBoundingClientRect().width / 2) best++;
    return best;
  }

  function startDrag(tab, e) {
    isDragging = true; dragTab = tab;
    tab.classList.add('dragging');
    placeholder = mkPlaceholder();
    tabsContainer.insertBefore(placeholder, tab);
    dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
    dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
  }

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    if (dragTab) { dragTab.classList.remove('dragging'); dragTab = null; }
    if (placeholder && placeholder.parentNode) { placeholder.parentNode.removeChild(placeholder); placeholder = null; }
    if (tabsContainer) {
      var ord = [];
      tabsContainer.querySelectorAll('.tab:not(.drag-placeholder)').forEach(function (t) { ord.push(t.getAttribute('data-tab')); });
      order = ord; saveOrder(order);
    }
  }

  function moveDrag(e) {
    if (!isDragging || !placeholder || !tabsContainer) return;
    var x = e.touches ? e.touches[0].clientX : e.clientX;
    var idx = insertIdx(x);
    if (idx < 0) return;
    var tabs = tabsContainer.querySelectorAll('.tab:not(.drag-placeholder)');
    if (idx >= tabs.length) tabsContainer.appendChild(placeholder);
    else tabsContainer.insertBefore(placeholder, tabs[idx]);
  }

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    var tab = e.target.closest('.tab');
    if (!tab) return;
    touchMoved = false; dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(function () { if (!touchMoved) startDrag(tab, e); }, LONG_PRESS_MS);
  }

  function onTouchMove(e) {
    if (longPressTimer) {
      var dx = Math.abs((e.touches[0].clientX - dragStartX));
      var dy = Math.abs((e.touches[0].clientY - dragStartY));
      if (dx > 8 || dy > 8) touchMoved = true;
    }
    if (isDragging) { e.preventDefault(); moveDrag(e); }
  }

  function onTouchEnd(e) {
    clearTimeout(longPressTimer);
    if (isDragging) endDrag();
  }

  document.addEventListener('touchstart', onTouchStart, { passive: false });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd);

  document.addEventListener('mousedown', function (e) {
    var tab = e.target.closest('.tab');
    if (!tab) return;
    mouseDownTab = tab; dragStartX = e.clientX; dragStartY = e.clientY;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(function () { if (mouseDownTab === tab && !isDragging) startDrag(tab, e); }, LONG_PRESS_MS);
  });
  document.addEventListener('mousemove', function (e) { if (isDragging) { e.preventDefault(); moveDrag(e); } });
  document.addEventListener('mouseup', function () { clearTimeout(longPressTimer); mouseDownTab = null; if (isDragging) endDrag(); });
  document.addEventListener('click', function (e) { if (isDragging) { e.preventDefault(); e.stopImmediatePropagation(); } isDragging = false; }, true);

  /* Boot: load the persistent cache, resolve the pending instant-paint view,
     capture this screen and render the tab bar. */
  _navCache = loadCache();

  function cacheCurrentPage() {
    _currentTab = detectActive();
    snapshotCurrent();
  }

  function boot() {
    requestAnimationFrame(function () {
      consumePendingView();
      cacheCurrentPage();
      renderTabs();
      /* Late population (IndexedDB-backed lists) — refresh once more. */
      setTimeout(function () { snapshotCurrent(); }, 1200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Leaving the page (a tab tap already snapshots; this covers the back
     gesture, external links and app exit) — persist the freshest view. */
  window.addEventListener('pagehide', function () {
    try { snapshotCurrent(); } catch (e) {}
  });

  window.MateyTabs = {
    switchTab: switchTab,
    getCurrentTab: function() { return _currentTab; },
    teardown: teardownViewListeners,
    snapshot: snapshotCurrent
  };

  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appStateChange', function(state) {
      if (!state.isActive) {
        try { snapshotCurrent(); } catch (e) {}
        try { window.MateyTabs.teardown(); } catch (e) {}
      }
    });
  }
})();

/* Matey Tabs — Draggable reorder + smooth navigation with cached repeat views.
 * First visit loads normally; return visits to a tab are instant (cached DOM swap). */
(function () {
  'use strict';
  var TAB_ORDER = ['lifestyle', 'vots', 'editor', 'journal', 'agent'];
  var LONG_PRESS_MS = 800;
  var isDragging = false, dragTab = null, dragStartX = 0, dragStartY = 0;
  var longPressTimer = null, touchMoved = false, placeholder = null, tabsContainer = null;
  var mouseDownTab = null;

  /* --- Navigation cache: id -> mainHtml --- */
  var _navCache = {};
  var _currentTab = null;

  function loadOrder() {
    try {
      var raw = localStorage.getItem('matey-tab-order');
      if (raw) { var p = JSON.parse(raw); if (Array.isArray(p) && p.length === TAB_ORDER.length) return p; }
    } catch (e) {}
    return TAB_ORDER.slice();
  }
  var order = loadOrder();
  function saveOrder(o) { try { localStorage.setItem('matey-tab-order', JSON.stringify(o)); } catch (e) {} }

  function tabUrl(id) {
    return ({ 'lifestyle': './lifestyle.html', 'vots': './vots.html', 'editor': './raw-editor.html', 'journal': './journal.html', 'agent': './preview.html' })[id] || '#';
  }

  function tabLabel(id) {
    return ({ 'lifestyle': 'Lifestyle', 'vots': 'My-VOTS', 'editor': '>edit', 'journal': 'Journal', 'agent': '>agent' })[id] || id;
  }

  function detectActive() {
    var path = window.location.pathname.replace(/\/$/, ''), hash = window.location.hash || '';
    if (path.indexOf('lifestyle') !== -1) return 'lifestyle';
    if (path.indexOf('vots') !== -1) return 'vots';
    if (path.indexOf('raw-editor') !== -1) return 'editor';
    if (path.indexOf('journal') !== -1) return 'journal';
    if (hash === '#agent' || path.indexOf('preview') !== -1 || path.indexOf('agent') !== -1) return 'agent';
    return 'lifestyle';
  }

  /* Navigate to a tab. Cached = instant swap. Not cached = full load. */
  function switchTab(id) {
    if (id === _currentTab) return;

    /* Cached: instant DOM swap, no page reload */
    if (_navCache[id]) {
      var mainEl = document.querySelector('main.content') || document.querySelector('main');
      if (mainEl) {
        _currentTab = id;

        /* rAF injection: yield to browser paint cycle before heavy DOM swap */
        requestAnimationFrame(function () {
          mainEl.innerHTML = _navCache[id];

          if (tabsContainer) {
            tabsContainer.querySelectorAll('.tab').forEach(function (t) {
              t.classList.toggle('active', t.getAttribute('data-tab') === id);
            });
          }

          /* Automatic incognito routing on instant (cached) tab switches —
             MY-VOTS / JOURNAL force ON; others revert OFF unless manually locked. */
          if (window.MateyIncognito && window.MateyIncognito.routeForTab) {
            try { window.MateyIncognito.routeForTab(id); } catch (e) {}
          }

          if (window.history && window.history.replaceState) {
            try { window.history.replaceState({ tab: id }, '', './' + id + (id === 'agent' ? '#agent' : '')); } catch (e) {}
          }
        });
        return;
      }
    }

    /* Not cached: full page load (page will cache itself on load) */
    window.location.href = tabUrl(id) + (id === 'agent' ? '#agent' : '');
  }

  /* Cache current page's main content on load */
  function cacheCurrentPage() {
    var id = detectActive();
    _currentTab = id;
    var mainEl = document.querySelector('main.content') || document.querySelector('main');
    if (mainEl && !_navCache[id]) {
      _navCache[id] = mainEl.innerHTML;
    }
  }

  function renderTabs() {
    var c = document.querySelector('.tabs');
    if (!c) return;
    tabsContainer = c; c.innerHTML = '';
    var active = detectActive();
    _currentTab = active;
    order.forEach(function (id) {
      var a = document.createElement('a');
      a.className = 'tab' + (id === active ? ' active' : '');
      a.href = tabUrl(id); a.setAttribute('data-tab', id);
      a.textContent = tabLabel(id);
      c.appendChild(a);
    });

    c.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        e.preventDefault();
        var id = tab.getAttribute('data-tab');
        if (id) switchTab(id);
      });
    });
  }

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(function () {
        cacheCurrentPage();
        renderTabs();
      });
    });
  } else {
    requestAnimationFrame(function () {
      cacheCurrentPage();
      renderTabs();
    });
  }

  window.MateyTabs = { switchTab: switchTab, getCurrentTab: function() { return _currentTab; } };
})();

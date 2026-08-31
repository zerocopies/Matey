/* Matey Tabs — Draggable reorder with long-press + swipe navigation, localStorage persistence */
(function () {
  'use strict';

  var TAB_ORDER = ['lifestyle', 'vots', 'editor', 'journal', 'agent'];
  var LONG_PRESS_MS = 800;
  var isDragging = false, dragTab = null, dragStartX = 0, dragStartY = 0;
  var longPressTimer = null, touchMoved = false, placeholder = null, tabsContainer = null;
  var mouseDownTab = null;
  var navOverlay = null;

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
    return ({ 'lifestyle': './lifestyle.html', 'vots': './vots.html', 'editor': './raw-editor.html', 'journal': './journal.html', 'agent': './preview.html#agent' })[id] || '#';
  }

  function ensureNavOverlay() {
    if (!navOverlay) {
      navOverlay = document.createElement('div');
      navOverlay.className = 'matey-nav-overlay';
      navOverlay.innerHTML = '<div class="matey-nav-spinner"></div>';
      document.body.appendChild(navOverlay);
      navOverlay.offsetHeight;
    }
    return navOverlay;
  }

  function showNavOverlay() {
    var overlay = ensureNavOverlay();
    overlay.classList.add('visible');
  }

  function hideNavOverlay() {
    if (navOverlay) navOverlay.classList.remove('visible');
  }

  function tabUrl(id) {
    return ({ 'lifestyle': './lifestyle.html', 'vots': './vots.html', 'editor': './raw-editor.html', 'journal': './journal.html', 'agent': './preview.html#agent' })[id] || '#';
  }

  function renderTabs() {
    var c = document.querySelector('.tabs');
    if (!c) return;
    tabsContainer = c; c.innerHTML = '';
    var path = window.location.pathname.replace(/\/$/, ''), hash = window.location.hash || '', active = '';
    if (path.indexOf('lifestyle') !== -1) active = 'lifestyle';
     else if (path.indexOf('vots') !== -1) active = 'vots';
    else if (path.indexOf('raw-editor') !== -1) active = 'editor';
    else if (path.indexOf('journal') !== -1) active = 'journal';
    else if (hash === '#agent') active = 'agent';
    else if (path.indexOf('preview') !== -1) active = 'agent';
    else if (path.indexOf('editor') !== -1) active = 'editor';
    else active = 'lifestyle';
      var labels = { 'lifestyle': 'Lifestyle', 'vots': 'My-VOTS', 'editor': '>edit', 'journal': 'Journal', 'agent': '>agent' };
    order.forEach(function (id) {
      var a = document.createElement('a');
      a.className = 'tab' + (id === active ? ' active' : '');
      a.href = tabUrl(id); a.setAttribute('data-tab', id);
      a.textContent = labels[id] || id;
      c.appendChild(a);
    });

    /* Intercept tab clicks to show navigation overlay */
    c.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        var href = tab.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('#')) {
          e.preventDefault();
          showNavOverlay();
          setTimeout(function () { window.location.href = href; }, 120);
        }
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

  /* init */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderTabs);
  else renderTabs();
})();
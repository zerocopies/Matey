(function() {
  'use strict';
  // True filled-pie chart: draws an SVG arc path that represents a slice of a circle.
  // At 100% the circle is fully filled. As tokens consume, the pie shrinks clockwise
  // from 12 o'clock, leaving the consumed portion transparent.
  function pieSlice(cx, cy, r, pct) {
    if (pct >= 0.999) return circle(cx, cy, r);
    if (pct <= 0) return '';
    var angle = pct * 2 * Math.PI;
    var x0 = cx, y0 = cy - r;             // 12 o'clock
    var x1 = cx + r * Math.sin(angle);
    var y1 = cy - r * Math.cos(angle);
    var largeArc = angle > Math.PI ? 1 : 0;
    return 'M ' + cx + ' ' + cy +
           ' L ' + x0 + ' ' + y0 +
           ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x1 + ' ' + y1 +
           ' Z';
  }
  function circle(cx, cy, r) {
    return 'M ' + cx + ' ' + (cy - r) +
           ' A ' + r + ' ' + r + ' 0 1 0 ' + cx + ' ' + (cy + r) +
           ' A ' + r + ' ' + r + ' 0 1 0 ' + cx + ' ' + (cy - r) +
           ' Z';
  }

  function updateUsageRing(percent) {
    var seg = document.querySelector('.usage-ring-segment');
    if (!seg) return;
    var v = Math.max(0, Math.min(100, Math.round(percent)));
    seg.setAttribute('d', pieSlice(18, 18, 15, v / 100));
    seg.classList.toggle('low', v < 30);
  }

  /* ==================== Automatic tab-based incognito routing ====================
   * Reuses the exact existing incognito toggle — the SAME class pair the header
   * button already flips on click:
   *   .incognito-trigger.active  → ghost renders active state (red eyes / red mouth,
   *                                theme-adaptive body fill)
   *   body.incognito-active       → global page-level incognito styling
   * No new banners, badges, text labels or alternate icons are created.
   *
   * Routing rules:
   *   - Navigating to MY-VOTS or JOURNAL  → programmatically flip incognito ON.
   *   - Navigating away to AGENT /
   *     LIFESTYLE / EDITOR (editor)        → revert to default OFF, UNLESS the user
   *                                          manually locked incognito on before.
   * The manual lock is the persisted 'matey-incognito' flag that the header button
   * writes when clicked by the user; automatic routing never writes it, so switching
   * tabs can never silently unpin a deliberate manual lock.
   */
  function getIncognitoBtn() {
    return document.querySelector('.incognito-trigger, .incognito-btn');
  }

  function setIncognitoVisual(on) {
    var btn = getIncognitoBtn();
    if (!btn) return;
    btn.classList.toggle('active', !!on);
    document.body.classList.toggle('incognito-active', !!on);
  }

  function isPrivatePage() {
    var p = window.location.pathname || '';
    var meta = document.querySelector('meta[name="page-type"]');
    var metaType = meta ? (meta.getAttribute('content') || '') : '';
    var dataPage = document.body ? (document.body.getAttribute('data-page') || '') : '';
    return p.indexOf('journal.html') !== -1 ||
           p.indexOf('vots.html') !== -1 ||
           metaType === 'journal' || metaType === 'vots' ||
           dataPage === 'journal' || dataPage === 'vots';
  }

  function isManualIncognitoLock() {
    try { return localStorage.getItem('matey-incognito') === '1'; } catch (e) { return false; }
  }

  function routeForPage() {
    if (isPrivatePage()) setIncognitoVisual(true);
    else setIncognitoVisual(isManualIncognitoLock());
  }

  /* Tab ids on this page: lifestyle | vots | markdown/editor | journal | agent */
  function routeForTab(tabId) {
    if (tabId === 'vots' || tabId === 'journal') setIncognitoVisual(true);
    else setIncognitoVisual(isManualIncognitoLock());
  }

  window.MateyIncognito = {
    set: function (on) { setIncognitoVisual(on ? true : false); },
    setManual: function (on) {
      setIncognitoVisual(on ? true : false);
      try { localStorage.setItem('matey-incognito', on ? '1' : '0'); } catch (e) {}
    },
    isOn: function () { return document.body.classList.contains('incognito-active'); },
    routeForPage: routeForPage,
    routeForTab: routeForTab
  };

  function init() {
    updateUsageRing(100);   // full circle — starts at 100%, depletes as tokens consume
    window.MateyUsage = { update: updateUsageRing };

    var incBtn = getIncognitoBtn();
    if (incBtn) {
      // Exact existing toggle logic — clicking the ghost flips the active state.
      incBtn.addEventListener('click', function() {
        var next = !incBtn.classList.contains('active');
        setIncognitoVisual(next);
        try { localStorage.setItem('matey-incognito', next ? '1' : '0'); } catch(e) {}
      });

      // Automatic routing on page load (MY-VOTS / JOURNAL force ON;
      // AGENT / LIFESTYLE / EDITOR revert OFF unless manually locked).
      routeForPage();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
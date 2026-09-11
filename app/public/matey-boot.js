/* Matey Boot — native detection + one-time snap→matey data migration */
(function () {
  'use strict';
  var isNative =
    (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && /Android/i.test(navigator.userAgent));
  if (isNative) document.documentElement.classList.add('native-app');

  /* ---- migrate legacy snap-* stores into unified matey-* stores ---- */
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ss(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function move(oldK, newK) { var v = ls(oldK); if (v !== null && ls(newK) === null) ss(newK, v); if (v !== null) del(oldK); }
  function mergeArray(oldK, newK, map) {
    var oldRaw = ls(oldK); if (oldRaw === null) return;
    var oldArr, newArr;
    try { oldArr = JSON.parse(oldRaw) || []; } catch (e) { del(oldK); return; }
    try { newArr = JSON.parse(ls(newK) || '[]') || []; } catch (e) { newArr = []; }
    oldArr.forEach(function (item) { newArr.push(map ? map(item) : item); });
    ss(newK, JSON.stringify(newArr));
    del(oldK);
  }
  var noteMap = function (n) { return { type: n.type || 'permanent', content: n.content || n.text || '', topic: n.topic, created: n.created || n.time || Date.now(), expires: n.expires };
  };
  mergeArray('snap-vault', 'matey-vault', noteMap);
  mergeArray('snap-session-notes', 'matey-session-notes', noteMap);
  mergeArray('snap-priority', 'matey-priority', noteMap);
  mergeArray('snap-recap', 'matey-recap');
  // profile: snap stored JSON object; matey stores plain string
  var sp = ls('snap-profile');
  if (sp !== null) {
    if (ls('matey-profile') === null) {
      try { var o = JSON.parse(sp); ss('matey-profile', o && o.about ? o.about : (typeof o === 'string' ? o : '')); } catch (e) { ss('matey-profile', sp); }
    }
    del('snap-profile');
  }
  move('snap-ai-learning', 'matey-ai-learning');
  move('snap-ai-start', 'matey-ai-start');
  move('snap-intel-feed', 'matey-intel-feed');
  move('snap-feed-generated', 'matey-feed-generated');
  move('snap-last-visit', 'matey-last-visit');
  move('snap-vibe-shown', 'matey-vibe-shown');

  /* ---- Instant cached paint (tab navigation) ----
   * A cached tab switch stashes the target screen's shell in sessionStorage
   * ('matey-pending-view', written by matey-tabs.js just before it navigates).
   * This runs in <head>, before the body parses, so the cached view paints
   * with zero white flash while the real page loads and wires underneath.
   * matey-tabs.js removes the overlay once the real page is ready. */
  try {
    var pv = null;
    try { pv = JSON.parse(sessionStorage.getItem('matey-pending-view') || 'null'); } catch (e) { pv = null; }
    if (pv && pv.html && pv.ver === String(window.MATEY_CSS_VERSION || '0')) {
      /* Only paint on the page the stash was written for (back navigation
         to a different screen must not flash the wrong view). */
      var pvPath = window.location.pathname;
      var pvMatch =
        (pv.tab === 'lifestyle' && pvPath.indexOf('lifestyle') !== -1) ||
        (pv.tab === 'vots' && pvPath.indexOf('vots') !== -1) ||
        (pv.tab === 'journal' && pvPath.indexOf('journal') !== -1) ||
        (pv.tab === 'agent' && (pvPath.indexOf('preview') !== -1 || pvPath.indexOf('agent') !== -1));
      if (pvMatch) {
        var ov = document.createElement('div');
        ov.id = 'matey-instant-view';
        ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483000;overflow-y:auto;' +
          'background:var(--app-bg, var(--bg, #000));-webkit-overflow-scrolling:touch;';
        ov.innerHTML = pv.html;
        (document.body || document.documentElement).appendChild(ov);
        try {
          if (pv.scrolls && pv.scrolls.length) {
            var ovEls = ov.querySelectorAll('*'), k = 0;
            for (var i = 0; i < ovEls.length && k < pv.scrolls.length - 1; i++) {
              var el = ovEls[i];
              if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 40) el.scrollTop = pv.scrolls[k++] || 0;
            }
            ov.scrollTop = pv.scrolls[pv.scrolls.length - 1] || 0;
          }
        } catch (e) {}
        /* Safety net: never trap the user behind a stale overlay if the
           target page fails to finish booting. */
        setTimeout(function () {
          var o = document.getElementById('matey-instant-view');
          if (o && o.parentNode) o.parentNode.removeChild(o);
          try { sessionStorage.removeItem('matey-pending-view'); } catch (e) {}
        }, 4000);
      }
    }
  } catch (e) {}
})();

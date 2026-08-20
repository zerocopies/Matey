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
})();

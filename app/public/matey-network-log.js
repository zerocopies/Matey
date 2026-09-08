/* MateyNetworkLog — Transparency log for outbound network activity.
 * Records every outbound hostname the app's own fetch calls reach.
 * Stored in localStorage, surfaced in Settings > Privacy > Network Activity. */
(function () {
  'use strict';
  var STORAGE_KEY = 'matey-network-log';
  var MAX_ENTRIES = 200;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function save(entries) {
    try {
      var trimmed = entries.slice(-MAX_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {}
  }

  function extractHostname(url) {
    if (!url) return null;
    try {
      var u = new URL(url);
      return u.hostname || null;
    } catch (e) {
      var m = String(url).match(/^[a-zA-Z]+:\/\/([^/]+)/);
      return m ? m[1] : null;
    }
  }

  window.MateyNetworkLog = {
    extractHostname: extractHostname,

    log(url, opts) {
      var hostname = extractHostname(url);
      if (!hostname) return;
      var entries = load();
      entries.push({
        ts: Date.now(),
        hostname: hostname,
        method: (opts && opts.method || 'GET').toUpperCase()
      });
      save(entries);
      return hostname;
    },

    getEntries() { return load(); },

    getUniqueHosts() {
      var seen = {};
      load().forEach(function (e) { seen[e.hostname] = (seen[e.hostname] || 0) + 1; });
      return Object.keys(seen).map(function (h) {
        return { hostname: h, count: seen[h] };
      }).sort(function (a, b) { return b.count - a.count; });
    },

    clear() { save([]); }
  };
})();

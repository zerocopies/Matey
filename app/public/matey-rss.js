/* Matey RSS — fetch + filter hooks against personalization profile */
(function () {
  'use strict';
  var FEEDS_KEY = 'matey-rss-feeds';
  function feeds() { try { return JSON.parse(localStorage.getItem(FEEDS_KEY) || '[]'); } catch (e) { return []; } }
  function saveFeeds(d) { localStorage.setItem(FEEDS_KEY, JSON.stringify(d)); }

  function fetchWithProxy(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.text();
    }).catch(function () {
      return fetch('https://api.allorigins.dev/raw?url=' + encodeURIComponent(url)).then(function (r) {
        if (!r.ok) throw new Error('proxy ' + r.status);
        return r.text();
      });
    });
  }
  function fetchFeed(url) {
    return fetchWithProxy(url)
      .then(function (xml) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(xml, 'text/xml');
        var items = [];
        doc.querySelectorAll('item, entry').forEach(function (el) {
          items.push({
            title: (el.querySelector('title') || {}).textContent || '',
            link: (el.querySelector('link') || {}).textContent || el.querySelector('link')?.getAttribute('href') || '',
            desc: ((el.querySelector('description') || el.querySelector('summary') || {}).textContent || '').substring(0, 300)
          });
        });
        return items;
      });
  }

  function filterAgainstProfile(items) {
    var profile = '';
    try { profile = localStorage.getItem('matey-profile') || ''; } catch (e) {}
    if (!profile) return items;
    var words = profile.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 3; });
    return items.filter(function (item) {
      var txt = (item.title + ' ' + item.desc).toLowerCase();
      return words.some(function (w) { return txt.indexOf(w) !== -1; });
    });
  }

  function refreshAll(onItem) {
    feeds().forEach(function (f) {
      fetchFeed(f.url).then(function (items) {
        return filterAgainstProfile(items);
      }).then(function (filtered) {
        filtered.forEach(function (item) { if (onItem) onItem(item, f.name); });
      }).catch(function () {});
    });
  }

  window.MateyRSS = { feeds: feeds, saveFeeds: saveFeeds, fetchFeed: fetchFeed, filterAgainstProfile: filterAgainstProfile, refreshAll: refreshAll };
})();

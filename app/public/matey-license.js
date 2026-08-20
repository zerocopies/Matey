/* Matey License — monetization shell ($5/mo, extensible lifetime) */
(function () {
  'use strict';
  var KEY = 'matey-license';
  function get() { try { return JSON.parse(localStorage.getItem(KEY) || '{"tier":"free","expires":null}'); } catch (e) { return { tier: 'free', expires: null }; } }
  function set(tier) { localStorage.setItem(KEY, JSON.stringify({ tier: tier, expires: tier === 'pro' ? Date.now() + 30 * 86400000 : null })); }
  function isPro() { var l = get(); if (l.tier !== 'pro') return false; if (l.expires && Date.now() > l.expires) { set('free'); return false; } return true; }
  function upgrade() { set('pro'); }
  window.MateyLicense = { get: get, set: set, isPro: isPro, upgrade: upgrade };
})();

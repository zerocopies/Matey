/* Matey License — one-time unlock system ("Matey ∞"), no subscriptions, no expiry.
   Tiers: 'free' (base) | 'unlocked' (one-time lifetime purchase). Legacy 'pro' maps to unlocked. */
(function () {
  'use strict';
  var KEY = 'matey-license';
  var UNLOCK_PRICE_USD = 9.99;

  // Feature gates bundled into the one-time unlock.
  var PAID_FEATURES = {
    memory: 'Unlimited permanent notes + full recap history',
    recall: 'Ask Matey — deep memory retrieval across your vault',
    agent: 'Proactive actions — daily brief, priority board, scheduled reminders',
    sync: 'Encrypted multi-device sync',
    keys: 'BYOK providers + local model support',
    themes: 'All themes'
  };

  function get() {
    try {
      var l = JSON.parse(localStorage.getItem(KEY));
      if (!l || typeof l !== 'object') return { tier: 'free', orderId: null, purchased: null };
      // one-time purchase is permanent; no expiry field is used
      if (l.tier === 'unlocked') return l;
      if (l.tier === 'pro') return { tier: 'unlocked', orderId: l.orderId || null, purchased: l.purchased || l.expires || null };
      return { tier: 'free', orderId: null, purchased: null };
    } catch (e) { return { tier: 'free', orderId: null, purchased: null }; }
  }

  function isUnlocked() { return get().tier === 'unlocked'; }

  // Alias kept for any legacy callers.
  function isPro() { return isUnlocked(); }

  function upgrade() {
    localStorage.setItem(KEY, JSON.stringify({ tier: 'unlocked', orderId: 'local-' + Date.now(), purchased: Date.now() }));
  }

  // Feature gate. feature in memory|recall|agent|sync|keys|themes
  function has(feature) { return isUnlocked() || PAID_FEATURES[feature] === undefined; }

  function listFeatures() { return PAID_FEATURES; }

  window.MateyLicense = { get: get, isUnlocked: isUnlocked, isPro: isPro, upgrade: upgrade, has: has, features: listFeatures, PRICE: UNLOCK_PRICE_USD };
})();

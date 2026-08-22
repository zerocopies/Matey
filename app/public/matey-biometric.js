/* Matey App Lock — app-level PIN/biometric lock
 * Uses Web Crypto API for PIN storage (hashed, not plaintext)
 * Falls back to PIN-only if biometrics unavailable (no native plugins installed)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'matey-app-lock';
  var SESSION_KEY = 'matey-app-lock-session';
  var SESSION_DURATION = 5 * 60 * 1000; // 5 minutes of unlocked session

  var lockSettings = {
    enabled: false,
    pin: null,
    useBiometric: false,
    _pinHash: null,
    _salt: null
  };

  var isUnlocked = false;
  var listeners = [];

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  async function hashPin(pin, salt) {
    var enc = new TextEncoder();
    var data = enc.encode(pin + salt);
    var hashBuffer = await crypto.subtle.digest('SHA-256', data);
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function generateSalt() {
    var arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function setPin(pin) {
    var salt = generateSalt();
    var pinHash = await hashPin(pin, salt);
    var settings = getSettings();
    settings.enabled = true;
    settings.useBiometric = false;
    settings._pinHash = pinHash;
    settings._salt = salt;
    saveSettings(settings);
    lockSettings = settings;
  }

  async function verifyPin(pin) {
    var settings = getSettings();
    if (!settings.enabled || !settings._pinHash) return false;
    var inputHash = await hashPin(pin, settings._salt);
    return inputHash === settings._pinHash;
  }

  function isLockEnabled() {
    var settings = getSettings();
    return settings.enabled && settings._pinHash;
  }

  function lock() {
    isUnlocked = false;
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    notifyListeners('locked');
  }

  function checkSession() {
    try {
      var session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
      if (session.unlocked && session.expires > Date.now()) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function unlock(pin) {
    return verifyPin(pin).then(function (valid) {
      if (valid) {
        isUnlocked = true;
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify({
            unlocked: true,
            expires: Date.now() + SESSION_DURATION
          }));
        } catch (e) {}
        notifyListeners('unlocked');
        return true;
      }
      notifyListeners('lockFailed');
      return false;
    });
  }

  function isLocked() {
    if (checkSession()) return false;
    return isLockEnabled() && !isUnlocked;
  }

  function removeLock() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    isUnlocked = false;
  }

  function notifyListeners(event, data) {
    listeners.forEach(function (fn) { fn(event, data); });
  }

  function onLockChange(fn) {
    if (listeners.indexOf(fn) === -1) listeners.push(fn);
  }

  function supportsBiometric() {
    // No native biometric plugins installed — biometric not available
    // Could integrate @capacitor-community/biometric when added to package.json
    return false;
  }

  window.MateyAppLock = {
    isLockEnabled: isLockEnabled,
    isLocked: isLocked,
    setPin: setPin,
    verifyPin: verifyPin,
    unlock: unlock,
    lock: lock,
    removeLock: removeLock,
    supportsBiometric: supportsBiometric,
    onLockChange: onLockChange
  };
})();

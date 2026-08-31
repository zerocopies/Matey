(function() {
  var PROFILE_KEY = 'matey-profile';

  function loadProfile() {
    var raw = localStorage.getItem(PROFILE_KEY) || '';
    var el = document.getElementById('profile-about');
    if (el) el.value = raw;
  }

  function saveProfile(e) {
    e.preventDefault();
    var el = document.getElementById('profile-about');
    if (el) localStorage.setItem(PROFILE_KEY, el.value || '');
    var btn = document.querySelector('#profile-form .submit-btn');
    if (btn) { var orig = btn.textContent; btn.textContent = '✓ Saved!'; setTimeout(function () { btn.textContent = orig; }, 1500); }
  }

  function getProfile() {
    return { about: localStorage.getItem(PROFILE_KEY) || '' };
  }

  window.MateyProfile = { load: loadProfile, save: saveProfile, get: getProfile };
  document.addEventListener('DOMContentLoaded', loadProfile);
})();

/* Matey Luxury Theme Toggle — cycles glass → imperial → ivory (temporary UI).
 * Applies data-theme on <body>; the Luxury token blocks in matey-preview.css
 * theme every component. Persisted in localStorage (matey-lux-theme). */
(function () {
  'use strict';

  var KEY = 'matey-lux-theme';
  var THEMES = ['glass', 'imperial', 'ivory'];
  var LABELS = { glass: 'Glass', imperial: 'Imperial', ivory: 'Ivory' };

  function current() {
    var t = null;
    try { t = localStorage.getItem(KEY); } catch (e) { t = null; }
    if (THEMES.indexOf(t) === -1) t = 'glass';
    return t;
  }

  function apply(theme) {
    if (THEMES.indexOf(theme) === -1) theme = 'glass';
    document.body.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    var btn = document.getElementById('lux-theme-toggle');
    if (btn) {
      var label = LABELS[theme];
      btn.title = 'Theme: ' + label + ' (tap to cycle)';
      btn.setAttribute('aria-label', btn.title);
    }
  }

  function init() {
    apply(current());
    var actions = document.querySelector('.header-actions');
    if (!actions) return;
    var btn = document.getElementById('lux-theme-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'lux-theme-toggle';
      btn.type = 'button';
      btn.className = 'lux-theme-toggle';
      btn.innerHTML = '🎨';
      var vaultBtn = document.getElementById('vault-launcher');
      actions.insertBefore(btn, vaultBtn ? vaultBtn.nextSibling : null);
    }
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var idx = THEMES.indexOf(current());
      apply(THEMES[(idx + 1) % THEMES.length]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MateyThemeToggle = { apply: apply, themes: THEMES, current: current };
})();
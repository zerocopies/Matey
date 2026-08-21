/* Matey Keyboard — visualViewport-aware layout so UI stays organized when keyboard opens */
(function () {
  'use strict';

  var KEYBOARD_CSS =
    '.agentic-input-bar { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px)); }' +
    '.content { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px)); }' +
    '.tabs-wrap { padding-bottom: env(safe-area-inset-bottom, 0px); }' +
    '.hook-section { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px)); }';

  var styleEl = document.createElement('style');
  styleEl.textContent = KEYBOARD_CSS;
  document.head.appendChild(styleEl);

  function updateKeyboardOffset() {
    var vv = window.visualViewport;
    var offset = 0;
    if (vv && vv.height < window.innerHeight) {
      offset = Math.max(0, window.innerHeight - vv.height);
    }
    document.documentElement.style.setProperty('--keyboard-offset', offset + 'px');
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateKeyboardOffset);
    window.visualViewport.addEventListener('scroll', updateKeyboardOffset);
  }
  window.addEventListener('orientationchange', function () {
    setTimeout(updateKeyboardOffset, 200);
  });
  window.addEventListener('load', updateKeyboardOffset);
  updateKeyboardOffset();
})();

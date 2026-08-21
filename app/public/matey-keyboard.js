/* Matey Keyboard — visualViewport-aware layout so UI stays organized when keyboard opens */
(function () {
  'use strict';
  var KEYBOARD_CSS = '.chat-overlay.open .chat-dialog { bottom: var(--keyboard-offset, 0px) !important; }' +
    '.content { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px)) !important; }' +
    '.settings-overlay.open .settings-body { padding-bottom: calc(32px + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px)) !important; }' +
    '.lifestyle-body { padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px)) !important; }';

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

  var chatOverlay = document.getElementById('chat-overlay');
  if (chatOverlay) chatOverlay.classList.remove('open');
  var settings = document.getElementById('settings');
  if (settings) settings.classList.remove('open');
})();

/* Matey Keyboard — visualViewport-aware layout so UI stays organized when keyboard opens */
(function () {
  'use strict';
  var KEYBOARD_CSS =
    '.content { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px)) !important; }' +
    '.settings-overlay.open .settings-body { padding-bottom: calc(32px + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px)) !important; }' +
    '.lifestyle-body { padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px)) !important; }' +
    '.md-composer { bottom: var(--keyboard-gap, 0px); padding-bottom: calc(12px + 8px + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px)); }';

  var styleEl = document.createElement('style');
  styleEl.textContent = KEYBOARD_CSS;
  document.head.appendChild(styleEl);

  function updateKeyboardOffset() {
    var vv = window.visualViewport;
    var offset = 0;
    var gap = 0;
    if (vv && vv.height < window.innerHeight) {
      offset = Math.max(0, window.innerHeight - vv.height);
      gap = 12;
    }
    document.documentElement.style.setProperty('--keyboard-offset', offset + 'px');
    document.documentElement.style.setProperty('--keyboard-gap', gap + 'px');
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateKeyboardOffset);
    window.visualViewport.addEventListener('scroll', updateKeyboardOffset);
  }
  window.addEventListener('resize', updateKeyboardOffset);
  window.addEventListener('orientationchange', function () {
    setTimeout(updateKeyboardOffset, 200);
  });
  window.addEventListener('load', updateKeyboardOffset);
  updateKeyboardOffset();

  var settings = document.getElementById('settings');
  if (settings) settings.classList.remove('open');

  function insertAtCursor(inputEl, text) {
    var start = inputEl.selectionStart;
    var end = inputEl.selectionEnd;
    var val = inputEl.value;
    inputEl.value = val.substring(0, start) + text + val.substring(end);
    var newPos = start + text.length;
    inputEl.selectionStart = newPos;
    inputEl.selectionEnd = newPos;
  }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('#md-symbol-toolbar button[data-key]');
    if (!btn) return;
    var textarea = document.getElementById('md-compose-input');
    if (!textarea) return;
    textarea.focus();
    insertAtCursor(textarea, btn.getAttribute('data-key'));
  });

  var composeInput = document.getElementById('md-compose-input');
  if (composeInput) {
    function autoExpand() {
      composeInput.style.height = 'auto';
      composeInput.style.height = Math.max(44, composeInput.scrollHeight) + 'px';
    }
    composeInput.addEventListener('input', autoExpand);
    composeInput.addEventListener('focus', autoExpand);
  }
})();

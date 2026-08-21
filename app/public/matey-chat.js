/* Matey Chat — floating trigger + overlay toggle + keyboard interface adjustment */
(function () {
  'use strict';

  var KEYBOARD_ADJUST_CSS =
    '.app-shell.chat-open { filter: brightness(0.85); }' +
    '.chat-overlay.open { z-index: 9999; }' +
    '.content.chat-keyboard { transform: translateY(0); transition: transform 0.2s ease; }' +
    '.tabs-wrap.chat-keyboard { transform: translateY(0); transition: transform 0.2s ease; }' +
    '.header.chat-keyboard { transform: translateY(0); transition: transform 0.2s ease; }';

  var styleEl = document.createElement('style');
  styleEl.textContent = KEYBOARD_ADJUST_CSS;
  document.head.appendChild(styleEl);

  function init() {
    var overlay = document.getElementById('chat-overlay');
    if (!overlay) return;

    var fab = document.createElement('button');
    fab.className = 'chat-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Chat');
    fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    document.body.appendChild(fab);

    function adjustForKeyboard(show) {
      var appShell = document.querySelector('.app-shell');
      var content = document.querySelector('.content');
      var tabsWrap = document.querySelector('.tabs-wrap');
      var header = document.querySelector('.header');

      if (show) {
        if (appShell) appShell.classList.add('chat-open');
        if (content) content.classList.add('chat-keyboard');
        if (tabsWrap) tabsWrap.classList.add('chat-keyboard');
        if (header) header.classList.add('chat-keyboard');
      } else {
        if (appShell) appShell.classList.remove('chat-open');
        if (content) content.classList.remove('chat-keyboard');
        if (tabsWrap) tabsWrap.classList.remove('chat-keyboard');
        if (header) header.classList.remove('chat-keyboard');
      }
    }

    function openChat() {
      overlay.classList.add('open');
      document.body.classList.add('chat-open');
      adjustForKeyboard(true);

      var field = overlay.querySelector('.chat-field');
      if (field) {
        /* Wait for DOM, then focus to trigger mobile keyboard */
        setTimeout(function () {
          if (field.focus) field.focus();
          /* On some mobile browsers, programmatic focus doesn't open keyboard */
          /* Try clicking the field as a fallback */
          if (field.click) {
            var ev = new MouseEvent('click', { bubbles: true, cancelable: true });
            field.dispatchEvent(ev);
          }
        }, 150);
      }
    }

    function closeChat() {
      overlay.classList.remove('open');
      document.body.classList.remove('chat-open');
      adjustForKeyboard(false);

      var field = overlay.querySelector('.chat-field');
      if (field) field.blur();

      /* Dismiss keyboard by creating and focusing a detached element */
      var tmp = document.createElement('input');
      tmp.type = 'text';
      tmp.style.position = 'absolute';
      tmp.style.top = '-100px';
      document.body.appendChild(tmp);
      tmp.focus();
      setTimeout(function () {
        if (tmp.parentNode) tmp.parentNode.removeChild(tmp);
      }, 100);
    }

    fab.addEventListener('click', function (e) {
      e.stopPropagation();
      if (overlay.classList.contains('open')) {
        closeChat();
      } else {
        openChat();
      }
    });

    /* Close chat when clicking backdrop */
    var backdrop = document.getElementById('chat-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        closeChat();
      });
    }

    /* Handle plus button */
    var plus = overlay.querySelector('.chat-plus');
    if (plus) {
      plus.addEventListener('click', function () {
        var field = overlay.querySelector('.chat-field');
        if (field) field.focus();
      });
    }

    /* Close on escape key */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) {
        closeChat();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

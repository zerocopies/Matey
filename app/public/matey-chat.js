/* Matey Chat — floating trigger + overlay toggle */
(function () {
  'use strict';
  function init() {
    var overlay = document.getElementById('chat-overlay');
    if (!overlay) return;

    var fab = document.createElement('button');
    fab.className = 'chat-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Chat');
    fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    document.body.appendChild(fab);

    function openChat() {
      overlay.classList.add('open');
      var field = overlay.querySelector('.chat-field');
      if (field) setTimeout(function () { field.focus(); }, 150);
    }
    function closeChat() {
      overlay.classList.remove('open');
    }

    fab.addEventListener('click', function (e) {
      e.stopPropagation();
      if (overlay.classList.contains('open')) {
        closeChat();
      } else {
        openChat();
      }
    });

    var backdrop = document.getElementById('chat-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        closeChat();
      });
    }

    var plus = overlay.querySelector('.chat-plus');
    if (plus) {
      plus.addEventListener('click', function () {
        var field = overlay.querySelector('.chat-field');
        if (field) field.focus();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

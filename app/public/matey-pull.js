/* Matey Pull-Down Bar — swipe down from top to reveal floating input */
(function () {
  'use strict';
  var hint, chatOverlay, chatBackdrop, pullActive = false, startY = 0, threshold = 80;

  function init() {
    hint = document.getElementById('pull-hint');
    chatOverlay = document.getElementById('chat-overlay');
    chatBackdrop = document.getElementById('chat-backdrop');
    if (!hint || !chatOverlay) return;

    document.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var scrollTop = document.querySelector('.content') ? document.querySelector('.content').scrollTop : 0;
      if (scrollTop > 5) return;
      if (chatOverlay.classList.contains('open')) return;
      startY = e.touches[0].clientY;
      pullActive = true;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!pullActive) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 10) {
        hint.classList.add('visible');
        hint.style.opacity = Math.min(1, dy / threshold);
      } else {
        hint.classList.remove('visible');
      }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (!pullActive) return;
      pullActive = false;
      hint.classList.remove('visible');
      var dy = e.changedTouches[0].clientY - startY;
      if (dy > threshold) {
        chatOverlay.classList.add('open');
        var field = chatOverlay.querySelector('.chat-field');
        if (field) setTimeout(function () { field.focus(); }, 100);
      }
    });

    if (chatBackdrop) {
      chatBackdrop.addEventListener('click', function () {
        chatOverlay.classList.remove('open');
      });
    }

    // also support clicking the pull-hint
    hint.addEventListener('click', function () {
      chatOverlay.classList.add('open');
      var field = chatOverlay.querySelector('.chat-field');
      if (field) setTimeout(function () { field.focus(); }, 100);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

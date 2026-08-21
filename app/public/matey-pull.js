/* Matey Pull-Down Bar — swipe down from top to reveal floating input */
(function () {
  'use strict';
  var hint, pullActive = false, startY = 0, threshold = 80;

  function init() {
    hint = document.getElementById('pull-hint');
    if (!hint) return;

    document.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var scrollTop = document.querySelector('.content') ? document.querySelector('.content').scrollTop : 0;
      if (scrollTop > 5) return;
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
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

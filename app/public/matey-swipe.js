/* Swipe navigation for Matey (updated tab order) */
(function() {
  var TAB_ORDER = ['starring', 'hooks', 'markdown', 'custom'];
  var SWIPE_THRESHOLD = 60;
  var isSwiping = false, startX = 0, startY = 0;

  function switchTab(direction) {
    var tabs = document.querySelectorAll('.tab');
    if (!tabs.length) return;
    var activeIdx = -1;
    tabs.forEach(function(t, i) { if (t.classList.contains('active')) activeIdx = i; });
    if (activeIdx === -1) activeIdx = 0;
    var newIdx = activeIdx + direction;
    if (newIdx < 0 || newIdx >= tabs.length) return;
    tabs[newIdx].click();
  }

  document.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    var overlay = document.querySelector('.settings-overlay.open');
    if (overlay) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = true;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (!isSwiping) return;
    isSwiping = false;
    var touch = e.changedTouches[0];
    var dx = touch.clientX - startX;
    var dy = touch.clientY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) switchTab(1);
      else switchTab(-1);
    }
  }, { passive: false });
})();


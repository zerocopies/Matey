(function() {
  function updateUsageRing(percent) {
    var ringText = document.getElementById('usage-ring-text');
    var segments = document.querySelectorAll('.usage-ring-segment');
    if (!ringText || segments.length === 0) return;
    var v = Math.max(0, Math.min(100, Math.round(percent)));
    segments.forEach(function(seg, i) {
      var threshold = (i + 1) * 25;
      seg.classList.toggle('inactive', v < threshold);
      seg.classList.toggle('low', v < 30);
    });
    ringText.textContent = v;
  }

  function init() {
    updateUsageRing(65);
    window.MateyUsage = { update: updateUsageRing };

    var dropdown = document.getElementById('workspace-dropdown');
    if (dropdown) {
      dropdown.addEventListener('click', function() {
        dropdown.classList.toggle('open');
      });
    }

    document.addEventListener('click', function(e) {
      if (e.target.closest('.workspace-dropdown')) return;
      var open = document.querySelector('.workspace-dropdown.open');
      if (open) open.classList.remove('open');
    });

    var incBtn = document.querySelector('.incognito-trigger');
    if (incBtn) {
      incBtn.addEventListener('click', function() {
        incBtn.classList.toggle('active');
        document.body.classList.toggle('incognito-active');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
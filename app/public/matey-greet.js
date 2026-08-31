(function() {
  // True filled-pie chart: draws an SVG arc path that represents a slice of a circle.
  // At 100% the circle is fully filled. As tokens consume, the pie shrinks clockwise
  // from 12 o'clock, leaving the consumed portion transparent.
  function pieSlice(cx, cy, r, pct) {
    if (pct >= 0.999) return circle(cx, cy, r);
    if (pct <= 0) return '';
    var angle = pct * 2 * Math.PI;
    var x0 = cx, y0 = cy - r;             // 12 o'clock
    var x1 = cx + r * Math.sin(angle);
    var y1 = cy - r * Math.cos(angle);
    var largeArc = angle > Math.PI ? 1 : 0;
    return 'M ' + cx + ' ' + cy +
           ' L ' + x0 + ' ' + y0 +
           ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x1 + ' ' + y1 +
           ' Z';
  }
  function circle(cx, cy, r) {
    return 'M ' + cx + ' ' + (cy - r) +
           ' A ' + r + ' ' + r + ' 0 1 0 ' + cx + ' ' + (cy + r) +
           ' A ' + r + ' ' + r + ' 0 1 0 ' + cx + ' ' + (cy - r) +
           ' Z';
  }

  function updateUsageRing(percent) {
    var seg = document.querySelector('.usage-ring-segment');
    if (!seg) return;
    var v = Math.max(0, Math.min(100, Math.round(percent)));
    seg.setAttribute('d', pieSlice(18, 18, 15, v / 100));
    seg.classList.toggle('low', v < 30);
  }

  function init() {
    updateUsageRing(100);   // full circle — starts at 100%, depletes as tokens consume
    window.MateyUsage = { update: updateUsageRing };

    var incBtn = document.querySelector('.incognito-trigger');
    if (incBtn) {
      incBtn.addEventListener('click', function() {
        incBtn.classList.toggle('active');
        document.body.classList.toggle('incognito-active');
        try { localStorage.setItem('matey-incognito', incBtn.classList.contains('active') ? '1' : '0'); } catch(e) {}
      });

      // Auto-trigger incognito on Journal page
      var isJournal = window.location.pathname.indexOf('journal.html') !== -1 ||
                      document.body.getAttribute('data-page') === 'journal' ||
                      document.querySelector('meta[name="page-type"]') &&
                      document.querySelector('meta[name="page-type"]').getAttribute('content') === 'journal';
      if (isJournal) {
        incBtn.classList.add('active');
        document.body.classList.add('incognito-active');
      }

      // Restore previous state
      try {
        var saved = localStorage.getItem('matey-incognito');
        if (saved === '1' && !isJournal) {
          incBtn.classList.add('active');
          document.body.classList.add('incognito-active');
        }
      } catch(e) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
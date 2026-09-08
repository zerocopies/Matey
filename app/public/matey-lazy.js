/* Stage 9B: Lazy loader for heavy secondary modules.
 * matey-beat.js is only needed when the user explicitly triggers vision
 * analysis. Loading it on demand keeps it out of the cold-start parse budget. */
(function () {
  'use strict';
  var _beatPromise = null;

  window.MateyLazy = {
    ensureBeat: function () {
      if (window.MateyBeat) return Promise.resolve(window.MateyBeat);
      if (!_beatPromise) {
        _beatPromise = import('./matey-beat.js').then(function () {
          return window.MateyBeat;
        }).catch(function (err) {
          _beatPromise = null;
          throw err;
        });
      }
      return _beatPromise;
    }
  };
})();

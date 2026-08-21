/* Matey Markdown — single-page editor, wired to syntax engine */
(function () {
  'use strict';
  var editor;
  var resultEl;
  var SAVE_DELAY = 600;
  var saveTimer = null;

  function saveToVault() {
    if (!editor) return;
    var text = editor.value;
    try { localStorage.setItem('matey-markdown', text); } catch (e) {}
    var lines = text.split('\n');
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      if (window.MateySyntax && typeof MateySyntax.parse === 'function') {
        var p = MateySyntax.parse(trimmed);
        if (p && p.type === 'math' && resultEl) {
          resultEl.innerHTML = '<div class="md-math-result">= ' + (p.result !== null && p.result !== undefined ? p.result : 'Error') + '</div>';
        }
      }
    });
  }

  function init() {
    editor = document.getElementById('md-editor');
    resultEl = document.getElementById('md-result');
    if (!editor) return;
    var KEY = 'matey-markdown';
    try { editor.value = localStorage.getItem(KEY) || ''; } catch (e) {}
    if (!resultEl) {
      var wrap = editor.parentElement;
      if (wrap) {
        resultEl = document.createElement('div');
        resultEl.id = 'md-result';
        resultEl.className = 'md-result';
        wrap.appendChild(resultEl);
      }
    }
    editor.addEventListener('input', function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveToVault, SAVE_DELAY);
    });
    editor.addEventListener('blur', function () {
      clearTimeout(saveTimer);
      saveToVault();
    });
    saveToVault();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* Matey Markdown — single-page editor, wired to syntax engine */
(function () {
  'use strict';
  var editor;
  var SAVE_DELAY = 600;
  var saveTimer = null;

  function saveToVault() {
    if (!editor) return;
    var text = editor.value;
    try { localStorage.setItem('matey-markdown', text); } catch (e) {}
    // Parse each non-empty line for syntax tokens
    var lines = text.split('\n');
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      if (window.MateySyntax && typeof MateySyntax.parse === 'function') {
        MateySyntax.parse(trimmed);
      }
    });
  }

  function init() {
    editor = document.getElementById('md-editor');
    if (!editor) return;
    var KEY = 'matey-markdown';
    try { editor.value = localStorage.getItem(KEY) || ''; } catch (e) {}
    editor.addEventListener('input', function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveToVault, SAVE_DELAY);
    });
    editor.addEventListener('blur', function () {
      clearTimeout(saveTimer);
      saveToVault();
    });
    // Initial parse
    saveToVault();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

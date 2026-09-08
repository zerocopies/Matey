/* Matey Keyboard — visualViewport-aware layout so UI stays organized when keyboard opens */
(function () {
  'use strict';
  var KEYBOARD_CSS =
    '.content { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important; }' +
    '.settings-overlay.open .settings-body { padding-bottom: calc(32px + env(safe-area-inset-bottom, 0px)) !important; }' +
    '.lifestyle-body { padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)) !important; }' +
     '.md-composer, #vots-composer { bottom: var(--keyboard-height, 0px); }' +
     '.md-composer-actions { bottom: calc(var(--keyboard-height, 0px) + 4px); }' +
    '.journal-fab { display: none !important; }' +
    '.journal-entries { padding-bottom: calc(16px + var(--keyboard-height, 0px) + env(safe-area-inset-bottom, 0px)) !important; }' +
    '.journal-entry-form { padding-bottom: calc(16px + var(--keyboard-height, 0px) + env(safe-area-inset-bottom, 0px)) !important; }' +
    '.vots-page { padding-bottom: calc(16px + var(--keyboard-height, 0px) + env(safe-area-inset-bottom, 0px)) !important; }' +
  '.md-page { padding-bottom: calc(16px + var(--keyboard-height, 0px) + env(safe-area-inset-bottom, 0px)) !important; }' +
     '#md-ide-container { bottom: var(--keyboard-height, 0px); }' +
     '#vots-compose { padding-bottom: calc(16px + var(--keyboard-height, 0px) + env(safe-area-inset-bottom, 0px)) !important; }';

  var styleEl = document.createElement('style');
  styleEl.textContent = KEYBOARD_CSS;
  document.head.appendChild(styleEl);

  function updateKeyboardOffset() {
    var vv = window.visualViewport;
    var offset = 0;
    var detectedBy = 'none';
    
    // Method 1: visualViewport (most reliable on modern Android)
    if (vv && vv.height < window.innerHeight - 100) {
      offset = Math.max(0, window.innerHeight - vv.height);
      detectedBy = 'visualViewport';
    }
    
    // Method 2: Fall back to comparing window width changes (keyboard often resizes viewport)
    // Cache the initial window width to detect when it shrinks
    if (offset === 0 && window.innerWidth < (window.__initialInnerWidth || window.innerWidth)) {
      var widthDiff = (window.__initialInnerWidth || window.innerWidth) - window.innerWidth;
      if (widthDiff > 50) {
        offset = widthDiff;
        detectedBy = 'innerWidth';
      }
    }
    
    // Cache initial width on first run
    if (!window.__initialInnerWidth) {
      window.__initialInnerWidth = window.innerWidth;
    }
    
    document.documentElement.style.setProperty('--keyboard-height', offset + 'px');
    
    // Update ALL composer elements (md-composer, vots-composer) with bottom offset
     var composers = [
      document.getElementById('md-composer'),
      document.getElementById('vots-composer')
    ].filter(function(el) { return el !== null; });
    
    var actionsBar = document.querySelector('.md-composer-actions');
    
    composers.forEach(function(composer) {
      composer.style.setProperty('bottom', offset + 'px');
      composer.style.visibility = 'visible';
    });
    
    if (actionsBar) {
      actionsBar.style.setProperty('bottom', (offset + 4) + 'px');
      actionsBar.style.visibility = 'visible';
    }
    
    // Also adjust journal page height so content scrolls properly above the keyboard/toolbar
    var journalPage = document.getElementById('journal-page');
    if (journalPage && composers.length > 0) {
      var composerHeight = composers[0].offsetHeight;
      var totalOffset = offset + composerHeight;
      journalPage.style.setProperty('height', 'calc(100% - ' + totalOffset + 'px)');
      journalPage.style.setProperty('max-height', 'calc(100% - ' + totalOffset + 'px)');
    }
    
    // Also adjust vots page height so content scrolls properly above the keyboard/toolbar
    var votsPage = document.getElementById('vots-page');
    if (votsPage && composers.length > 0) {
      var votsComposer = document.getElementById('vots-composer') || composers[0];
      var votsComposerHeight = votsComposer.offsetHeight;
      var votsTotalOffset = offset + votsComposerHeight;
      votsPage.style.setProperty('height', 'calc(100% - ' + votsTotalOffset + 'px)');
      votsPage.style.setProperty('max-height', 'calc(100% - ' + votsTotalOffset + 'px)');
    }
  }
  
  // Auto-scroll form to keep focused input visible above the keyboard/toolbar
  function scrollInputIntoView() {
    var active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      // Journal / VOTS: scroll within the entry form (they share identical structure)
      var form = document.getElementById('journal-entry-form') || document.getElementById('vots-entry-form');
      if (form) {
        setTimeout(function() {
          var keyboardHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0;
          var composer = document.getElementById('md-composer');
          var composerHeight = composer ? composer.offsetHeight : 0;
          
          if (keyboardHeight > 0 || composer) {
            active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            
            var rect = active.getBoundingClientRect();
            var formRect = form.getBoundingClientRect();
            var overlap = rect.bottom - (formRect.bottom - composerHeight - keyboardHeight);
            if (overlap > 0 && form.scrollBy) {
              form.scrollBy({ top: overlap + 8, behavior: 'smooth' });
            }
          }
        }, 300);
      }
      
      // Editor & VOTS: scroll the main content area to keep input visible
      var mdPage = document.querySelector('.md-page');
      var votsPage = document.querySelector('.vots-compose');
      var scrollContainer = mdPage || votsPage;
      if (scrollContainer && !form) {
        setTimeout(function() {
          active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }, 300);
      }
    }
  }
  
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      updateKeyboardOffset();
      setTimeout(scrollInputIntoView, 300);
    });
    window.visualViewport.addEventListener('scroll', updateKeyboardOffset);
  }
  window.addEventListener('resize', updateKeyboardOffset);
  window.addEventListener('orientationchange', function () {
    setTimeout(updateKeyboardOffset, 200);
  });
  window.addEventListener('load', updateKeyboardOffset);
  document.addEventListener('focusin', scrollInputIntoView);
  updateKeyboardOffset();

  var settings = document.getElementById('settings');
  if (settings) settings.classList.remove('open');

  function insertAtCursor(inputEl, text) {
    var start = inputEl.selectionStart;
    var end = inputEl.selectionEnd;
    var val = inputEl.value;
    if (start === null || start === undefined || start < 0) start = val.length;
    if (end === null || end === undefined || end < 0) end = val.length;
    inputEl.value = val.substring(0, start) + text + val.substring(end);
    var newPos = start + text.length;
    inputEl.selectionStart = newPos;
    inputEl.selectionEnd = newPos;
  }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('#md-symbol-toolbar button[data-key]');
    if (!btn) return;
    e.preventDefault();
    var textarea =
      document.getElementById('md-compose-input') ||
      document.getElementById('journal-content-input') ||
      document.getElementById('journal-title-input') ||
      document.getElementById('journal-tags-input') ||
      document.getElementById('md-editor') ||
      document.getElementById('vts-entry-content');
    if (!textarea) {
      var active = document.activeElement;
      if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) textarea = active;
    }
    if (!textarea) return;
    textarea.focus();
    insertAtCursor(textarea, btn.getAttribute('data-key'));
  });
})();

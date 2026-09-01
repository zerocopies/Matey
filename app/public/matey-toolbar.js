/* Matey Shared Toolbar — Edit actions + symbol keyboard + mic for >Edit, My-VOTS, Journal
 * Top row: All(+)-> +, Arrows (← → ↑ ↓), Cut, Copy, Paste, Mic
 * Bottom row: Symbol keyboard matching agent page (* / # $ ? ! = + - ÷ ( ))
 * All buttons styled to match agent page: green text on dark background
 */
(function () {
  'use strict';

  var TOOLBAR_CONFIG = {
    editor: {
      targetInputs: ['md-editor'],
      showMic: false,
      symbolKeys: ['*', '/', '#', '$', '?', '!', '=', '+', '-', '÷', '(', ')']
    },
    vots: {
      targetInputs: ['vots-content-input', 'vots-title-input'],
      showMic: true,
      symbolKeys: ['*', '/', '#', '$', '?', '!', '=', '+', '-', '÷', '(', ')']
    },
    journal: {
      targetInputs: ['journal-title-input', 'journal-content-input'],
      showMic: true,
      symbolKeys: ['*', '/', '#', '$', '?', '!', '=', '+', '-', '÷', '(', ')']
    }
  };

  var EDIT_ACTIONS = [
    { key: 'arrowLeft', label: '←', title: 'Move cursor left' },
    { key: 'arrowRight', label: '→', title: 'Move cursor right' },
    { key: 'arrowUp', label: '↑', title: 'Move cursor up' },
    { key: 'arrowDown', label: '↓', title: 'Move cursor down' },
    { key: 'cut', label: '✂', title: 'Cut' },
    { key: 'copy', label: '📋', title: 'Copy' },
    { key: 'paste', label: '📌', title: 'Paste' }
  ];

  var MIC_SVG_IDLE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12.01" y2="19"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  var MIC_SVG_LISTENING = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#000" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12.01" y2="19"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

  function getActiveTextInput(targetInputs) {
    var active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type !== 'hidden' && active.type !== 'button' && active.type !== 'submit' && active.type !== 'checkbox' && active.type !== 'radio'))) {
      return active;
    }
    for (var i = 0; i < targetInputs.length; i++) {
      var el = document.getElementById(targetInputs[i]);
      if (el && (el === document.activeElement || el.contains(document.activeElement))) {
        return el;
      }
    }
    for (var i = 0; i < targetInputs.length; i++) {
      var el = document.getElementById(targetInputs[i]);
      if (el) return el;
    }
    return null;
  }

  function handleEditAction(actionKey, targetInputs) {
    var input = getActiveTextInput(targetInputs);
    if (!input) return;
    input.focus();

    if (actionKey === '+' || (actionKey.length === 1 && '*|/'.indexOf(actionKey) !== -1) || actionKey.length === 1) {
      insertAtCursor(input, actionKey);
      return;
    }

    switch (actionKey) {
      case 'arrowLeft':
        var pos = Math.max(0, (input.selectionStart || 0) - 1);
        input.setSelectionRange(pos, pos);
        break;
      case 'arrowRight':
        var pos = Math.min(input.value.length, (input.selectionEnd || 0) + 1);
        input.setSelectionRange(pos, pos);
        break;
      case 'arrowUp':
        if (input.tagName === 'TEXTAREA') {
          var val = input.value;
          var start = input.selectionStart || 0;
          var beforeNewline = val.lastIndexOf('\n', start - 1);
          if (beforeNewline >= 0) {
            var lineStart = val.lastIndexOf('\n', beforeNewline - 1) + 1;
            var diff = start - beforeNewline - 1;
            var newPos = Math.max(lineStart, lineStart + Math.min(diff, val.substring(lineStart, beforeNewline).length));
            input.setSelectionRange(newPos, newPos);
          }
        }
        break;
      case 'arrowDown':
        if (input.tagName === 'TEXTAREA') {
          var val = input.value;
          var start = input.selectionStart || 0;
          var nextNewline = val.indexOf('\n', start);
          if (nextNewline !== -1) {
            var lineStart = nextNewline + 1;
            var endOfNextLine = val.indexOf('\n', lineStart);
            if (endOfNextLine === -1) endOfNextLine = val.length;
            var lineLen = endOfNextLine - lineStart;
            var currLineStart = val.lastIndexOf('\n', start - 1) + 1;
            var diff = start - currLineStart;
            var newPos = Math.min(lineStart + lineLen, lineStart + Math.min(diff, lineLen));
            input.setSelectionRange(newPos, newPos);
          }
        }
        break;
      case 'cut':
        document.execCommand('cut');
        break;
      case 'copy':
        document.execCommand('copy');
        break;
      case 'paste':
        document.execCommand('paste');
        break;
    }
  }

  function insertAtCursor(inputEl, text) {
    var start = inputEl.selectionStart;
    var end = inputEl.selectionEnd;
    var val = inputEl.value;
    inputEl.value = val.substring(0, start) + text + val.substring(end);
    inputEl.selectionStart = inputEl.selectionEnd = start + text.length;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function initToolbar(screenId, containerSelector) {
    var config = TOOLBAR_CONFIG[screenId];
    if (!config) return;

    var container = document.querySelector(containerSelector);
    if (!container) return;

    container.innerHTML = '';
    // Preserve md-composer class (has position:fixed CSS) and add toolbar classes
    if (!container.classList.contains('md-composer')) {
      container.classList.add('md-composer');
    }
    container.classList.add('matey-toolbar-container');
    container.classList.add(screenId === 'journal' ? 'journal-toolbar' : 'editor-toolbar');
    container.classList.add('md-composer-symbols-only');

    // Row 1: Edit actions (+, arrows, cut, copy, paste, mic)
    var editRow = document.createElement('div');
    editRow.className = 'matey-toolbar-row matey-edit-row';
    editRow.style.cssText = 'display:flex;justify-content:space-between;gap:4px;height:44px;align-items:center;';

    EDIT_ACTIONS.forEach(function (action) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'matey-toolbar-btn matey-edit-btn';
      btn.dataset.action = action.key;
      btn.title = action.title;
      btn.setAttribute('aria-label', action.title);
      btn.innerHTML = '<span style="font-size:13px;font-weight:600;">' + action.label + '</span>';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        handleEditAction(action.key, config.targetInputs);
      });
      editRow.appendChild(btn);
    });

    // Add mic button to edit row (top-right position)
    if (config.showMic && window.MateyMic) {
      var micBtn = document.createElement('button');
      micBtn.type = 'button';
      micBtn.className = 'matey-toolbar-btn matey-mic-btn';
      micBtn.id = screenId + '-mic-btn';
      micBtn.setAttribute('aria-label', 'Voice input');
      micBtn.title = 'Voice input (offline Whisper STT)';
      micBtn.innerHTML = MIC_SVG_IDLE;
      micBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (window.MateyMic) {
          var micState = window.MateyMic.getState ? window.MateyMic.getState() : {};
          if (micState.active) {
            window.MateyMic.stopRecording();
          } else {
            var input = getActiveTextInput(config.targetInputs);
            if (input) {
              window.MateyMic.setMicBtn && window.MateyMic.setMicBtn(micBtn);
              window.MateyMic.setTargetInput && window.MateyMic.setTargetInput(input);
              window.MateyMic.startRecording();
            }
          }
        }
      });

      if (window.MateyMic && window.MateyMic.onStateChange) {
        window.MateyMic.onStateChange(function (state) {
          if (state.active) {
            micBtn.classList.add('listening');
            micBtn.classList.add('mic-active-oval');
            micBtn.innerHTML = MIC_SVG_LISTENING;
            micBtn.style.background = '#22c55e';
            micBtn.style.borderColor = '#22c55e';
            micBtn.style.color = '#ffffff';
            micBtn.style.borderRadius = '9999px';
          } else {
            micBtn.classList.remove('listening');
            micBtn.classList.remove('mic-active-oval');
            micBtn.innerHTML = MIC_SVG_IDLE;
            micBtn.style.background = '';
            micBtn.style.borderColor = '';
            micBtn.style.color = '';
            micBtn.style.borderRadius = '';
          }
        });
      }

      editRow.appendChild(micBtn);
      container.micButton = micBtn;
    }

    container.appendChild(editRow);

    // Row 2: Symbol keyboard (agent keyboard copy - green buttons)
    if (config.symbolKeys && config.symbolKeys.length) {
      var symbolRow = document.createElement('div');
      symbolRow.className = 'matey-toolbar-row matey-symbol-row matey-symbol-row-green';
      symbolRow.style.cssText = 'display:flex;justify-content:space-between;gap:4px;height:auto;align-items:center;flex-wrap:nowrap;';

      config.symbolKeys.forEach(function (key) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'matey-toolbar-btn matey-symbol-btn';
        btn.dataset.key = key;
        btn.title = 'Insert ' + key;
        btn.setAttribute('aria-label', 'Insert ' + key);
        btn.innerHTML = '<span style="font-size:14px;font-weight:600;color:var(--accent-green,#22ff22);">' + key + '</span>';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var input = getActiveTextInput(config.targetInputs);
          if (input) {
            input.focus();
            insertAtCursor(input, key);
          }
        });
        symbolRow.appendChild(btn);
      });

      container.appendChild(symbolRow);
    }
  }

  // Auto-init on DOM ready for known screens
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.setTimeout(function () {
        if (document.querySelector('#md-composer.journal-toolbar') && !document.querySelector('#md-composer .matey-edit-row')) {
          initToolbar('journal', '#md-composer.journal-toolbar');
        }
        if (document.getElementById('md-composer') && !document.querySelector('#md-composer .matey-edit-row')) {
          initToolbar('editor', '#md-composer');
        }
        if (document.querySelector('.vots-composer, #vots-composer')) {
          initToolbar('vots', '.vots-composer, #vots-composer');
        }
      }, 100);
    });
  } else {
    window.setTimeout(function () {
      if (document.querySelector('#md-composer.journal-toolbar') && !document.querySelector('#md-composer .matey-edit-row')) {
        initToolbar('journal', '#md-composer.journal-toolbar');
      }
      if (document.getElementById('md-composer') && !document.querySelector('#md-composer .matey-edit-row')) {
        initToolbar('editor', '#md-composer');
      }
      if (document.querySelector('.vots-composer, #vots-composer')) {
        initToolbar('vots', '.vots-composer, #vots-composer');
      }
    }, 100);
  }

  window.MateyToolbar = {
    init: initToolbar
  };
})();

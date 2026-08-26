/* Matey Mic — real microphone capture to Whisper STT on-device pipeline

  1. Requests RECORD_AUDIO permission (Android WebView / Capacitor env)
  2. Captures audio via navigator.mediaDevices.getUserMedia + MediaRecorder
  3. Passes the audio blob to MateyWhisper.transcribe() (which resamples to 16kHz mono)
  4. Inserts transcribed text into the associated text input

  Usage:
    - Auto-initialized on page load via <script src="matey-mic.js">
    - Inline mic buttons are injected beside specific text inputs:
      #journal-content-input, #vots-content-input, #md-editor, #recipe-ingredients
    - The agent page (preview.html) uses its own md-voice toolbar button
*/
(function () {
  'use strict';

  var micState = {
    active: false,
    stream: null,
    mediaRecorder: null,
    audioChunks: [],
    micBtn: null,
    statusText: null,
    targetInput: null
  };

  /* ---- Permission ---- */
  function requestMicPermission() {
    return new Promise(function (resolve) {
      if (navigator.permissions) {
        navigator.permissions.query({ name: 'microphone' }).then(function (p) {
          console.log('[MateyMic] navigator.permissions state:', p.state);
          if (p.state === 'denied') {
            resolve(false);
          } else {
            resolve(true);
          }
        }).catch(function (e) {
          console.warn('[MateyMic] navigator.permissions query failed:', e);
          resolve(true);
        });
      } else {
        resolve(true);
      }
    });
  }

  /* ---- Target input detection ---- */
  function getActiveInput() {
    var active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') && active.type !== 'hidden') {
      var tag = active.tagName;
      var id = active.id ? '#' + active.id : '';
      if ((tag === 'TEXTAREA') || (tag === 'INPUT' && active.type !== 'hidden' && active.type !== 'submit' && active.type !== 'button' && active.type !== 'checkbox' && active.type !== 'radio')) {
        return active;
      }
    }
    return (
      document.getElementById('md-compose-input') ||
      document.getElementById('journal-content-input') ||
      document.getElementById('journal-title-input') ||
      document.getElementById('md-editor') ||
       document.getElementById('vots-content-input') ||
      document.getElementById('recipe-ingredients') ||
      null
    );
  }

  /* ---- Recording lifecycle ---- */
  function startRecording() {
    console.log('[MateyMic] startRecording() called');

    var micBtn = micState.micBtn;
    if (!micBtn) return;

    micState.targetInput = micState.targetInput || getActiveInput();
    console.log('[MateyMic] Target input:', micState.targetInput ? (micState.targetInput.tagName + '#' + (micState.targetInput.id || 'unnamed')) : 'none');

    micBtn.classList.add('mic-active');
    micState.active = true;
    micBtn.style.opacity = '0.5';
    if (micState.statusText) micState.statusText.textContent = 'Listening…';
    notifyStateChange();

    requestMicPermission().then(function (granted) {
      if (!granted) {
        console.error('[MateyMic] Microphone permission denied');
         micBtn.classList.remove('mic-active');
         micBtn.style.opacity = '';
         micState.active = false;
         notifyStateChange();
         if (micState.statusText) micState.statusText.textContent = 'Permission denied';
        return;
      }
      console.log('[MateyMic] Permission granted, requesting audio stream');

      navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      }).then(function (stream) {
        console.log('[MateyMic] getUserMedia success, streamTracks:', stream.getAudioTracks().length);
        var track = stream.getAudioTracks()[0];
        var settings = track.getSettings();
        console.log('[MateyMic] Audio track settings:', JSON.stringify({ sampleRate: settings.sampleRate, channelCount: settings.channelCount, label: track.label }));
        micState.stream = stream;
        micState.audioChunks = [];

        var mime = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mime)) {
          mime = 'audio/wav';
          console.log('[MateyMic] WebM Opus not supported, falling back to:', mime);
        }
        console.log('[MateyMic] Using MIME type:', mime);

        var mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        micState.mediaRecorder = mediaRecorder;

        mediaRecorder.ondataavailable = function (e) {
          if (e.data && e.data.size > 0) {
            micState.audioChunks.push(e.data);
            console.log('[MateyMic] Audio chunk:', e.data.size, 'bytes, type:', e.data.type);
          }
        };

        mediaRecorder.onstop = function () {
          console.log('[MateyMic] Recording stopped, chunks:', micState.audioChunks.length);
          var blob = new Blob(micState.audioChunks, { type: mime });
          console.log('[MateyMic] Combined blob:', blob.size, 'bytes, type:', blob.type);
          micState.active = false;
          notifyStateChange();
          processAudioBlob(blob);
        };

        mediaRecorder.start(250);
        console.log('[MateyMic] MediaRecorder started');

        /* Auto-stop after 10 seconds to prevent runaway recording */
        micState.autoStopTimer = setTimeout(function () {
          console.log('[MateyMic] Auto-stopping after 10s');
          if (micState.mediaRecorder && micState.mediaRecorder.state === 'recording') {
            micState.mediaRecorder.stop();
          }
        }, 10000);
      }).catch(function (err) {
        console.error('[MateyMic] getUserMedia error:', err.name || err.message || err, JSON.stringify({
          name: err.name,
          message: err.message,
          code: err.code,
          constraint: err.constraint,
          stack: err.stack
        }));
         micBtn.classList.remove('mic-active');
         micBtn.style.opacity = '';
         micState.active = false;
         notifyStateChange();
         if (micState.statusText) micState.statusText.textContent = 'Mic error: ' + (err.message || err);
      });
    });
  }

  function stopRecording() {
    console.log('[MateyMic] stopRecording() called');
    if (micState.autoStopTimer) {
      clearTimeout(micState.autoStopTimer);
      micState.autoStopTimer = null;
    }
    if (micState.mediaRecorder && micState.mediaRecorder.state === 'recording') {
      micState.mediaRecorder.stop();
    }
    if (micState.stream) {
      micState.stream.getTracks().forEach(function (t) { t.stop(); });
      micState.stream = null;
    }
    if (micState.micBtn) {
      micState.micBtn.classList.remove('mic-active');
      micState.micBtn.style.opacity = '';
    }
    micState.active = false;
    if (micState.statusText) micState.statusText.textContent = 'Transcribing…';
    notifyStateChange();
  }

  /* ---- Transcribe via Whisper ---- */
  function processAudioBlob(blob) {
    var input = micState.targetInput || getActiveInput();
    if (!input) {
      console.warn('[MateyMic] No input element found — transcription will proceed but text won\'t be inserted');
    }

    console.log('[MateyMic] Calling MateyWhisper.transcribe() with blob:', blob.size, 'bytes');

    if (window.MateyWhisper) {
      var state = MateyWhisper.getState();
      if (!state.ready) {
        console.log('[MateyMic] Whisper not loaded yet, loading whisper-tiny.en...');
        MateyWhisper.loadModel('Xenova/whisper-tiny.en', function (progress) {
          console.log('[MateyMic] Model loading progress:', Math.round(progress) + '%');
          if (micState.statusText) micState.statusText.textContent = 'Loading model… ' + Math.round(progress) + '%';
        }).then(function () {
          doTranscribe(blob, input);
        }).catch(function (e) {
          console.error('[MateyMic] Model load failed:', e);
          if (micState.statusText) micState.statusText.textContent = 'Model error: ' + (e.message || e);
        });
      } else {
        console.log('[MateyMic] Whisper model already loaded:', state.modelId);
        doTranscribe(blob, input);
      }
    } else {
      console.error('[MateyMic] MateyWhisper not available');
      if (micState.statusText) micState.statusText.textContent = 'STT not available';
    }
  }

  function doTranscribe(blob, input) {
    console.log('[MateyMic] doTranscribe() — sending blob to Whisper pipeline');
    var startTime = Date.now();

    MateyWhisper.transcribe(blob, function (chunk) {
      console.log('[MateyMic] Transcription chunk received:', JSON.stringify(chunk));
    }).then(function (result) {
      var elapsed = Date.now() - startTime;
      console.log('[MateyMic] Transcription complete (' + elapsed + 'ms):', JSON.stringify(result).substring(0, 500));
      var text = '';
      if (typeof result === 'string') {
        text = result;
      } else if (Array.isArray(result)) {
        text = result.map(function(r) { return (r && r.text) ? r.text : ''; }).join(' ').trim();
      } else if (result && (result.text || result.transcription)) {
        text = result.text || result.transcription;
      }
      if (text && input) {
        var trimmed = text.trim();
        if (trimmed) {
          var current = input.value || '';
          var start = input.selectionStart || current.length;
          var end = input.selectionEnd || current.length;
          input.value = current.substring(0, start) + trimmed + current.substring(end);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          var newPos = start + trimmed.length;
          input.setSelectionRange(newPos, newPos);
          input.focus();
          if (micState.statusText) micState.statusText.textContent = 'Done';
          setTimeout(function () {
            if (micState.statusText) micState.statusText.textContent = '';
          }, 1000);
        } else {
          if (micState.statusText) micState.statusText.textContent = 'No speech detected';
          setTimeout(function () {
            if (micState.statusText) micState.statusText.textContent = '';
          }, 1500);
        }
      } else {
    }).catch(function (e) {
      console.error('[MateyMic] Transcription failed:', e);
      if (micState.statusText) micState.statusText.textContent = 'Error: ' + (e.message || e);
      setTimeout(function () {
        if (micState.statusText) micState.statusText.textContent = '';
      }, 2000);
    });
  }

  /* ---- Inline mic button injection ---- */
  var MIC_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

  function injectMicButton(inputEl, options) {
    if (!inputEl || !inputEl.parentNode) return null;

    options = options || {};

    var parent = inputEl.parentNode;
    var computedStyle = window.getComputedStyle(parent);
    if (computedStyle.position === 'static') {
      parent.style.position = 'relative';
    }
    parent.classList.add('matey-mic-wrapper');

    var existing = parent.querySelector('.matey-mic-inline');
    if (existing) return existing;

    var btn = document.createElement('button');
    btn.className = 'matey-mic-inline';
    btn.type = 'button';
    btn.setAttribute('aria-label', options.label || 'Voice input');
    btn.setAttribute('title', options.title || 'Voice input (offline Whisper STT)');
    btn.innerHTML = MIC_SVG;

    parent.appendChild(btn);

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (micState.active && micState.micBtn === btn) {
        micState.active = false;
        stopRecording();
        micState.targetInput = null;
        return;
      }

      if (micState.active) {
        stopRecording();
        micState.active = false;
      }

      micState.micBtn = btn;
      micState.statusText = null;
      micState.targetInput = inputEl;
      micState.active = true;
      startRecording();
    });

    console.log('[MateyMic] Inline mic button injected for #' + (inputEl.id || 'unnamed'));
    return btn;
  }

  /* ---- Init ---- */
  function init() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      console.warn('[MateyMic] MediaDevices not supported, skipping mic injection');
      return;
    }

    /* Remove any existing legacy FAB */
    var legacyFab = document.getElementById('matey-mic-fab-wrap');
    if (legacyFab) legacyFab.remove();

    /* Wire up the new toolbar mic buttons (md-mic-btn) */
    var toolbarMicButtons = document.querySelectorAll('.md-mic-btn');
    toolbarMicButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (micState.active) {
          if (micState.micBtn === btn) {
            micState.active = false;
            stopRecording();
            micState.targetInput = null;
            return;
          }
          stopRecording();
          micState.active = false;
        }
        micState.micBtn = btn;
        micState.statusText = null;
        micState.targetInput = getActiveInput();
        micState.active = true;
        startRecording();
      });
    });

    /* Inject inline mic buttons for known text inputs (deferred to ensure DOM is ready) */
    var targets = [
      { id: 'vots-content-input' },
      { id: 'md-editor' }
    ];

    targets.forEach(function (t) {
      setTimeout(function () {
        var el = document.getElementById(t.id);
        if (el) injectMicButton(el);
      }, 300);
    });

    /* Wire up the md-voice button on agent page to use Whisper */
    var voiceBtn = document.getElementById('md-voice');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (micState.active) {
          micState.active = false;
          voiceBtn.classList.remove('mic-active');
          voiceBtn.style.opacity = '';
          stopRecording();
        } else {
          micState.micBtn = voiceBtn;
          micState.statusText = null;
          micState.active = true;
          voiceBtn.classList.add('mic-active');
          voiceBtn.style.opacity = '0.5';
          startRecording();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MateyMic = {
    init: init,
    requestPermission: requestMicPermission,
    startRecording: startRecording,
    stopRecording: stopRecording,
    injectMicButton: injectMicButton,
    setTargetInput: function(input) {
      micState.targetInput = input;
    },
    getState: function() {
      return { active: micState.active, modelId: window.MateyWhisper ? window.MateyWhisper.getState().modelId : null };
    },
    onStateChange: function(callback) {
      micState._changeListeners = micState._changeListeners || [];
      micState._changeListeners.push(callback);
      return function() {
        micState._changeListeners = micState._changeListeners.filter(function(l) { return l !== callback; });
      };
    }
  };
  
  function notifyStateChange() {
    if (micState._changeListeners) {
      micState._changeListeners.forEach(function(cb) {
        try { cb({ active: micState.active, modelId: window.MateyWhisper ? window.MateyWhisper.getState().modelId : null }); } catch(e) {}
      });
    }
  }
})();
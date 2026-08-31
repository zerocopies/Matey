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
     isRecording: false,
     isProcessing: false,
     stream: null,
     mediaRecorder: null,
     audioChunks: [],
     micBtn: null,
     statusText: null,
     targetInput: null,
     autoStopTimer: null,
     currentDomain: 'journal',
     currentContextPayload: {},
     _error: null
   };

  /* ---- Domain detection ---- */
  function detectDomain(inputEl) {
    var id = (inputEl && inputEl.id) || '';
    if (id.indexOf('journal') !== -1) return 'journal';
    if (id.indexOf('vots') !== -1 || id.indexOf('compose') !== -1) return 'agent';
    if (id.indexOf('md') !== -1 || id.indexOf('editor') !== -1 || id.indexOf('recipe') !== -1) return 'editor';
    return 'journal';
  }

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
       null
    );
  }

   var STT_DOMAINS_DEFAULT = 'journal';

   function insertTextAtCursor(inputEl, text) {
    if (!inputEl || !text) return;
    var current = inputEl.value || '';
    var start = inputEl.selectionStart || current.length;
    var end = inputEl.selectionEnd || current.length;
    inputEl.value = current.substring(0, start) + text + current.substring(end);
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    var newPos = start + text.length;
    inputEl.setSelectionRange(newPos, newPos);
    inputEl.focus();
  }

    /* ---- Recording lifecycle ---- */
    function pickMicMimeType() {
      if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
      var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'];
      for (var i = 0; i < candidates.length; i++) {
        try {
          if (MediaRecorder.isTypeSupported(candidates[i])) {
            console.log('[MateyMic] Supported MIME:', candidates[i]);
            return candidates[i];
          }
        } catch (e) { /* ignore */ }
      }
      console.log('[MateyMic] No supported MIME found, using default MediaRecorder()');
      return '';
    }

   function startRecording() {
     console.log('[MateyMic] startRecording() called');

     var micBtn = micState.micBtn;
     if (!micBtn) {
       console.error('[MateyMic] No mic button set');
       return;
     }

     micState.targetInput = micState.targetInput || getActiveInput();
     console.log('[MateyMic] Target input:', micState.targetInput ? (micState.targetInput.tagName + '#' + (micState.targetInput.id || 'unnamed')) : 'none');

     // Set recording state immediately for instant UI feedback
     micState.isRecording = true;
     micState.active = true;
     micState._error = null;
     updateMicButtonVisual(micBtn, true);
     if (micState.statusText) micState.statusText.textContent = 'Listening…';
     notifyStateChange();

        // Explicit permission request for Android WebView
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
        if (micState.statusText) micState.statusText.textContent = 'Listening… (speak now)';
        var track = stream.getAudioTracks()[0];
        var settings = track.getSettings();
        console.log('[MateyMic] Audio track settings:', JSON.stringify({ sampleRate: settings.sampleRate, channelCount: settings.channelCount, label: track.label }));
        micState.stream = stream;
        micState.audioChunks = [];
        micState._totalBytes = 0;

        var mime = pickMicMimeType();
        console.log('[MateyMic] Using MIME type:', JSON.stringify(mime));

        var mediaRecorder = null;
        try {
          mediaRecorder = mime
            ? new MediaRecorder(stream, { mimeType: mime })
            : new MediaRecorder(stream);
        } catch (mrErr) {
          console.error('[MateyMic] MediaRecorder construction failed for mime', JSON.stringify(mime), '- retrying with default', mrErr);
          try {
            mediaRecorder = new MediaRecorder(stream);
            mime = mediaRecorder.mimeType || '';
          } catch (mrErr2) {
            console.error('[MateyMic] MediaRecorder construction failed entirely:', mrErr2);
            micState.isRecording = false;
            micState.active = false;
            updateMicButtonVisual(micBtn, false);
            notifyStateChange();
            if (micState.statusText) micState.statusText.textContent = 'Recorder unsupported on this device';
            if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
            return;
          }
        }
        micState.mediaRecorder = mediaRecorder;

        mediaRecorder.ondataavailable = function (e) {
          if (e.data && e.data.size > 0) {
            micState.audioChunks.push(e.data);
            micState._totalBytes = (micState._totalBytes || 0) + e.data.size;
            console.log('[MateyMic] Audio chunk:', e.data.size, 'bytes, type:', e.data.type);
            if (micState.statusText) micState.statusText.textContent = 'Recording… ' + micState.audioChunks.length + ' chunks / ' + micState._totalBytes + ' bytes';
          }
        };

         mediaRecorder.onstop = function () {
           console.log('[MateyMic] Recording stopped, chunks:', micState.audioChunks.length);
           var blob = new Blob(micState.audioChunks, { type: mime });
           console.log('[MateyMic] Combined blob:', blob.size, 'bytes, type:', blob.type);
           micState.isRecording = false;
           micState.active = false;
           updateMicButtonVisual(micBtn, false);
           notifyStateChange();
           if (micState.statusText) micState.statusText.textContent = 'Recorded ' + blob.size + ' bytes — transcribing…';
           var domain = micState.currentDomain || STT_DOMAINS_DEFAULT;
           var contextPayload = micState.currentContextPayload || {};
           processAudioBlob(blob, domain, contextPayload);
        };

        mediaRecorder.start(250);
        console.log('[MateyMic] MediaRecorder started');

        /* Auto-stop after 60 seconds to prevent runaway recording */
        micState.autoStopTimer = setTimeout(function () {
          console.log('[MateyMic] Auto-stopping after 60s');
          if (micState.mediaRecorder && micState.mediaRecorder.state === 'recording') {
            micState.mediaRecorder.stop();
          }
        }, 60000);
     }).catch(function (err) {
       console.error('[MateyMic] getUserMedia error:', err.name || err.message || err, JSON.stringify({
         name: err.name,
         message: err.message,
         code: err.code,
         constraint: err.constraint,
         stack: err.stack
       }));
       micState.isRecording = false;
       micState.active = false;
       micState._error = err.message || err.name || 'Unknown error';
       updateMicButtonVisual(micBtn, false);
       notifyStateChange();
       if (micState.statusText) micState.statusText.textContent = 'Mic error: ' + (err.message || err);
     });
   }

    function updateMicButtonVisual(btn, isRecording) {
      if (!btn) return;
      if (isRecording) {
        btn.classList.add('mic-active');
        btn.style.background = '#ffffff';
        btn.style.color = '#000000';
        btn.style.borderRadius = '50%';
        // Also update SVG fill
        var svg = btn.querySelector('svg');
        if (svg) {
          svg.setAttribute('fill', '#000000');
          svg.style.fill = '#000000';
        }
      } else {
        btn.classList.remove('mic-active');
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderRadius = '';
        var svg = btn.querySelector('svg');
        if (svg) {
          svg.setAttribute('fill', 'none');
          svg.style.fill = '';
        }
      }
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
       updateMicButtonVisual(micState.micBtn, false);
     }
     micState.isRecording = false;
     micState.active = false;
     if (micState.statusText) micState.statusText.textContent = 'Transcribing…';
     notifyStateChange();
   }

  /* ---- Transcribe via Whisper ---- */
    function processAudioBlob(blob, domain, contextPayload) {
     domain = domain || STT_DOMAINS_DEFAULT;
     contextPayload = contextPayload || {};

     var input = micState.targetInput || getActiveInput();
     if (!input) {
       console.warn('[MateyMic] No input element found — transcription will proceed but text won\'t be inserted');
     }

     console.log('[MateyMic] Calling STT with domain:', domain, 'contextPayload:', JSON.stringify(contextPayload));

     /* If runLocalSTT is waiting, resolve with text directly */
     var sttResolve = micState._sttResolve;
     var sttReject = micState._sttReject;

      /* If MateySpeech is available, use its domain-aware transcription of THIS blob.
         NOTE: stopListening() is for when MateySpeech owns the recording lifecycle;
         here matey-mic.js captured the audio, so we hand the blob to processAudioBlob().
         We must first ensure a VALID Whisper model is actually loaded (MateySpeech's
         default activeModelId 'distil-whisper-small' is not a valid MateyWhisper id,
         and if Whisper isn't ready MateySpeech silently falls back to fake canned text). */
      if (window.MateySpeech && typeof MateySpeech.processAudioBlob === 'function' && !micState._usingMateySpeech) {
        micState._usingMateySpeech = true;
        if (micState.statusText) micState.statusText.textContent = 'Transcribing…';

        var whisperReady = window.MateyWhisper && window.MateyWhisper.getState && window.MateyWhisper.getState().ready;
        var loadPromise = whisperReady
          ? Promise.resolve()
          : window.MateyWhisper.loadModel('Xenova/whisper-tiny.en', function (p) {
              if (micState.statusText) micState.statusText.textContent = 'Loading model… ' + Math.round(p) + '%';
            });

        loadPromise.then(function () {
          return MateySpeech.processAudioBlob(blob, domain, contextPayload);
        }).then(function (text) {
          micState._usingMateySpeech = false;
          if (text && String(text).trim()) {
            insertTextAtCursor(input, String(text).trim());
            if (micState.statusText) micState.statusText.textContent = 'Done';
            setTimeout(function () { if (micState.statusText) micState.statusText.textContent = ''; }, 1000);
            if (sttResolve) sttResolve(String(text).trim());
          } else {
            if (micState.statusText) micState.statusText.textContent = 'No speech detected';
            setTimeout(function () { if (micState.statusText) micState.statusText.textContent = ''; }, 1500);
            if (sttResolve) sttResolve('');
          }
        }).catch(function (e) {
          micState._usingMateySpeech = false;
          console.error('[MateyMic] MateySpeech error:', e);
          if (micState.statusText) micState.statusText.textContent = 'Transcribe error: ' + (e && e.message ? e.message : e);
          setTimeout(function () { if (micState.statusText) micState.statusText.textContent = ''; }, 2500);
          if (sttReject) sttReject(e);
        });
        return;
      }

     /* Fallback to MateyWhisper */
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
           if (sttReject) sttReject(e);
         });
       } else {
         console.log('[MateyMic] Whisper model already loaded:', state.modelId);
         doTranscribe(blob, input);
       }
     } else {
       console.error('[MateyMic] MateyWhisper not available');
       if (micState.statusText) micState.statusText.textContent = 'STT not available';
       if (sttReject) sttReject(new Error('MateyWhisper not available'));
     }
   }

  function doTranscribe(blob, input) {
     console.log('[MateyMic] doTranscribe() — sending blob to Whisper pipeline');
     var startTime = Date.now();

     /* Apply VAD if enabled */
     var vadEnabled = false;
     try { vadEnabled = localStorage.getItem('matey-vad-enabled') !== 'false'; } catch (e) {}

     if (vadEnabled && window.MateySpeech && window.MateySpeech.SileroVADProcessor) {
       var reader = new FileReader();
       reader.onload = function () {
         var audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
         audioCtx.decodeAudioData(reader.result, function (buffer) {
           var channelData = buffer.getChannelData(0);
           var sampleRate = buffer.sampleRate;
           var cleanPCM = window.MateySpeech.SileroVADProcessor.filterSilence(channelData);
           if (cleanPCM.length < 100) {
             console.warn('[MateyMic] VAD removed all audio (too silent)');
             if (micState.statusText) micState.statusText.textContent = 'No speech detected';
             setTimeout(function () { if (micState.statusText) micState.statusText.textContent = ''; }, 1500);
             if (micState._sttResolve) micState._sttResolve('');
             return;
           }
           var finalBlob = window.MateySpeech.SileroVADProcessor.encodeFloat32ToWav(cleanPCM, sampleRate);
           console.log('[MateyMic] VAD trimmed:', channelData.length, '->', cleanPCM.length, 'samples');
           doSendToWhisper(finalBlob, input, startTime);
         });
       };
       reader.readAsArrayBuffer(blob);
     } else {
       doSendToWhisper(blob, input, startTime);
     }
   }

   function doSendToWhisper(blob, input, startTime) {
     var sttResolve = micState._sttResolve;
     var sttReject = micState._sttReject;
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
       if (text && text.trim()) {
         insertTextAtCursor(input, text.trim());
         if (micState.statusText) micState.statusText.textContent = 'Done';
         setTimeout(function () { if (micState.statusText) micState.statusText.textContent = ''; }, 1000);
         if (sttResolve) sttResolve(text.trim());
       } else {
         if (micState.statusText) micState.statusText.textContent = 'No speech detected';
         setTimeout(function () { if (micState.statusText) micState.statusText.textContent = ''; }, 1500);
         if (sttResolve) sttResolve('');
       }
     }).catch(function (e) {
       console.error('[MateyMic] Transcription failed:', e);
       if (micState.statusText) micState.statusText.textContent = 'Error: ' + (e.message || e);
       setTimeout(function () {
         if (micState.statusText) micState.statusText.textContent = '';
       }, 2000);
       if (sttReject) sttReject(e);
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
      micState.currentDomain = detectDomain(inputEl);
      micState.currentContextPayload = { inputId: inputEl.id || '' };
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

    /* Wire up the md-voice button on agent page */
    var voiceBtn = document.getElementById('md-voice');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[MateyMic] md-voice clicked, isRecording:', micState.isRecording);
        if (micState.isRecording) {
          // Stop recording
          console.log('[MateyMic] Stopping recording from button click');
          stopRecording();
          return;
        }
        // Start recording
        micState.micBtn = voiceBtn;
        micState.statusText = document.getElementById('md-voice-status');
        micState.currentDomain = detectDomain(micState.targetInput);
        micState.currentContextPayload = {};
        startRecording();
      });
    }
  }

  /* Auto-stop mic on page hide/visibility change (section switch, app background) */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && micState.active) {
      console.log('[MateyMic] Auto-stopping on visibility change');
      stopRecording();
    }
  });

  /* Auto-stop mic on click outside the mic button or its target input */
  document.addEventListener('click', function (e) {
    if (!micState.active || !micState.micBtn) return;
    var clickedInside = micState.micBtn.contains(e.target);
    var clickedInInput = micState.targetInput && micState.targetInput.contains(e.target);
    if (!clickedInside && !clickedInInput) {
      console.log('[MateyMic] Auto-stopping on outside click');
      stopRecording();
    }
  }, true);

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
      if (input) this.setDomainFromInput(input);
    },
    setMicBtn: function(btn) {
      micState.micBtn = btn;
    },
    setDomain: function(domain, contextPayload) {
      micState.currentDomain = domain;
      micState.currentContextPayload = contextPayload || {};
    },
    setDomainFromInput: function(inputEl) {
      micState.currentDomain = detectDomain(inputEl);
      micState.currentContextPayload = { inputId: (inputEl && inputEl.id) || '' };
    },
    STT_DOMAINS: {
      CULINARY: 'culinary',
      WARDROBE: 'wardrobe',
      GROOMING: 'grooming',
      LIVING: 'living',
      JOURNAL: 'journal',
      EDITOR: 'editor',
      AGENT: 'agent'
    },
    getState: function() {
      var modelId = null;
      if (window.MateyWhisper) modelId = window.MateyWhisper.getState().modelId;
      if (window.MateySpeech) modelId = window.MateySpeech.activeModelId;
      return {
        active: micState.active,
        modelId: modelId,
        domain: micState.currentDomain || STT_DOMAINS_DEFAULT,
      };
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
        try { cb({ active: micState.active, modelId: window.MateyWhisper ? (window.MateyWhisper.getState && window.MateyWhisper.getState().modelId) : null, domain: micState.currentDomain }); } catch(e) {}
      });
    }
  }

  /* ---- runLocalSTT: promise-based STT for CommandPalette ---- */
  window.runLocalSTT = function () {
    return new Promise(function (resolve, reject) {
      console.log('[MateyMic] runLocalSTT() called');

      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        return reject(new Error('MediaDevices not supported'));
      }

      /* Capture transcription via a hidden input */
      var captureInput = document.createElement('input');
      captureInput.type = 'hidden';
      document.body.appendChild(captureInput);

      var originalTarget = micState.targetInput;
      micState.targetInput = captureInput;
      micState._sttResolve = function (text) {
        micState._sttResolve = null;
        micState.targetInput = originalTarget;
        if (captureInput.parentNode) captureInput.parentNode.removeChild(captureInput);
        resolve(text);
      };
      micState._sttReject = function (err) {
        micState._sttReject = null;
        micState.targetInput = originalTarget;
        if (captureInput.parentNode) captureInput.parentNode.removeChild(captureInput);
        reject(err);
      };

      if (!micState.micBtn) {
        /* Find any available mic button to drive the recording lifecycle */
        micState.micBtn = document.getElementById('toolbar-mic-btn') ||
                          document.querySelector('.md-mic-btn') ||
                          document.getElementById('md-voice') ||
                          null;
      }

      console.log('[MateyMic] runLocalSTT: starting recording');
      startRecording();

      /* Safety timeout — if recording is still active after 25s, force-stop */
      setTimeout(function () {
        if (micState._sttResolve && micState.active) {
          console.log('[MateyMic] runLocalSTT: safety timeout, stopping');
          stopRecording();
        }
      }, 65000);
    });
  };
})();
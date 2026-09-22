/* Matey Mic — real microphone capture to Whisper STT on-device pipeline

  1. Requests RECORD_AUDIO permission (Android WebView / Capacitor env)
  2. Captures audio via navigator.mediaDevices.getUserMedia + MediaRecorder
  3. Passes the audio blob to MateyWhisper.transcribe() (which resamples to 16kHz mono)
  4. Inserts transcribed text into the associated text input

  Usage:
    - Auto-initialized on page load via <script src="matey-mic.js">
    - Inline mic buttons are injected beside specific text inputs:
      #journal-content-input, #vts-entry-content, #md-editor, #recipe-ingredients
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
      recordedMimeType: '',
      audioChunks: [],
      micBtn: null,
      statusText: null,
      targetInput: null,
      autoStopTimer: null,
      currentDomain: 'journal',
      currentContextPayload: {},
      _error: null,
     /* Rolling chunked streaming state */
     streamingTimer: null,
     streamText: '',
     streamChunkIndex: 0,
     streamInterimCallback: null,
     streamProcessedChunks: 0,
     _streamLiveWritten: false,
     /* Live speech recognition config — continuous session that never drops
        sentences and always reports interim results while speaking. */
     recognitionConfig: {
       continuous: true,
       interimResults: true,
       maxAlternatives: 1
     }
   };

  /* ---- Domain detection ---- */
  function detectDomain(inputEl) {
    var id = (inputEl && inputEl.id) || '';
    if (id.indexOf('journal') !== -1) return 'journal';
    if (id.indexOf('vots') !== -1 || id.indexOf('vts') !== -1 || id.indexOf('compose') !== -1) return 'agent';
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
      document.getElementById('vts-entry-content') ||
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
      // High-precision audio capture: enable echo cancellation, noise suppression
      // and auto gain control so speech recognition gets a clean signal.
      // Use ideal constraints (not exact) so the device can pick compatible settings.
      navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16000 },
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true }
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
        /* Parallel PCM capture — the reliable transcription source on Android WebView */
        _startPcmCapture(stream);

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
        micState.recordedMimeType = mediaRecorder.mimeType || mime;

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
            var blob = new Blob(micState.audioChunks, { type: micState.recordedMimeType });
            console.log('[MateyMic] Combined blob:', blob.size, 'bytes, type:', blob.type);
            /* Prefer the decoded-safe WAV built from captured PCM */
            var sourceBlob = micState._pcmWav || blob;
            micState._pcmWav = null;
            console.log('[MateyMic] Transcription source:', sourceBlob.size, 'bytes, type:', sourceBlob.type);
           micState.isRecording = false;
           micState.active = false;
           updateMicButtonVisual(micBtn, false);
           notifyStateChange();
           if (micState.statusText) micState.statusText.textContent = 'Recorded ' + sourceBlob.size + ' bytes — transcribing…';
           var domain = micState.currentDomain || STT_DOMAINS_DEFAULT;
           var contextPayload = micState.currentContextPayload || {};
           processAudioBlob(sourceBlob, domain, contextPayload);
        };

        mediaRecorder.start(250);
        console.log('[MateyMic] MediaRecorder started');

        /* Start rolling chunked streaming for live transcription */
        var domain = micState.currentDomain || STT_DOMAINS_DEFAULT;
        var contextPayload = micState.currentContextPayload || {};
        var interimCb = micState._streamInterimCallback;
        startMicStreaming(domain, contextPayload, interimCb);

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
        // Retry with fully relaxed constraints if strict ones failed
        if (err.name === 'NotReadableError' || err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
          console.log('[MateyMic] Retrying with relaxed constraints...');
          navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            console.log('[MateyMic] getUserMedia retry success, streamTracks:', stream.getAudioTracks().length);
            if (micState.statusText) micState.statusText.textContent = 'Listening… (speak now)';
            var track = stream.getAudioTracks()[0];
            var settings = track.getSettings();
            console.log('[MateyMic] Audio track settings:', JSON.stringify({ sampleRate: settings.sampleRate, channelCount: settings.channelCount, label: track.label }));
            micState.stream = stream;
            micState.audioChunks = [];
            micState._totalBytes = 0;
            var mime = pickMicMimeType();
            var mediaRecorder = null;
            /* Parallel PCM capture — the reliable transcription source on Android WebView */
            micState.audioChunks = [];
            micState._totalBytes = 0;
            _startPcmCapture(stream);
            try {
              mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
            } catch (mrErr) {
              try { mediaRecorder = new MediaRecorder(stream); } catch (mrErr2) {
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
        micState.recordedMimeType = mediaRecorder.mimeType || mime;
            mediaRecorder.ondataavailable = function (e) {
              if (e.data && e.data.size > 0) {
                micState.audioChunks.push(e.data);
                micState._totalBytes = (micState._totalBytes || 0) + e.data.size;
                if (micState.statusText) micState.statusText.textContent = 'Recording… ' + micState.audioChunks.length + ' chunks / ' + micState._totalBytes + ' bytes';
              }
            };
            mediaRecorder.onstop = function () {
              var blob = new Blob(micState.audioChunks, { type: micState.recordedMimeType });
              var sourceBlob = micState._pcmWav || blob;
              micState._pcmWav = null;
              micState.isRecording = false;
              micState.active = false;
              updateMicButtonVisual(micBtn, false);
              notifyStateChange();
              if (micState.statusText) micState.statusText.textContent = 'Recorded ' + sourceBlob.size + ' bytes — transcribing…';
              var domain = micState.currentDomain || STT_DOMAINS_DEFAULT;
              var contextPayload = micState.currentContextPayload || {};
              processAudioBlob(sourceBlob, domain, contextPayload);
            };
            mediaRecorder.start(250);
            micState.autoStopTimer = setTimeout(function () {
              if (micState.mediaRecorder && micState.mediaRecorder.state === 'recording') {
                micState.mediaRecorder.stop();
              }
            }, 60000);
            return;
          }).catch(function (err2) {
            console.error('[MateyMic] getUserMedia retry also failed:', err2.message || err2);
            micState.isRecording = false;
            micState.active = false;
            micState._error = err2.message || err2.name || 'Unknown error';
            updateMicButtonVisual(micBtn, false);
            notifyStateChange();
            if (micState.statusText) micState.statusText.textContent = 'Mic error: ' + (err2.message || err2);
          });
          return;
        }
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
      /* Universal mic active visual — oval green container across ALL tabs
         (AGENT, JOURNAL, MY-VOTS, EDITOR). Matches .mic-active-oval CSS. */
      if (isRecording) {
        btn.classList.add('mic-active');
        btn.classList.add('mic-active-oval');
        btn.style.background = '#34D399';
        btn.style.borderColor = '#34D399';
        btn.style.color = '#ffffff';
        btn.style.borderRadius = '9999px';
        // White mic icon
        var svg = btn.querySelector('svg');
        if (svg) {
          svg.setAttribute('fill', 'none');
          svg.setAttribute('stroke', '#ffffff');
          svg.style.fill = 'none';
          svg.style.stroke = '#ffffff';
        }
      } else {
        btn.classList.remove('mic-active');
        btn.classList.remove('mic-active-oval');
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.borderRadius = '';
        var svg = btn.querySelector('svg');
        if (svg) {
          svg.setAttribute('fill', 'none');
          svg.setAttribute('stroke', 'currentColor');
          svg.style.fill = 'none';
          svg.style.stroke = '';
        }
      }
    }

   function stopRecording() {
    console.log('[MateyMic] stopRecording() called');
    if (micState.autoStopTimer) {
      clearTimeout(micState.autoStopTimer);
      micState.autoStopTimer = null;
    }
     /* Finalize the PCM capture FIRST — that WAV is the blob we actually transcribe. */
     try {
       if (micState._pcmChunks && micState._pcmChunks.length) {
         micState._pcmWav = _pcmToWavBlob(micState._pcmChunks, micState._pcmSampleRate);
         if (micState._pcmWav) {
           console.log('[MateyMic] PCM WAV ready:', micState._pcmWav.size, 'bytes @', micState._pcmSampleRate + 'Hz');
         }
       }
     } catch (pcmErr) {
       console.warn('[MateyMic] PCM finalize failed, falling back to MediaRecorder blob:', pcmErr && pcmErr.message);
       micState._pcmWav = null;
     }
     _stopPcmCapture();
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
    /* Note: audioChunks are cleared after transcription completes in processAudioBlob/doSendToWhisper */
  }

    /* ---- Rolling Chunked Streaming (Live Transcription) ---- */
  function startMicStreaming(domain, contextPayload, onInterim) {
    micState.streamingTimer = null;
    micState.streamText = '';
    micState.streamChunkIndex = 0;
    micState.streamProcessedChunks = 0;
    micState.streamInterimCallback = onInterim || null;
    micState._streamLiveWritten = false;

    console.log('[MateyMic] Streaming started (2.5s chunks)');

    micState.streamingTimer = setInterval(function () {
      processMicChunk(domain, contextPayload);
    }, 2500);
  }

  function stopMicStreaming() {
    if (micState.streamingTimer) {
      clearInterval(micState.streamingTimer);
      micState.streamingTimer = null;
    }
    var finalText = micState.streamText;
    micState.streamText = '';
    micState.streamChunkIndex = 0;
    micState.streamProcessedChunks = 0;
    console.log('[MateyMic] Streaming stopped. Final text length: ' + finalText.length);
    return finalText;
  }

  function processMicChunk(domain, contextPayload) {
    if (micState.audioChunks.length === 0) return;

    /* Grab accumulated audio and clear the live buffer (rolling window) */
    var chunksToProcess = micState.audioChunks.slice();
    micState.audioChunks = [];

    if (chunksToProcess.length === 0) return;

    var mime = micState.recordedMimeType || (micState.mediaRecorder ? (micState.mediaRecorder.mimeType || 'audio/webm') : 'audio/webm');
    var blob = new Blob(chunksToProcess, { type: mime });
    micState.streamProcessedChunks++;

    /* Prefer the PCM delta — WebView cannot decode the raw webm/opus chunks. */
    var pcmBlob = null;
    try {
      if (micState._pcmChunks && micState._pcmChunks.length > (micState._pcmConsumed || 0)) {
        var pcmDelta = micState._pcmChunks.slice(micState._pcmConsumed || 0);
        micState._pcmConsumed = micState._pcmChunks.length;
        if (pcmDelta.length) pcmBlob = _pcmToWavBlob(pcmDelta, micState._pcmSampleRate);
      }
    } catch (pcmErr) {
      console.warn('[MateyMic] PCM chunk encode failed, using recorder blob:', pcmErr && pcmErr.message);
    }
    var chunkSourceBlob = pcmBlob || blob;

    console.debug('[MateyMic] Processing chunk #' + micState.streamProcessedChunks + ': ' + chunkSourceBlob.size + ' bytes, type: ' + chunkSourceBlob.type);

    _transcribeMicChunk(chunkSourceBlob, domain, contextPayload).then(function (text) {
      if (!text || !text.trim()) return;

      micState.streamChunkIndex++;
      micState.streamText += (micState.streamText ? ' ' : '') + text.trim();

      /* Fire interim callback for live UI injection */
      if (micState.streamInterimCallback && typeof micState.streamInterimCallback === 'function') {
        try {
          micState.streamInterimCallback({
            chunkIndex: micState.streamChunkIndex,
            interimText: text.trim(),
            fullText: micState.streamText,
            isFinal: false
          });
        } catch (e) { console.error('[MateyMic] Interim callback error:', e); }
      }
    }).catch(function (e) {
      console.warn('[MateyMic] Chunk #' + micState.streamProcessedChunks + ' failed:', e);
    });
  }

  function _detectAudioMimeType(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 12) return 'audio/webm';
    var view = new Uint8Array(arrayBuffer);
    var riff = String.fromCharCode.apply(null, view.subarray(0, 4));
    if (riff === 'RIFF' && String.fromCharCode.apply(null, view.subarray(8, 12)) === 'WAVE') return 'audio/wav';
    if (view[0] === 0x1A && view[1] === 0x45 && view[2] === 0xDF && view[3] === 0xA3) return 'audio/webm';
    if (view[4] === 0x66 && view[5] === 0x74 && view[6] === 0x79 && view[7] === 0x70) return 'audio/mp4';
    if (view[0] === 0x4F && view[1] === 0x67 && view[2] === 0x67 && view[3] === 0x53) return 'audio/ogg';
    return 'audio/webm';
  }

  /* decodeAudioData in Chromium returns a promise IN ADDITION to the callbacks,
     so passing an error callback still leaves an unhandled promise rejection
     ("Uncaught (in promise) EncodingError"). This wrapper swallows that promise
     while keeping the existing callback-based error path intact. */
  function _decodeAudioDataSafe(ctx, data, onSuccess, onError) {
    var p = null;
    try {
      p = ctx.decodeAudioData(data, onSuccess, onError);
    } catch (e) {
      if (typeof onError === 'function') onError(e);
      return;
    }
    if (p && typeof p.catch === 'function') {
      p.catch(function () { /* already routed to onError */ });
    }
  }

  function _normalizeBlobForDecode(blob) {
    if (!blob || !blob.type) return blob;
    var supported = ['audio/wav', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
    if (supported.indexOf(blob.type) !== -1) return blob;
    return new Blob([blob], { type: 'audio/webm' });
  }

  /* ---- PCM Capture (reliable core path) ----
     Android WebView's decodeAudioData cannot decode the chunked webm/opus blob
     emitted by MediaRecorder ("EncodingError: Unable to decode audio data"), which
     silently killed every transcription attempt. We therefore capture raw Float32
     PCM in parallel through a ScriptProcessorNode and encode a real WAV container
     ourselves — WAV always decodes, so Whisper always gets usable samples. */
  function _startPcmCapture(stream) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || !stream) return false;
      var ctx = new Ctx();
      var source = ctx.createMediaStreamSource(stream);
      var processor = ctx.createScriptProcessor(4096, 1, 1);
      micState._pcmCtx = ctx;
      micState._pcmSource = source;
      micState._pcmProcessor = processor;
      micState._pcmChunks = [];
      micState._pcmSamples = 0;
      micState._pcmConsumed = 0;
      micState._pcmSampleRate = ctx.sampleRate || 48000;
      processor.onaudioprocess = function (e) {
        try {
          var input = e.inputBuffer.getChannelData(0);
          micState._pcmChunks.push(new Float32Array(input));
          micState._pcmSamples += input.length;
        } catch (err) { /* ignore */ }
      };
      source.connect(processor);
      /* Chrome requires the processor to be connected to a destination to run */
      processor.connect(ctx.destination);
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e2) {} }
      console.log('[MateyMic] PCM capture started @ ' + micState._pcmSampleRate + 'Hz');
      return true;
    } catch (e) {
      console.warn('[MateyMic] PCM capture unavailable, MediaRecorder blob only:', e && e.message);
      micState._pcmCtx = null; micState._pcmProcessor = null; micState._pcmChunks = [];
      return false;
    }
  }

  function _stopPcmCapture() {
    try {
      if (micState._pcmProcessor) {
        micState._pcmProcessor.onaudioprocess = null;
        try { micState._pcmProcessor.disconnect(); } catch (e1) {}
      }
      if (micState._pcmSource) { try { micState._pcmSource.disconnect(); } catch (e2) {} }
      if (micState._pcmCtx) { try { micState._pcmCtx.close(); } catch (e3) {} }
    } catch (e) { /* ignore */ }
    micState._pcmProcessor = null;
    micState._pcmSource = null;
    micState._pcmCtx = null;
  }

  function _encodeWav(samples, sampleRate) {
    var buffer = new ArrayBuffer(44 + samples.length * 2);
    var view = new DataView(buffer);
    function writeString(offset, str) {
      for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    var offset = 44;
    for (var k = 0; k < samples.length; k++, offset += 2) {
      var s = Math.max(-1, Math.min(1, samples[k]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  function _pcmToWavBlob(chunks, sampleRate) {
    if (!chunks || !chunks.length) return null;
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    if (!total) return null;
    var merged = new Float32Array(total);
    var off = 0;
    for (var j = 0; j < chunks.length; j++) { merged.set(chunks[j], off); off += chunks[j].length; }
    var rate = sampleRate || 16000;
    if (window.MateySpeech && MateySpeech.SileroVADProcessor &&
        typeof MateySpeech.SileroVADProcessor.encodeFloat32ToWav === 'function') {
      try {
        return MateySpeech.SileroVADProcessor.encodeFloat32ToWav(merged, rate);
      } catch (e) {
        console.warn('[MateyMic] SileroVAD WAV encode failed, using local encoder:', e && e.message);
      }
    }
    return _encodeWav(merged, rate);
  }

  function _transcribeMicChunk(blob, domain, contextPayload) {
    domain = domain || 'journal';
    contextPayload = contextPayload || {};

    return new Promise(function (resolve, reject) {
      var normalizedBlob = _normalizeBlobForDecode(blob);
      var reader = new FileReader();
      reader.onload = function () {
        var detectedMime = _detectAudioMimeType(reader.result);
        var retryBlob = new Blob([reader.result], { type: detectedMime });
        var retryReader = new FileReader();
        retryReader.onload = function () {
          var audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
          if (audioCtx.state === 'suspended') audioCtx.resume();
          _decodeAudioDataSafe(audioCtx, retryReader.result, function (buffer) {
            var channelData = buffer.getChannelData(0);
            var sampleRate = buffer.sampleRate;

            /* VAD hard-wired always-on */
            var cleanPCM = SileroVADProcessor.filterSilence(channelData);
            if (cleanPCM.length < 100) {
              resolve('');
              return;
            }
            var finalBlob = SileroVADProcessor.encodeFloat32ToWav(cleanPCM, sampleRate);
            console.debug('[MateyMic] Chunk VAD: ' + channelData.length + ' → ' + cleanPCM.length + ' samples');

            if (window.MateyWhisper && window.MateyWhisper.transcribe && window.MateyWhisper.getState && window.MateyWhisper.getState().ready) {
              MateyWhisper.transcribe(finalBlob).then(function (result) {
                var rawText = '';
                if (typeof result === 'string') rawText = result;
                else if (Array.isArray(result)) rawText = result.map(function (r) { return (r && r.text) ? r.text : ''; }).join(' ').trim();
                else if (result && result.text) rawText = result.text;
                else if (result && result.transcription) rawText = result.transcription;

                /* GC: destroy chunk data */
                try {
                  if (blob && blob.type) URL.revokeObjectURL(blob);
                  channelData = null;
                  buffer = null;
                  if (audioCtx) { audioCtx.close(); audioCtx = null; }
                } catch (gcErr) { /* silent */ }

                resolve(rawText.trim());
              }).catch(function (e) {
                console.warn('[MateyMic] Whisper chunk error:', e);
                try { if (blob && blob.type) URL.revokeObjectURL(blob); } catch (e3) {}
                resolve('');
              });
            } else {
              console.debug('[MateyMic] Whisper not ready for chunk, deferring');
              try { if (blob && blob.type) URL.revokeObjectURL(blob); } catch (e3) {}
              resolve('');
            }
          }, function (decodeErr) {
            console.error('[MateyMic] decodeAudioData failed:', decodeErr);
            try { if (blob && blob.type) URL.revokeObjectURL(blob); } catch (e3) {}
            resolve('');
          });
        };
        retryReader.readAsArrayBuffer(retryBlob);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(normalizedBlob);
    });
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

     /* If streaming was active and produced text, use streaming result to avoid duplication */
     if (micState.streamText && micState.streamText.trim()) {
       console.log('[MateyMic] Using streaming text (' + micState.streamText.length + ' chars) instead of full blob transcription');
       if (input && !micState._streamLiveWritten) {
         insertTextAtCursor(input, micState.streamText.trim());
       }
       micState._streamLiveWritten = false;
       if (micState.statusText) micState.statusText.textContent = 'Done';
       setTimeout(function () { if (micState.statusText) micState.statusText.textContent = ''; }, 1000);
       if (sttResolve) sttResolve(micState.streamText.trim());
       /* Fire final interim callback */
       if (micState.streamInterimCallback && typeof micState.streamInterimCallback === 'function') {
         try {
           micState.streamInterimCallback({
             chunkIndex: micState.streamChunkIndex,
             interimText: '',
             fullText: micState.streamText,
             isFinal: true
           });
         } catch (e) { console.error('[MateyMic] Final interim callback error:', e); }
       }
       /* GC */
       try { if (blob && blob.type) URL.revokeObjectURL(blob); micState.audioChunks = []; } catch (e3) {}
       return;
     }

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
        
        /* ---- Aggressive GC: destroy raw audio blobs post-transcription ---- */
        try { if (blob && blob.type) URL.revokeObjectURL(blob); micState.audioChunks = []; } catch (e3) {}
        }).catch(function (e) {
          micState._usingMateySpeech = false;
          console.error('[MateyMic] MateySpeech error:', e);
          if (micState.statusText) micState.statusText.textContent = 'Transcribe error: ' + (e && e.message ? e.message : e);
          setTimeout(function () { if (micState.statusText) micState.statusText.textContent = ''; }, 2500);
        /* GC even on MateySpeech error */
        try { if (blob && blob.type) URL.revokeObjectURL(blob); micState.audioChunks = []; } catch (e3) {}
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

     /* VAD hard-wired always-on — gate all audio through Silero before Whisper */
     var vadEnabled = true;  /* Hard-wired: VAD always active */

     if (window.MateySpeech && window.MateySpeech.SileroVADProcessor) {
       var normalizedBlob = _normalizeBlobForDecode(blob);
       var reader = new FileReader();
        reader.onload = function () {
          var detectedMime = _detectAudioMimeType(reader.result);
          var retryBlob = new Blob([reader.result], { type: detectedMime });
          var retryReader = new FileReader();
          retryReader.onload = function () {
            var audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            if (audioCtx.state === 'suspended') audioCtx.resume();
            _decodeAudioDataSafe(audioCtx, retryReader.result, function (buffer) {
              var channelData = buffer.getChannelData(0);
              var sampleRate = buffer.sampleRate;

              /* VAD hard-wired always-on */
             var cleanPCM = SileroVADProcessor.filterSilence(channelData);
             if (cleanPCM.length < 100) {
               console.warn('[MateyMic] VAD removed all audio (too silent)');
               if (micState.statusText) micState.statusText.textContent = 'No speech detected';
               setTimeout(function () { if (micState.statusText) micState.statusText.textContent = ''; }, 1500);
               if (micState._sttResolve) micState._sttResolve('');
               /* GC: clean audio even on VAD-reject path */
               try { if (blob && blob.type) URL.revokeObjectURL(blob); micState.audioChunks = []; } catch (e3) {}
               return;
             }
             var finalBlob = window.MateySpeech.SileroVADProcessor.encodeFloat32ToWav(cleanPCM, sampleRate);
             console.debug('[MateyMic] VAD truncated ' + (channelData.length - cleanPCM.length) + ' silence samples (' + (channelData.length / sampleRate).toFixed(1) + 's → ' + (cleanPCM.length / sampleRate).toFixed(1) + 's)');
             doSendToWhisper(finalBlob, input, startTime);
           }, function (decodeErr) {
             console.error('[MateyMic] decodeAudioData failed:', decodeErr);
             if (micState._sttReject) micState._sttReject(decodeErr);
           });
         };
         retryReader.readAsArrayBuffer(retryBlob);
       };
       reader.readAsArrayBuffer(normalizedBlob);
     } else {
       doSendToWhisper(blob, input, startTime);
     }
   }

   function doSendToWhisper(blob, input, startTime) {
     var sttResolve = micState._sttResolve;
     var sttReject = micState._sttReject;
     MateyWhisper.transcribe(blob, function (chunk) {
       console.debug('[MateyMic] Transcription chunk received:', JSON.stringify(chunk));
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
      /* ---- Aggressive GC: destroy raw audio blobs post-transcription ---- */
      try { if (blob && blob.type) URL.revokeObjectURL(blob); micState.audioChunks = []; } catch (e3) {}
     }).catch(function (e) {
       console.error('[MateyMic] Transcription failed:', e);
       if (micState.statusText) micState.statusText.textContent = 'Error: ' + (e.message || e);
       setTimeout(function () {
         if (micState.statusText) micState.statusText.textContent = '';
       }, 2000);
       if (sttReject) sttReject(e);
      /* GC even on error */
      try { if (blob && blob.type) URL.revokeObjectURL(blob); micState.audioChunks = []; } catch (e3) {}
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
        micState._streamLiveWritten = false;
        /* Enable live streaming — inject interim chunks straight into #md-compose-input */
        micState._streamInterimCallback = function (evt) {
          if (!evt || evt.isFinal) return;  /* final write is handled post-stop */
          var agentInput = document.getElementById('md-compose-input');
          if (agentInput && evt.fullText) {
            agentInput.value = evt.fullText;
            agentInput.dispatchEvent(new Event('input', { bubbles: true }));
            var end = agentInput.value.length;
            agentInput.setSelectionRange(end, end);
            micState._streamLiveWritten = true;
          }
        };
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
    getRecognitionConfig: function() {
      return micState.recognitionConfig;
    },
    setDomainFromInput: function(inputEl) {
      micState.currentDomain = detectDomain(inputEl);
      micState.currentContextPayload = { inputId: (inputEl && inputEl.id) || '' };
    },
    /* Rolling chunked streaming API */
    setStreamInterimCallback: function(callback) {
      micState._streamInterimCallback = callback;
    },
    getStreamText: function() {
      return micState.streamText || '';
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
    toggle: function (inputId, opts) {
      opts = opts || {};
      if (micState.active) {
        stopRecording();
        return;
      }
      if (inputId) {
        var el = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
        if (el) this.setTargetInput(el);
      }
      if (opts.domain) this.setDomain(opts.domain, opts.contextPayload);
      startRecording();
    },
    onStateChange: function (callback) {
      micState._changeListeners = micState._changeListeners || [];
      micState._changeListeners.push(callback);
      return function () {
        micState._changeListeners = micState._changeListeners.filter(function (l) { return l !== callback; });
      };
    },
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
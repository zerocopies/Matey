/* Matey Whisper — browser-first WASM speech-to-text via Transformers.js CDN */
(function () {
  'use strict';
  var WHISPER_STATE = { ready: false, model: null, transcriber: null, loading: false, modelId: null, progress: 0, isMultilingual: false };
  /* In-flight load promise — shared by all callers so concurrent requests
     (warm-up preload + user recording) never fail with 'Already loading'. */
  var _loadPromise = null;
    var MODEL_OPTIONS = [
    { id: 'Xenova/whisper-tiny.en', label: 'Whisper Tiny (English)', size: '99MB', desc: 'Fast English-only dictation — optimized for mobile', langs: 'english' },
    { id: 'Xenova/whisper-tiny', label: 'Whisper Tiny (multilingual)', size: '99MB', desc: 'Fast multilingual — supports 99+ languages', langs: 'multilingual' }
  ];

  /* ---- CDN URLs for ONNX Runtime Web + Transformers.js ---- */
  var WHISPER_ORT_CDN = [
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort.min.js',
    'https://unpkg.com/onnxruntime-web@1.14.0/dist/ort.min.js'
  ];
  var WHISPER_CDN_URLS = [
    'https://unpkg.com/@xenova/transformers@2.2.0/dist/transformers.min.js',
    'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.2.0/dist/transformers.min.js'
  ];

  function loadFromCDN() {
    return new Promise(function (resolve, reject) {
      if (typeof window.pipeline === 'function') return resolve();
      if (document.querySelector('script[data-transformers-cdn]')) {
        var check = function () {
          if (typeof window.pipeline === 'function') resolve();
          else if (window.pipelineLoadError) reject(window.pipelineLoadError);
          else setTimeout(check, 200);
        };
        check();
        return;
      }

      /* @xenova/transformers@2.2.0 bundles its own ONNX Runtime Web,
         so we skip the separate ort_min.js load and go straight to Transformers */
      loadTransformers();

      function loadTransformers() {
          var MODULE_URL = './transformers.min.js';
          var WRAPPER_URL = './transformers-wrapper.js';
          console.log('[MateyWhisper] Loading Transformers.js locally:', WRAPPER_URL);

          /* Load a local wrapper module that imports the bundled library
             and assigns exports to window */
          var s = document.createElement('script');
          s.type = 'module';
          s.setAttribute('data-transformers-cdn', 'true');
          s.onerror = function (e) {
            console.error('[MateyWhisper] Script onerror:', JSON.stringify({ url: WRAPPER_URL, eventType: e.type, message: e.message || 'no message' }));
            var err = new Error('Failed to load Transformers.js from ' + WRAPPER_URL);
            window.pipelineLoadError = err;
            reject(err);
          };
          s.src = WRAPPER_URL;
          document.head.appendChild(s);

          var check = function () {
            if (typeof window.pipeline === 'function') {
              console.log('[MateyWhisper] Pipeline detected via polling');
              resolve();
            }
            else if (window.pipelineLoadError) {
              reject(window.pipelineLoadError);
            }
            else {
              setTimeout(check, 200);
            }
          };
          check();
      }
    });
  }

  function loadModel(modelId, onProgress) {
    if (WHISPER_STATE.ready && WHISPER_STATE.modelId === modelId) return Promise.resolve(WHISPER_STATE.transcriber);
    if (WHISPER_STATE.loading && _loadPromise) {
      /* Share the in-flight load instead of failing with 'Already loading',
         which used to break transcription whenever the warm-up preload was
         still running (the common case right after app launch). */
      console.log('[MateyWhisper] loadModel(): load already in flight — sharing it');
      if (onProgress) {
        var poll = setInterval(function () {
          if (!WHISPER_STATE.loading) { clearInterval(poll); return; }
          onProgress(WHISPER_STATE.progress || 0);
        }, 250);
        _loadPromise.then(function () { clearInterval(poll); }, function () { clearInterval(poll); });
      }
      return _loadPromise;
    }
    WHISPER_STATE.loading = true;
    WHISPER_STATE.progress = 0;
    if (onProgress) onProgress(0);

    _loadPromise = loadFromCDN().then(function () {
        /* Configure ONNX Runtime WASM backend to use local WASM files */
        if (window.transformersEnv && window.transformersEnv.backends && window.transformersEnv.backends.onnx) {
          var onnxEnv = window.transformersEnv.backends.onnx;
          onnxEnv.wasm.wasmPaths = './';
          console.log('[MateyWhisper] WASM paths set to local:', './');
        }

        /* Configure Transformers.js to load models from local filesystem */
        if (window.transformersEnv) {
          window.transformersEnv.localModelPath = './models/';
          if (window.transformersEnv.allowRemoteModels !== true) {
            window.transformersEnv.allowRemoteModels = false;
          }
          window.transformersEnv.useBrowserCache = false;
          window.transformersEnv.useFSCache = false;
          console.log('[MateyWhisper] Local model path:', './models/', 'allowRemote:', window.transformersEnv.allowRemoteModels);
        }

        return window.pipeline('automatic-speech-recognition', modelId, {
          quantized: true,
         progress_callback: function (p) {
           WHISPER_STATE.progress = p.progress || 0;
           console.log('[MateyWhisper] Pipeline progress:', WHISPER_STATE.progress.toFixed(1) + '%', p.status || 'status:', JSON.stringify(p).substring(0, 200));
           if (onProgress) onProgress(WHISPER_STATE.progress);
         },
         logger: function (log) {
           console.log('[MateyWhisper] Logger:', JSON.stringify(log).substring(0, 300));
         }
       }).catch(function (err) {
         console.error('[MateyWhisper] Pipeline creation failed:', err.name || err.message || err, err.stack || '');
         throw err;
       });
    }).then(function (transcriber) {
      WHISPER_STATE.transcriber = transcriber;
      WHISPER_STATE.modelId = modelId;
      WHISPER_STATE.ready = true;
      WHISPER_STATE.loading = false;
      WHISPER_STATE.isMultilingual = modelId.indexOf('.en') === -1 && modelId.indexOf('-en-') === -1;
      var opts = MODEL_OPTIONS.find(function (m) { return m.id === modelId; });
      console.log('[MateyWhisper] ★ MODEL LOADED:', JSON.stringify({
        modelId: modelId,
        label: opts ? opts.label : 'unknown',
        size: opts ? opts.size : 'unknown',
        langs: opts ? opts.langs : 'unknown',
        isMultilingual: WHISPER_STATE.isMultilingual,
        quantized: true,
        format: 'web-wasm-onnx',
        status: 'ready'
      }));
      if (onProgress) onProgress(100);
      return transcriber;
    }).catch(function (err) {
      WHISPER_STATE.loading = false;
      _loadPromise = null;
      throw err;
    });
    return _loadPromise;
  }

  function resampleToMono16kHz(buffer, sampleRate) {
    if (sampleRate === 16000) return buffer;
    var ratio = sampleRate / 16000;
    var newLength = Math.round(buffer.length / ratio);
    var result = new Float32Array(newLength);
    var offset = 0;
    for (var i = 0; i < newLength; i++) {
      var srcIdx = i * ratio;
      var idx = Math.floor(srcIdx);
      var frac = srcIdx - idx;
      if (idx + 1 < buffer.length) {
        result[i] = buffer[idx] * (1 - frac) + buffer[idx + 1] * frac;
      } else {
        result[i] = buffer[idx] || 0;
      }
    }
    return result;
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

  function transcribe(audioBlob, onResult) {
    if (!WHISPER_STATE.ready || !WHISPER_STATE.transcriber) {
      return Promise.reject('Model not loaded. Please download a model in Settings first.');
    }
    console.log('[MateyWhisper] transcribe() called with blob:', audioBlob.size, 'bytes');
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var settled = false;
        var timeoutId = setTimeout(function () {
          if (!settled) {
            settled = true;
            console.error('[MateyWhisper] decodeAudioData timed out after 15s — rejecting instead of hanging');
            try { audioCtx.close(); } catch (e) {}
            reject(new Error('Audio decode timed out (15s). Try a shorter recording.'));
          }
        }, 15000);
        _decodeAudioDataSafe(audioCtx, reader.result, function (buffer) {
          if (settled) { try { audioCtx.close(); } catch (e2) {} return; }
          settled = true;
          clearTimeout(timeoutId);
          var channelData = buffer.getChannelData(0);
          console.log('[MateyWhisper] Decoded audio: sampleRate=' + buffer.sampleRate +
                      ', channels=' + buffer.numberOfChannels + ', length=' + channelData.length);
          var resampled = resampleToMono16kHz(channelData, buffer.sampleRate);
          console.log('[MateyWhisper] Resampled to 16kHz: length=' + resampled.length);
           WHISPER_STATE.transcriber(resampled, {
            sampling_rate: 16000,
            language: WHISPER_STATE.isMultilingual ? 'en' : undefined,
            /* Greedy decoding: beam search (num_beams>1) took ~4 minutes for an
               11s clip on a Pixel 8a (measured 14:13:13→14:17:15), which made
               dictation unusable. Greedy is the mobile-appropriate default. */
            num_beams: 1,
            repetition_penalty: 1.05,
            no_repeat_ngram_size: 3,
            max_new_tokens: 224,
            temperature: 0.0
          }).then(function (result) {
            console.log('[MateyWhisper] Transcription result:', result);
            try { audioCtx.close(); } catch (e3) {}
            resolve(result);
          }).catch(function (e) { try { audioCtx.close(); } catch (e4) {} reject(e); });
        }, function (decodeErr) {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          console.error('[MateyWhisper] decodeAudioData failed:', decodeErr);
          try { audioCtx.close(); } catch (e5) {}
          reject(decodeErr instanceof Error ? decodeErr
            : new Error('Unable to decode audio data (' + (decodeErr && decodeErr.name ? decodeErr.name : 'EncodingError') + '). Try recording again.'));
        });
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(audioBlob);
    });
  }

  function getState() { return WHISPER_STATE; }

  function getModelOptions() { return MODEL_OPTIONS; }

  function getStoredModel() {
    try {
      var stored = localStorage.getItem('matey-whisper-model') || '';
      /* Enforce mobile-safe defaults — reject heavy models that were purged */
      var allowed = ['Xenova/whisper-tiny.en', 'Xenova/whisper-tiny'];
      if (allowed.indexOf(stored) === -1) {
        localStorage.setItem('matey-whisper-model', 'Xenova/whisper-tiny.en');
        return 'Xenova/whisper-tiny.en';
      }
      return stored;
    } catch (e) { return 'Xenova/whisper-tiny.en'; }
  }
  function storeModel(id) {
    try { localStorage.setItem('matey-whisper-model', id); } catch (e) {}
  }

  function getDownloadedModels() {
    try { return JSON.parse(localStorage.getItem('matey-whisper-downloaded') || '[]'); } catch (e) { return []; }
  }
  function isModelDownloaded(modelId) {
    return getDownloadedModels().indexOf(modelId) !== -1;
  }
  function markModelDownloaded(modelId) {
    var downloaded = getDownloadedModels();
    if (downloaded.indexOf(modelId) === -1) {
      downloaded.push(modelId);
      try { localStorage.setItem('matey-whisper-downloaded', JSON.stringify(downloaded)); } catch (e) {}
    }
  }

    /* ---- Warm-Loaded Singleton (preload) ---- */
  var _preloadPromise = null;
  var _preloadResolved = false;

  function preloadEngine() {
    /* Return cached promise on subsequent calls — model loads exactly once */
    if (_preloadPromise) return _preloadPromise;

    var modelId = getStoredModel() || 'Xenova/whisper-tiny.en';
    if (WHISPER_STATE.ready && WHISPER_STATE.modelId === modelId) {
      _preloadResolved = true;
      _preloadPromise = Promise.resolve(WHISPER_STATE.transcriber);
      return _preloadPromise;
    }

    if (WHISPER_STATE.loading) {
      /* Wait for in-flight load to finish */
      _preloadPromise = new Promise(function (resolve, reject) {
        var check = function () {
          if (WHISPER_STATE.ready) { _preloadResolved = true; resolve(WHISPER_STATE.transcriber); }
          else if (!WHISPER_STATE.loading) { reject(new Error('Preload cancelled')); }
          else { setTimeout(check, 200); }
        };
        check();
      });
      return _preloadPromise;
    }

    console.log('[MateyWhisper] preloadEngine: warming up model →', modelId);

    /* Load in background — non-blocking, no UI interaction required */
    _preloadPromise = loadModel(modelId).then(function (transcriber) {
      _preloadResolved = true;
      console.log('[MateyWhisper] preloadEngine: model warmed and cached in memory singleton');
      return transcriber;
    }).catch(function (err) {
      _preloadPromise = null;  /* Allow retry on error */
      console.warn('[MateyWhisper] preloadEngine: model preload failed:', err && err.message ? err.message : err);
      return null;
    });

    return _preloadPromise;
  }

  window.MateyWhisper = {
    loadModel: loadModel,
    transcribe: transcribe,
    getState: getState,
    getModelOptions: getModelOptions,
    getStoredModel: getStoredModel,
    storeModel: storeModel,
    getDownloadedModels: getDownloadedModels,
    isModelDownloaded: isModelDownloaded,
    markModelDownloaded: markModelDownloaded,
    preloadEngine: preloadEngine,
    debugSwapModel: function (modelId) {
      var opts = MODEL_OPTIONS.find(function (m) { return m.id === modelId; });
      if (!opts) {
        console.error('[MateyWhisper] debugSwapModel: unknown model ID:', modelId);
        console.log('[MateyWhisper] Available models:', MODEL_OPTIONS.map(function (m) { return m.id; }).join(', '));
        return Promise.reject('Unknown model: ' + modelId);
      }
      console.log('[MateyWhisper.DEBUG] Swapping to model:', modelId);
      return loadModel(modelId);
    },
    debugTranscribeParams: function () {
      return {
        language: WHISPER_STATE.isMultilingual ? 'en' : undefined,
        num_beams: 5,
        repetition_penalty: 1.05,
        no_repeat_ngram_size: 3,
        max_new_tokens: 224,
        temperature: 0.0
      };
    }
  };
})();

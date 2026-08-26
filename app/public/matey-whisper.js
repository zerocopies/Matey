/* Matey Whisper — browser-first WASM speech-to-text via Transformers.js CDN */
(function () {
  'use strict';
  var WHISPER_STATE = { ready: false, model: null, transcriber: null, loading: false, modelId: null, progress: 0 };
  var MODEL_OPTIONS = [
    { id: 'Xenova/whisper-tiny', label: 'Whisper Tiny (multilingual)', size: '99MB', desc: 'Fast — supports English, Chinese, French, German, Spanish, Arabic, Japanese, Korean, Russian, Portuguese, Italian, Dutch, Czech, Danish, Swedish, Polish, Hindi, Thai, Vietnamese, Turkish, and more', langs: 'multilingual' },
    { id: 'Xenova/whisper-base', label: 'Whisper Base (multilingual)', size: '300MB', desc: 'Higher accuracy — all languages supported by Tiny plus Finnish, Hungarian, Romanian, Norwegian, Croatian, Serbian, Bulgarian, Greek, Hebrew, Urdu, Bengali, Tamil, Telugu, Marathi, Indonesian, Malay, Welsh, Afrikaans, Swahili, Zulu, and others', langs: 'multilingual' },
    { id: 'Xenova/whisper-tiny.en', label: 'Whisper Tiny (English)', size: '99MB', desc: 'Fast English-only dictation', langs: 'english' },
    { id: 'Xenova/whisper-base.en', label: 'Whisper Base (English)', size: '300MB', desc: 'Higher accuracy English-only dictation', langs: 'english' },
    { id: 'Xenova/whisper-small', label: 'Whisper Small (multilingual)', size: '760MB', desc: 'Balanced speed and accuracy — all languages supported, higher fidelity transcription', langs: 'multilingual' },
    { id: 'Xenova/whisper-medium', label: 'Whisper Medium (multilingual)', size: '1.5GB', desc: 'Highest quality offline STT — larger download, best accuracy across 99+ languages', langs: 'multilingual' }
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
    if (WHISPER_STATE.loading) return Promise.reject('Already loading');
    if (WHISPER_STATE.ready && WHISPER_STATE.modelId === modelId) return Promise.resolve(WHISPER_STATE.transcriber);
    WHISPER_STATE.loading = true;
    WHISPER_STATE.progress = 0;
    if (onProgress) onProgress(0);

return loadFromCDN().then(function () {
        /* Configure ONNX Runtime WASM backend to use local WASM files */
        if (window.transformersEnv && window.transformersEnv.backends && window.transformersEnv.backends.onnx) {
          var onnxEnv = window.transformersEnv.backends.onnx;
          onnxEnv.wasm.wasmPaths = './';
          console.log('[MateyWhisper] WASM paths set to local:', './');
        }

        /* Configure Transformers.js to load models from local filesystem */
        if (window.transformersEnv) {
          window.transformersEnv.localModelPath = './models/';
          window.transformersEnv.allowRemoteModels = false;
          window.transformersEnv.useBrowserCache = false;
          window.transformersEnv.useFSCache = false;
          console.log('[MateyWhisper] Local model path:', './models/');
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
      if (onProgress) onProgress(100);
      return transcriber;
    }).catch(function (err) {
      WHISPER_STATE.loading = false;
      throw err;
    });
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

  function transcribe(audioBlob, onResult) {
    if (!WHISPER_STATE.ready || !WHISPER_STATE.transcriber) {
      return Promise.reject('Model not loaded. Please download a model in Settings first.');
    }
    console.log('[MateyWhisper] transcribe() called with blob:', audioBlob.size, 'bytes');
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.decodeAudioData(reader.result, function (buffer) {
          var channelData = buffer.getChannelData(0);
          console.log('[MateyWhisper] Decoded audio: sampleRate=' + buffer.sampleRate +
                      ', channels=' + buffer.numberOfChannels + ', length=' + channelData.length);
          var resampled = resampleToMono16kHz(channelData, buffer.sampleRate);
          console.log('[MateyWhisper] Resampled to 16kHz: length=' + resampled.length);
          WHISPER_STATE.transcriber(resampled, {
            sampling_rate: 16000
          }).then(function (result) {
            console.log('[MateyWhisper] Transcription result:', result);
            resolve(result);
          }).catch(reject);
        }, reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(audioBlob);
    });
  }

  function getState() { return WHISPER_STATE; }

  function getModelOptions() { return MODEL_OPTIONS; }

  function getStoredModel() {
    try { return localStorage.getItem('matey-whisper-model') || ''; } catch (e) { return ''; }
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

  window.MateyWhisper = {
    loadModel: loadModel,
    transcribe: transcribe,
    getState: getState,
    getModelOptions: getModelOptions,
    getStoredModel: getStoredModel,
    storeModel: storeModel,
    getDownloadedModels: getDownloadedModels,
    isModelDownloaded: isModelDownloaded,
    markModelDownloaded: markModelDownloaded
  };
})();

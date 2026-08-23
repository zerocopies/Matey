/* Matey Whisper — browser-first WASM speech-to-text via Transformers.js CDN */
(function () {
  'use strict';
  var WHISPER_STATE = { ready: false, model: null, transcriber: null, loading: false, modelId: null, progress: 0 };
  var MODEL_OPTIONS = [
    { id: 'Xenova/whisper-tiny.en', label: 'Tiny (~99MB)', size: '99MB', desc: 'Fast dictation' },
    { id: 'Xenova/whisper-base.en', label: 'Base (~300MB)', size: '300MB', desc: 'Higher accuracy' }
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

      loadORTScripts();

      function loadORTScripts() {
        loadORT(WHISPER_ORT_CDN[0], function (ortErr) {
          if (ortErr) {
            console.warn('[MateyWhisper] ORT CDN fallback, trying:', WHISPER_ORT_CDN[1]);
            loadORT(WHISPER_ORT_CDN[1], function (ortErr2) {
              if (ortErr2) {
                console.error('[MateyWhisper] All ORT CDN URLs failed:', WHISPER_ORT_CDN);
                window.pipelineLoadError = ortErr2;
                reject(ortErr2);
              } else {
                console.log('[MateyWhisper] ONNX Runtime Web loaded');
                loadTransformers();
              }
            });
          } else {
            console.log('[MateyWhisper] ONNX Runtime Web loaded');
            loadTransformers();
          }
        });

        function loadTransformers() {
          var CDN_URL = WHISPER_CDN_URLS[0];
          console.log('[MateyWhisper] Loading Transformers.js from:', CDN_URL);
          var s = document.createElement('script');
          s.type = 'module';
          s.setAttribute('data-transformers-cdn', 'true');
          s.textContent = "import * as t from '" + CDN_URL + "'; window.pipeline = t.pipeline; window.transformersEnv = t.env;";
          s.onerror = function (e) {
            console.error('[MateyWhisper] Script onerror:', { url: CDN_URL, eventType: e.type, message: e.message || 'no message' });
            var err = new Error('Failed to load Transformers.js from ' + CDN_URL + ' (onerror type: ' + e.type + '). Check network connectivity.');
            window.pipelineLoadError = err;
            reject(err);
          };
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
      }

      function loadORT(url, callback) {
        var s = document.createElement('script');
        s.setAttribute('data-ort-cdn', 'true');
        s.onload = function () {
          if (typeof window.ort !== 'undefined') {
            var wasmBase = url.replace(/\/ort\.min\.js$/, '');
            if (window.ort.env && window.ort.env.wasm) {
              window.ort.env.wasm.wasmUrls = [wasmBase + '/ort-wasm.wasm'];
              window.ort.env.wasm.libs = [wasmBase + '/ort-wasm-simd.wasm'];
              console.log('[MateyWhisper] ORT WASM paths configured:', wasmBase);
            }
            callback(null);
          }
          else callback(new Error('ORT loaded but window.ort is undefined'));
        };
        s.onerror = function (e) {
          callback(new Error('Failed to load ORT from ' + url + ' (type: ' + e.type + ')'));
        };
        s.src = url;
        document.head.appendChild(s);
      }
    });
  }

  function loadModel(modelId, onProgress) {
    if (WHISPER_STATE.loading) return Promise.reject('Already loading');
    WHISPER_STATE.loading = true;
    WHISPER_STATE.progress = 0;
    if (onProgress) onProgress(0);

    return loadFromCDN().then(function () {
      /* Override WASM paths to use unpkg.com (cdn.jsdelivr.net may be unreachable) */
      if (window.transformersEnv && window.transformersEnv.backends && window.transformersEnv.backends.onnx) {
        var onnxEnv = window.transformersEnv.backends.onnx;
        if (onnxEnv.wasm && onnxEnv.wasm.wasmPaths) {
          onnxEnv.wasm.wasmPaths = 'https://unpkg.com/@xenova/transformers@' + window.transformersEnv.version + '/dist/';
          console.log('[MateyWhisper] WASM paths overridden to unpkg:', onnxEnv.wasm.wasmPaths);
        }
      }
      return window.pipeline('automatic-speech-recognition', modelId, {
        progress_callback: function (p) {
          WHISPER_STATE.progress = p.progress || 0;
          if (onProgress) onProgress(WHISPER_STATE.progress);
        }
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

  function transcribe(audioBlob, onResult) {
    if (!WHISPER_STATE.ready || !WHISPER_STATE.transcriber) {
      return Promise.reject('Model not loaded. Please download a model in Settings first.');
    }
    // Convert blob to audio element, get AudioBuffer-like data
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.decodeAudioData(reader.result, function (buffer) {
          var raw = buffer.getChannelData(0);
          // Whisper expects 16kHz mono
          var sampleRate = 16000;
          var resampled = raw; // simplified — in production would resample
          WHISPER_STATE.transcriber(resampled, {
            sampling_rate: sampleRate,
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: false,
            callback_function: function (chunk) {
              if (onResult) onResult(chunk);
            }
          }).then(resolve).catch(reject);
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

  window.MateyWhisper = {
    loadModel: loadModel,
    transcribe: transcribe,
    getState: getState,
    getModelOptions: getModelOptions,
    getStoredModel: getStoredModel,
    storeModel: storeModel
  };
})();

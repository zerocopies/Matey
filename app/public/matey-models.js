/* Matey Models — on-device text models via Transformers.js CDN
 *
 * Handles downloading and caching of micro models for:
 * - Grammar correction (text2text-generation)
 * - Translation (translation)
 * - Any other text-generation models
 *
 * Uses the same Transformers.js pipeline as MateyWhisper, with progress tracking.
 */
(function () {
  'use strict';

  var MODEL_MAP = {
    't5-grammar-correction': {
      hfId: 'Xenova/flan-t5-small',
      task: 'text2text-generation',
      label: 'flan-t5-small-grammar-correction'
    },
    'opus-mt-de-en': {
      hfId: 'Xenova/opus-mt-de-en',
      task: 'translation',
      label: 'German ↔ English'
    },
    'opus-mt-en-de': {
      hfId: 'Xenova/opus-mt-en-de',
      task: 'translation',
      label: 'English ↔ German'
    },
    'opus-mt-ja-en': {
      hfId: 'Xenova/opus-mt-ja-en',
      task: 'translation',
      label: 'Japanese ↔ English'
    },
    'opus-mt-en-ja': {
      hfId: 'Xenova/opus-mt-en-ja',
      task: 'translation',
      label: 'English ↔ Japanese'
    },
    'opus-mt-ko-en': {
      hfId: 'Xenova/opus-mt-ko-en',
      task: 'translation',
      label: 'Korean ↔ English'
    },
    'opus-mt-en-ko': {
      hfId: 'Xenova/opus-mt-en-ko',
      task: 'translation',
      label: 'English ↔ Korean'
    }
  };

  var LOADED_KEY = 'matey-models-loaded';
  var LOADING_KEY = 'matey-models-loading';

  var state = {
    loading: null,
    progress: 0,
    loaded: {}
  };

  /* ---- Load ONNX Runtime Web + Transformers.js from CDN ---- */
  var ORT_CDN_URLS = [
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort.min.js',
    'https://unpkg.com/onnxruntime-web@1.14.0/dist/ort.min.js'
  ];
  var CDN_URLS = [
    'https://unpkg.com/@xenova/transformers@2.2.0/dist/transformers.min.js',
    'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.2.0/dist/transformers.min.js'
  ];

  function ensurePipeline() {
    return new Promise(function (resolve, reject) {
      if (typeof window.pipeline === 'function') return resolve();

      var existing = document.querySelector('script[data-transformers-cdn]');
      if (existing) {
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
        loadORT(ORT_CDN_URLS[0], function (ortErr) {
          if (ortErr) {
            console.warn('[MateyModels] ORT CDN fallback, trying:', ORT_CDN_URLS[1]);
            loadORT(ORT_CDN_URLS[1], function (ortErr2) {
              if (ortErr2) {
                console.error('[MateyModels] All ORT CDN URLs failed:', ORT_CDN_URLS);
                window.pipelineLoadError = ortErr2;
                reject(ortErr2);
              } else {
                console.log('[MateyModels] ONNX Runtime Web loaded successfully');
                loadTransformers();
              }
            });
          } else {
            console.log('[MateyModels] ONNX Runtime Web loaded successfully');
            loadTransformers();
          }
        });

        function loadTransformers() {
          var CDN_URL = CDN_URLS[0];
          console.log('[MateyModels] Loading Transformers.js from:', CDN_URL);
          loadScriptModule(CDN_URL, function (err, index) {
            if (err && index < CDN_URLS.length - 1) {
              console.warn('[MateyModels] CDN fallback: trying', CDN_URLS[index + 1]);
              CDN_URL = CDN_URLS[index + 1];
              loadScriptModule(CDN_URL, function (err3) {
                if (err3) {
                  console.error('[MateyModels] All CDN URLs failed:', CDN_URLS);
                  window.pipelineLoadError = err3;
                  reject(err3);
                } else {
                  console.log('[MateyModels] Transformers.js loaded successfully');
                  resolve();
                }
              });
            } else if (err) {
              console.error('[MateyModels] Script load failed:', { url: CDN_URL, error: err.message || err });
              window.pipelineLoadError = err;
              reject(err);
            } else {
              console.log('[MateyModels] Transformers.js loaded successfully');
              resolve();
            }
          });
        }
      }
    });
  }

  function loadORT(url, callback) {
    var s = document.createElement('script');
    s.setAttribute('data-ort-cdn', 'true');
    s.onload = function () {
      if (typeof window.ort !== 'undefined') {
        /* Configure WASM backend paths explicitly */
        var wasmBase = url.replace(/\/ort\.min\.js$/, '');
        if (window.ort.env && window.ort.env.wasm) {
          window.ort.env.wasm.wasmUrls = [wasmBase + '/ort-wasm.wasm'];
          window.ort.env.wasm.libs = [wasmBase + '/ort-wasm-simd.wasm'];
          console.log('[MateyModels] ORT WASM paths configured:', wasmBase);
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

  function loadScriptModule(url, callback) {
    var s = document.createElement('script');
    s.type = 'module';
    s.setAttribute('data-transformers-cdn', 'true');
    s.textContent = "import * as t from '" + url + "'; window.pipeline = t.pipeline; window.transformersEnv = t.env;";
    s.onerror = function (e) {
      console.error('[MateyModels] Script onerror event:', { url: url, eventType: e.type, message: e.message || 'no message' });
      var err = new Error('Failed to load Transformers.js from ' + url + ' (onerror event type: ' + e.type + '). Check network connectivity to ' + url);
      callback(err, CDN_URLS.indexOf(url));
    };
    document.head.appendChild(s);

    /* Poll for window.pipeline — inline module scripts may not fire onload
       in all WebView versions, so we use polling as the reliable detection */
    var check = function () {
      if (typeof window.pipeline === 'function') {
        console.log('[MateyModels] Pipeline detected via polling');
        callback(null, 0);
      }
      else if (window.pipelineLoadError) {
        callback(window.pipelineLoadError, 0);
      }
      else {
        setTimeout(check, 200);
      }
    };
    check();
  }

  /* ---- Persist loaded models list ---- */
  function getLoaded() {
    try { return JSON.parse(localStorage.getItem(LOADED_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function setLoaded(map) {
    try { localStorage.setItem(LOADED_KEY, JSON.stringify(map)); } catch (e) {}
  }

  /* ---- Download a model ---- */
  async function downloadModel(modelId, onProgress) {
    var config = MODEL_MAP[modelId];
    if (!config) throw new Error('Unknown model: ' + modelId);

    if (state.loading) {
      throw new Error('Another model is already downloading');
    }

    var loaded = getLoaded();
    if (loaded[modelId]) {
      if (onProgress) onProgress(100);
      return config;
    }

    /* Check if another download is in progress */
    try {
      var loading = JSON.parse(localStorage.getItem(LOADING_KEY) || 'null');
      if (loading && loading !== modelId) {
        throw new Error('Wait for the current download to finish');
      }
    } catch (e) {}

    state.loading = modelId;
    state.progress = 0;
    localStorage.setItem(LOADING_KEY, modelId);
    if (onProgress) onProgress(0);

    try {
      await ensurePipeline();

      if (onProgress) onProgress(5);

      /* Override WASM paths to use unpkg.com (cdn.jsdelivr.net may be unreachable) */
      if (window.transformersEnv && window.transformersEnv.backends && window.transformersEnv.backends.onnx) {
        var onnxEnv = window.transformersEnv.backends.onnx;
        if (onnxEnv.wasm && onnxEnv.wasm.wasmPaths) {
          onnxEnv.wasm.wasmPaths = 'https://unpkg.com/@xenova/transformers@' + window.transformersEnv.version + '/dist/';
          console.log('[MateyModels] WASM paths overridden to unpkg:', onnxEnv.wasm.wasmPaths);
        }
      }

      /* eslint-disable no-undef */
      console.log('[MateyModels] Downloading model:', config.hfId, 'task:', config.task);
      var model = await window.pipeline(config.task, config.hfId, {
        progress_callback: function (p) {
          state.progress = p.progress || 0;
          if (onProgress) onProgress(state.progress);
        },
        quantized: true
      });
      /* eslint-enable no-undef */

      /* Store in memory and persist the loaded flag */
      state.loaded[modelId] = model;
      loaded[modelId] = true;
      setLoaded(loaded);

      state.loading = null;
      localStorage.removeItem(LOADING_KEY);
      if (onProgress) onProgress(100);
      console.log('[MateyModels] Model loaded successfully:', modelId);

      return config;
    } catch (err) {
      console.error('[MateyModels] Download failed:', {
        modelId: modelId,
        hfId: config.hfId,
        task: config.task,
        error: err,
        message: err.message || String(err),
        stack: err.stack || ''
      });
      state.loading = null;
      localStorage.removeItem(LOADING_KEY);
      throw err;
    }
  }

  /* ---- Check if model is loaded ---- */
  function isModelLoaded(modelId) {
    var loaded = getLoaded();
    return !!loaded[modelId];
  }

  /* ---- Get model config ---- */
  function getModelConfig(modelId) {
    return MODEL_MAP[modelId] || null;
  }

  /* ---- Get all available models ---- */
  function getAvailableModels() {
    return Object.keys(MODEL_MAP).map(function (id) {
      return {
        id: id,
        hfId: MODEL_MAP[id].hfId,
        task: MODEL_MAP[id].task,
        label: MODEL_MAP[id].label,
        loaded: isModelLoaded(id)
      };
    });
  }

  /* ---- Get a loaded model instance ---- */
  function getModel(modelId) {
    if (state.loaded[modelId]) return state.loaded[modelId];
    return null;
  }

  window.MateyModels = {
    downloadModel: downloadModel,
    isModelLoaded: isModelLoaded,
    getModel: getModel,
    getModelConfig: getModelConfig,
    getAvailableModels: getAvailableModels,
    MODEL_MAP: MODEL_MAP
  };
})();

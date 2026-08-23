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
      hfId: 'Xenova/t5-efficient-tiny',
      task: 'text2text-generation',
      label: 't5-efficient-tiny-grammar-correction'
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

  /* ---- Load Transformers.js from CDN ---- */
  function ensurePipeline() {
    return new Promise(function (resolve, reject) {
      if (typeof window.pipeline === 'function') return resolve();

      var existing = document.querySelector('script[data-transformers-cdn]');
      if (existing) {
        var check = function () {
          if (typeof window.pipeline === 'function') resolve();
          else setTimeout(check, 200);
        };
        check();
        return;
      }

      var s = document.createElement('script');
      s.type = 'module';
      s.setAttribute('data-transformers-cdn', 'true');
      s.textContent = "import * as t from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.2.2/dist/transformers.min.js'; window.pipeline = t.pipeline;";
      s.onload = function () {
        var check2 = function () {
          if (typeof window.pipeline === 'function') resolve();
          else if (window.pipelineLoadError) reject(window.pipelineLoadError);
          else setTimeout(check2, 200);
        };
        check2();
      };
      s.onerror = function (e) {
        window.pipelineLoadError = new Error('Failed to load Transformers.js from CDN — check network connectivity');
        reject(window.pipelineLoadError);
      };
      document.head.appendChild(s);
    });
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

      /* eslint-disable no-undef */
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

      return config;
    } catch (err) {
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

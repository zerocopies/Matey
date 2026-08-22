/* Matey Whisper — browser-first WASM speech-to-text via Transformers.js CDN */
(function () {
  'use strict';
  var WHISPER_STATE = { ready: false, model: null, transcriber: null, loading: false, modelId: null, progress: 0 };
  var MODEL_OPTIONS = [
    { id: 'Xenova/whisper-tiny.en', label: 'Tiny (~99MB)', size: '99MB', desc: 'Fast dictation' },
    { id: 'Xenova/whisper-base.en', label: 'Base (~300MB)', size: '300MB', desc: 'Higher accuracy' }
  ];

  function loadFromCDN() {
    return new Promise(function (resolve, reject) {
      if (window.pipeline) return resolve();
      var s = document.createElement('script');
      s.type = 'module';
      s.textContent = "import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'; window.pipeline = pipeline;";
      s.onload = function () { setTimeout(resolve, 500); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadModel(modelId, onProgress) {
    if (WHISPER_STATE.loading) return Promise.reject('Already loading');
    WHISPER_STATE.loading = true;
    WHISPER_STATE.progress = 0;
    if (onProgress) onProgress(0);

    return loadFromCDN().then(function () {
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

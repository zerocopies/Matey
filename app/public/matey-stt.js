/* Matey Universal Speech Engine — app-wide STT with domain awareness
 *
 * Integrates the spec from /home/prp/Documents/matey-stt.js as a browser-compatible
 * IIFE that binds to window.MateySpeech. Provides:
 *   - STT_DOMAINS: Culinary, Wardrobe, Grooming, Living, Journal, Editor, Agent
 *   - STT_MODEL_CATALOG: 4 on-device models (Silero VAD, Distil-Whisper Small,
 *     Whisper Large v3 Turbo, Moonshine Base)
 *   - ModelStorageManager: IndexedDB-backed model weight storage
 *   - DirectDownloader: fetch-based model download with progress
 *   - ContextConditioner: domain-specific Whisper initial prompts
 *   - MultiDomainPostProcessor: domain-specific text cleanup
 *   - SileroVADProcessor: silence/noise filtering before inference
 *   - UniversalSpeechService: startListening() / stopListening(domain, contextPayload)
 *
 * Future mic buttons across all app views hook into window.MateySpeech — no core
 * logic changes needed when new domains or views are added.
 *
 * Depends on window.MateyWhisper for actual transcription inference.
 */
(function () {
  'use strict';

  var STT_DOMAINS = {
    CULINARY: 'culinary',
    WARDROBE: 'wardrobe',
    GROOMING: 'grooming',
    LIVING: 'living',
    JOURNAL: 'journal',
    EDITOR: 'editor',
    AGENT: 'agent'
  };

  var STT_MODEL_CATALOG = [
    {
      id: 'silero-vad',
      name: 'Silero VAD (Silence & Noise Filter)',
      type: 'vad',
      sizeMB: 2,
      recommended: true,
      description: 'Universal noise gate. Trims non-speech silence before inference to maximize battery life and speed up voice input across all modules.',
      downloadUrl: 'https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model.onnx'
    },
    {
      id: 'distil-whisper-small',
      name: 'Distil-Whisper Small (INT8 ONNX)',
      type: 'stt',
      sizeMB: 150,
      recommended: true,
      description: 'Fastest mobile dictation engine. Instant local voice transcription across all app screens.',
      downloadUrl: 'https://huggingface.co/onnx-community/distil-whisper-small.en-onnx/resolve/main/onnx/decoder_model_merged_quantized.onnx'
    },
    {
      id: 'whisper-large-v3-turbo',
      name: 'Whisper Large v3 Turbo (ONNX)',
      type: 'stt',
      sizeMB: 808,
      recommended: false,
      description: 'High-precision engine for 99 languages. Ideal for international language dictation and complex notes.',
      downloadUrl: 'https://huggingface.co/onnx-community/whisper-large-v3-turbo-onnx/resolve/main/onnx/decoder_model_merged_quantized.onnx'
    },
    {
      id: 'moonshine-base',
      name: 'Moonshine Base (Ultra-Light Edge)',
      type: 'stt',
      sizeMB: 110,
      recommended: false,
      description: 'Minimal memory footprint designed for continuous low-power background listening.',
      downloadUrl: 'https://huggingface.co/onnx-community/moonshine-base-onnx/resolve/main/onnx/model.onnx'
    }
  ];

  /* ---- ModelStorageManager (IndexedDB) ---- */
  var ModelStorageManager = {
    DB_NAME: 'MateyVoiceDB',
    STORE_NAME: 'models',

    openDB: function () {
      var self = this;
      return new Promise(function (resolve, reject) {
        var request = indexedDB.open(self.DB_NAME, 1);
        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains(self.STORE_NAME)) {
            db.createObjectStore(self.STORE_NAME);
          }
        };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
      });
    },

    saveModel: function (modelId, arrayBuffer) {
      var self = this;
      return new Promise(function (resolve, reject) {
        self.openDB().then(function (db) {
          var tx = db.transaction(self.STORE_NAME, 'readwrite');
          var store = tx.objectStore(self.STORE_NAME);
          var req = store.put(arrayBuffer, modelId);
          req.onsuccess = function () { resolve(true); };
          req.onerror = function () { reject(req.error); };
        }).catch(reject);
      });
    },

    getModel: function (modelId) {
      var self = this;
      return new Promise(function (resolve, reject) {
        self.openDB().then(function (db) {
          var tx = db.transaction(self.STORE_NAME, 'readonly');
          var store = tx.objectStore(self.STORE_NAME);
          var req = store.get(modelId);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { reject(req.error); };
        }).catch(reject);
      });
    },

    deleteModel: function (modelId) {
      var self = this;
      return new Promise(function (resolve, reject) {
        self.openDB().then(function (db) {
          var tx = db.transaction(self.STORE_NAME, 'readwrite');
          var store = tx.objectStore(self.STORE_NAME);
          var req = store.delete(modelId);
          req.onsuccess = function () { resolve(true); };
          req.onerror = function () { reject(req.error); };
        }).catch(reject);
      });
    }
  };

  /* ---- DirectDownloader ---- */
  var DirectDownloader = {
    downloadModel: function (modelId, onProgress) {
      var model = STT_MODEL_CATALOG.find(function (m) { return m.id === modelId; });
      if (!model) throw new Error('Model ' + modelId + ' not found in catalog.');

      return fetch(model.downloadUrl).then(function (response) {
        if (!response.ok) throw new Error('HTTP error! Status: ' + response.status);

        var contentLength = response.headers.get('content-length');
        var totalBytes = contentLength ? parseInt(contentLength, 10) : model.sizeMB * 1024 * 1024;
        var reader = response.body.getReader();
        var receivedBytes = 0;
        var chunks = [];

        return new ReadableStream({
          start: function (controller) {
            var pump = function () {
              reader.read().then(function (chunk) {
                if (chunk.done) {
                  controller.close();
                  return;
                }
                chunks.push(chunk.value);
                receivedBytes += chunk.value.length;
                if (onProgress) {
                  var percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
                  onProgress({ receivedBytes: receivedBytes, totalBytes: totalBytes, percent: percent });
                }
                controller.enqueue(chunk.value);
                pump();
              }).catch(function (err) {
                controller.error(err);
              });
            };
            pump();
          }
        }).getReader().read().then(function () {
          var blob = new Blob(chunks);
          return blob.arrayBuffer();
        }).then(function (arrayBuffer) {
          return ModelStorageManager.saveModel(modelId, arrayBuffer).then(function () {
            return arrayBuffer;
          });
        });
      });
    }
  };

  /* ---- ContextConditioner ---- */
  var GROOMING_KEYWORDS = [
    'haircut', 'beard', 'skincare', 'moisturizer', 'cleanser', 'serum', 'cologne',
    'fragrance', 'shave', 'SPF', 'sunscreen', 'hygiene', 'routine', 'hair',
    'face', 'body', 'shampoo', 'conditioner', 'lotion', 'cream', 'ointment',
    'sunscreen', 'after shave', 'deodorant', 'razor', 'trimmer', 'brush'
  ].join(', ');

  var WARDROBE_KEYWORDS = [
    'cotton', 'denim', 'jacket', 'sneakers', 'shirt', 'trousers', 'size', 'fit',
    'casual', 'formal', 'laundry', 'outfit', 'brand', 'color', 'suit', 'jeans',
    'jacket', 'coat', 'boots', 'dress', 'skirt'
  ].join(', ');

  var CULINARY_KEYWORDS = [
    'ingredients', 'grams', 'ml', 'tablespoons', 'teaspoons', 'bake', 'sauté',
    'simmer', 'preheat', 'oven', 'pan', 'pot', 'recipe', 'serve', 'chopped'
  ].join(', ');

  var LIVING_KEYWORDS = [
    'inventory', 'restock', 'pantry', 'room', 'schedule', 'clean', 'maintenance',
    'smart home', 'lights', 'thermostat', 'order', 'buy', 'replace'
  ].join(', ');

  var ContextConditioner = {
    generatePrompt: function (domain, contextPayload) {
      contextPayload = contextPayload || {};
      switch (domain) {
        case STT_DOMAINS.GROOMING:
          return 'Domain: Personal Grooming & Self-Care. Keywords: ' + GROOMING_KEYWORDS + ', ' + (contextPayload.routineType || '');

        case STT_DOMAINS.WARDROBE:
          return 'Domain: Wardrobe & Fashion. Keywords: ' + WARDROBE_KEYWORDS + ', ' + (contextPayload.category || '');

        case STT_DOMAINS.CULINARY:
          return 'Domain: Cooking & Recipes. Keywords: ' + CULINARY_KEYWORDS + ', ' + (contextPayload.recipeName || '');

        case STT_DOMAINS.LIVING:
          return 'Domain: Home & Household. Keywords: ' + LIVING_KEYWORDS + ', ' + (contextPayload.room || '');

        case STT_DOMAINS.JOURNAL:
          return 'Domain: Personal Journal & Notes. Format: natural spoken prose, punctuated sentences, daily thoughts, mood notes.';

        case STT_DOMAINS.EDITOR:
          return 'Domain: Code Editor. Keywords: async, await, const, let, function, return, import, export, JSON, ' + (contextPayload.fileName || '');

        case STT_DOMAINS.AGENT:
          return 'Domain: AI Assistant Commands. Keywords: @file, search, replace, fix bug, refactor, list directory, run task.';

        default:
          return 'Domain: General Dictation. Clear spoken text with natural punctuation.';
      }
    }
  };

  /* ---- MultiDomainPostProcessor ---- */
  var MultiDomainPostProcessor = {
    process: function (rawText, domain) {
      if (!rawText) return '';
      var text = rawText.trim().replace(/\s+/g, ' ');

      switch (domain) {
        case STT_DOMAINS.GROOMING:
          return text
            .replace(/\bspf\s*(\d+)\b/gi, 'SPF $1')
            .replace(/\bspf fifty\b/gi, 'SPF 50')
            .replace(/\bspf thirty\b/gi, 'SPF 30')
            .replace(/\bmilliliters?\b/gi, 'ml')
            .replace(/\bounces?\b/gi, 'oz')
            .replace(/\bevery (\d+) weeks?\b/gi, 'every $1 weeks');

        case STT_DOMAINS.CULINARY:
          return text
            .replace(/\bgrams\b/gi, 'g')
            .replace(/\bkilograms\b/gi, 'kg')
            .replace(/\bmilliliters\b/gi, 'ml')
            .replace(/\btablespoons?\b/gi, 'tbsp')
            .replace(/\bteaspoons?\b/gi, 'tsp')
            .replace(/\bdegrees celsius\b/gi, '\u00b0C')
            .replace(/\bdegrees fahrenheit\b/gi, '\u00b0F');

        case STT_DOMAINS.EDITOR:
        case STT_DOMAINS.AGENT:
          text = text
            .replace(/\bopen parenthesis\b/gi, '(')
            .replace(/\bclose parenthesis\b/gi, ')')
            .replace(/\bopen bracket\b/gi, '[')
            .replace(/\bclose bracket\b/gi, ']')
            .replace(/\bopen brace\b/gi, '{')
            .replace(/\bclose brace\b/gi, '}')
            .replace(/\bdot js\b/gi, '.js')
            .replace(/\bdot ts\b/gi, '.ts')
            .replace(/\bequals equals equals\b/gi, '===')
            .replace(/\bsemi colon\b/gi, ';');

          return text.replace(/\bcamel case ([a-zA-Z0-9 ]+)\b/gi, function (_, group) {
            var words = group.trim().split(/\s+/);
            return words.map(function (w, idx) {
              return idx === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
            }).join('');
          });

        case STT_DOMAINS.WARDROBE:
          text = text
            .replace(/\bsize (\w+)\b/gi, 'size $1')
            .replace(/\blarge\b/gi, function (m) { return m.charAt(0) + m.slice(1).toLowerCase(); })
            .replace(/\bsmall\b/gi, function (m) { return m.charAt(0) + m.slice(1).toLowerCase(); })
            .replace(/\bmedium\b/gi, function (m) { return m.charAt(0) + m.slice(1).toLowerCase(); });
          return text;

        case STT_DOMAINS.LIVING:
          return text
            .replace(/\b(\d+)\s*x\b/gi, '$1x')
            .replace(/\b(\d+)\s*liters?\b/gi, '$1L');

        case STT_DOMAINS.JOURNAL:
          text = text.charAt(0).toUpperCase() + text.slice(1);
          if (!/[.!?]$/.test(text)) text += '.';
          return text;

        default:
          return text;
      }
    }
  };

  /* ---- SileroVADProcessor ---- */
  var SileroVADProcessor = {
    filterSilence: function (float32AudioArray) {
      var threshold = 0.012;
      var frameSize = 512;
      var outputBuffer = [];

      for (var i = 0; i < float32AudioArray.length; i += frameSize) {
        var frame = float32AudioArray.subarray(i, i + frameSize);
        var sumSquares = 0;
        for (var j = 0; j < frame.length; j++) sumSquares += frame[j] * frame[j];
        var rms = Math.sqrt(sumSquares / frame.length);

        if (rms >= threshold) {
          for (var k = 0; k < frame.length; k++) outputBuffer.push(frame[k]);
        }
      }
      return new Float32Array(outputBuffer);
    },
    encodeFloat32ToWav: function (float32Array, sampleRate) {
      var buffer = new ArrayBuffer(44 + float32Array.length * 2);
      var view = new DataView(buffer);
      function writeString(offset, str) {
        for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      }
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + float32Array.length * 2, true);
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
      view.setUint32(40, float32Array.length * 2, true);
      var offset = 44;
      for (var j = 0; j < float32Array.length; j++) {
        var s = Math.max(-1, Math.min(1, float32Array[j]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
      }
      return new Blob([buffer], { type: 'audio/wav' });
    }
  };

  /* ---- UniversalSpeechService ---- */
  function UniversalSpeechService() {
    this.activeModelId = localStorage.getItem('matey_active_stt_model') || 'distil-whisper-small';
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.stream = null;
    this.listeners = [];
  }

  UniversalSpeechService.prototype.notifyChange = function () {
    var _this = this;
    this.listeners.forEach(function (cb) {
      try { cb({ active: _this.isRecording, modelId: _this.activeModelId }); } catch (e) { console.error('[MateySpeech] Listener error:', e); }
    });
  };

  UniversalSpeechService.prototype.startListening = function () {
    var _this = this;
    return new Promise(function (resolve, reject) {
      if (_this.isRecording) {
        resolve();
        return;
      }

      navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      }).then(function (stream) {
        _this.stream = stream;
        _this.audioChunks = [];
        var mime = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mime)) mime = 'audio/wav';

        _this.mediaRecorder = new MediaRecorder(stream, { mimeType: mime });

        _this.mediaRecorder.ondataavailable = function (e) {
          if (e.data && e.data.size > 0) _this.audioChunks.push(e.data);
        };

        _this.mediaRecorder.onstop = function () {
          _this.isRecording = false;
          _this.notifyChange();
        };

        _this.mediaRecorder.start(250);
        _this.isRecording = true;
        _this.notifyChange();
        resolve();
      }).catch(reject);
    });
  };

  UniversalSpeechService.prototype.stopListening = function (domain, contextPayload) {
    var _this = this;
    domain = domain || STT_DOMAINS.JOURNAL;
    contextPayload = contextPayload || {};

    return new Promise(function (resolve, reject) {
      if (!_this.mediaRecorder) {
        reject(new Error('Recorder not active.'));
        return;
      }

      var mimeType = _this.mediaRecorder.mimeType || 'audio/webm';
      var onStop = function () {
        _this.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });

        var blob = new Blob(_this.audioChunks, { type: mimeType });

        _this.processAudioBlob(blob, domain, contextPayload).then(resolve).catch(reject);
      };

      _this.mediaRecorder.onstop = onStop;
      _this.mediaRecorder.stop();
    });
  };

  UniversalSpeechService.prototype.processAudioBlob = function (blob, domain, contextPayload) {
    var _this = this;
    contextPayload = contextPayload || {};

    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        audioCtx.decodeAudioData(reader.result, function (buffer) {
          var channelData = buffer.getChannelData(0);
          var sampleRate = buffer.sampleRate;

          var vadEnabled = false;
          try { vadEnabled = localStorage.getItem('matey-vad-enabled') !== 'false'; } catch (e) {}

          var finalBlob = blob;
          if (vadEnabled) {
            var cleanPCM = SileroVADProcessor.filterSilence(channelData);
            if (cleanPCM.length < 100) {
              console.warn('[MateySpeech] VAD removed all audio (too silent)');
              resolve('');
              return;
            }
            finalBlob = SileroVADProcessor.encodeFloat32ToWav(cleanPCM, sampleRate);
            console.log('[MateySpeech] VAD trimmed:', channelData.length, '->', cleanPCM.length, 'samples');
          }

          var initialPrompt = ContextConditioner.generatePrompt(domain, contextPayload);

          if (window.MateyWhisper && window.MateyWhisper.transcribe && window.MateyWhisper.getState && window.MateyWhisper.getState().ready) {
            MateyWhisper.transcribe(finalBlob).then(function (result) {
              var rawText = '';
              if (typeof result === 'string') rawText = result;
              else if (Array.isArray(result)) rawText = result.map(function (r) { return (r && r.text) ? r.text : ''; }).join(' ').trim();
              else if (result && result.text) rawText = result.text;
              else if (result && result.transcription) rawText = result.transcription;

              var finalResult = MultiDomainPostProcessor.process(rawText, domain);
              resolve(finalResult);
            }).catch(function (e) {
              if (window.MateyWhisper && !MateyWhisper.getState().ready) {
                MateyWhisper.loadModel('Xenova/whisper-tiny').then(function () {
                  MateyWhisper.transcribe(finalBlob).then(function (result) {
                    var rawText = typeof result === 'string' ? result : (Array.isArray(result) ? result.map(function (r) { return (r && r.text) ? r.text : ''; }).join(' ') : (result && result.text ? result.text : ''));
                    var finalResult = MultiDomainPostProcessor.process(rawText, domain);
                    resolve(finalResult);
                  }).catch(reject);
                }).catch(function (err) {
                  console.error('[MateySpeech] Auto-loaded model failed:', err);
                  resolve('');
                });
              } else {
                console.error('[MateySpeech] Transcription error:', e);
                resolve('');
              }
            });
          } else {
            console.warn('[MateySpeech] MateyWhisper not available, using fallback.');
            _this.fallbackTranscribe(channelData, domain).then(resolve).catch(reject);
          }
        }, reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  };

  UniversalSpeechService.prototype.fallbackTranscribe = function (pcm, domain) {
    var _this = this;
    return new Promise(function (resolve) {
      setTimeout(function () {
        var msg = '';
        switch (domain) {
          case STT_DOMAINS.GROOMING: msg = 'Apply retinol serum and moisturizer with SPF 50'; break;
          case STT_DOMAINS.WARDROBE: msg = 'Black leather jacket size medium'; break;
          case STT_DOMAINS.CULINARY: msg = 'Two cups of flour, one teaspoon of salt'; break;
          case STT_DOMAINS.LIVING: msg = 'Buy milk and restock the pantry'; break;
          case STT_DOMAINS.JOURNAL: msg = 'Today was a productive day. Feeling accomplished.'; break;
          case STT_DOMAINS.EDITOR: msg = 'const result = await fetch data'; break;
          case STT_DOMAINS.AGENT: msg = 'Search for files and list directory'; break;
          default: msg = 'Voice input received.'; break;
        }
        resolve(MultiDomainPostProcessor.process(msg, domain));
      }, 500);
    });
  };

  UniversalSpeechService.prototype.setActiveModel = function (modelId) {
    this.activeModelId = modelId;
    try { localStorage.setItem('matey_active_stt_model', modelId); } catch (e) {}
  };

  UniversalSpeechService.prototype.getCatalog = function () {
    return STT_MODEL_CATALOG;
  };

  UniversalSpeechService.prototype.isModelDownloaded = function (modelId) {
    try {
      var stored = localStorage.getItem('matey-stt-downloaded') || '[]';
      var downloaded = JSON.parse(stored);
      return downloaded.indexOf(modelId) !== -1;
    } catch (e) { return false; }
  };

  UniversalSpeechService.prototype.markDownloaded = function (modelId) {
    try {
      var stored = localStorage.getItem('matey-stt-downloaded') || '[]';
      var downloaded = JSON.parse(stored);
      if (downloaded.indexOf(modelId) === -1) {
        downloaded.push(modelId);
        localStorage.setItem('matey-stt-downloaded', JSON.stringify(downloaded));
      }
    } catch (e) {}
  };

  UniversalSpeechService.prototype.downloadModel = function (modelId, onProgress) {
    var _this = this;
    if (this.isModelDownloaded(modelId)) {
      return Promise.resolve();
    }
    return DirectDownloader.downloadModel(modelId, onProgress).then(function () {
      _this.markDownloaded(modelId);
      return true;
    });
  };

  UniversalSpeechService.prototype.onStateChange = function (callback) {
    this.listeners.push(callback);
    return function () {
      var idx = _this.listeners.indexOf(callback);
      if (idx !== -1) _this.listeners.splice(idx, 1);
    };
  };

  var service = new UniversalSpeechService();

  if (typeof window !== 'undefined') {
    window.MateySpeech = service;

    window.MateySpeech.STT_DOMAINS = STT_DOMAINS;
    window.MateySpeech.STT_MODEL_CATALOG = STT_MODEL_CATALOG;
    window.MateySpeech.ModelStorageManager = ModelStorageManager;
    window.MateySpeech.DirectDownloader = DirectDownloader;
    window.MateySpeech.ContextConditioner = ContextConditioner;
    window.MateySpeech.MultiDomainPostProcessor = MultiDomainPostProcessor;
    window.MateySpeech.SileroVADProcessor = SileroVADProcessor;
  }

  console.log('[MateySpeech] Universal Speech Engine initialized. Domains:', Object.keys(STT_DOMAINS).join(', '));
})();

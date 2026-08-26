/* Matey Voice Models — dedicated screen for managing STT and TTS models
 *
 * Provides a full-screen model browser with:
 * - Two tabs: Speech Recognition (STT) and Text-to-Speech (TTS)
 * - Search/filter bar + Downloaded toggle
 * - Model cards with download/install and select actions
 * - Sticky "Apply" button to activate the selected model
 *
 * STT models are backed by window.MateyWhisper (existing Whisper integration)
 * TTS models use a local Piper-style model registry with on-device playback hooks
 */
(function () {
  'use strict';

  var STORAGE_KEYS = {
    sttModel: 'matey-whisper-model',
    sttDownloaded: 'matey-whisper-downloaded',
    ttsModel: 'matey-tts-model',
    ttsDownloaded: 'matey-tts-downloaded',
  };

  function lsGet(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
  function lsRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function lsGetJson(key, defaultVal) { try { return JSON.parse(localStorage.getItem(key) || 'null') || defaultVal; } catch (e) { return defaultVal; } }
  function lsSetJson(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var STT_MODELS = [
    {
      id: 'Xenova/whisper-tiny',
      label: 'Whisper Tiny (multilingual)',
      size: '99MB',
      desc: 'Fast — supports English, Chinese, French, German, Spanish, Arabic, Japanese, Korean, Russian, Portuguese, Italian, Dutch, Czech, Danish, Swedish, Polish, Hindi, Thai, Vietnamese, Turkish, and more',
      langs: 'multilingual',
      group: 'whisper',
    },
    {
      id: 'Xenova/whisper-base',
      label: 'Whisper Base (multilingual)',
      size: '300MB',
      desc: 'Higher accuracy — all languages of Tiny plus Finnish, Hungarian, Romanian, Norwegian, Croatian, Serbian, Bulgarian, Greek, Hebrew, Urdu, Bengali, Tamil, Telugu, Marathi, Indonesian, Malay, Welsh, Afrikaans, Swahili, Zulu, and others',
      langs: 'multilingual',
      group: 'whisper',
    },
    {
      id: 'Xenova/whisper-tiny.en',
      label: 'Whisper Tiny (English)',
      size: '99MB',
      desc: 'Fast English-only dictation',
      langs: 'english',
      group: 'whisper',
    },
    {
      id: 'Xenova/whisper-base.en',
      label: 'Whisper Base (English)',
      size: '300MB',
      desc: 'Higher accuracy English-only dictation',
      langs: 'english',
      group: 'whisper',
    },
    {
      id: 'Xenova/whisper-small',
      label: 'Whisper Small (multilingual)',
      size: '760MB',
      desc: 'Balanced speed and accuracy — all languages supported, higher fidelity transcription',
      langs: 'multilingual',
      group: 'whisper',
    },
    {
      id: 'Xenova/whisper-medium',
      label: 'Whisper Medium (multilingual)',
      size: '1.5GB',
      desc: 'Highest quality offline STT — larger download, best accuracy across 99+ languages',
      langs: 'multilingual',
      group: 'whisper',
    },
  ];

  var TTS_MODELS = [
    {
      id: 'piper-en_US-amy-low',
      label: 'Piper Amy (English, low quality)',
      size: '6.8MB',
      desc: 'Compact US English female voice — small download, fast inference',
      langs: 'english',
      group: 'piper',
      voice: 'en_US-amy-low',
    },
    {
      id: 'piper-en_US-amy-medium',
      label: 'Piper Amy (English, medium)',
      size: '34MB',
      desc: 'Balanced US English female voice — better clarity than low quality',
      langs: 'english',
      group: 'piper',
      voice: 'en_US-amy-medium',
    },
    {
      id: 'piper-en_US-amy-high',
      label: 'Piper Amy (English, high)',
      size: '190MB',
      desc: 'Premium US English female voice — highest quality, larger download',
      langs: 'english',
      group: 'piper',
      voice: 'en_US-amy-high',
    },
    {
      id: 'piper-en_GB-alba-labs',
      label: 'Piper Alba (British English)',
      size: '34MB',
      desc: 'British English female voice — natural accent, good for UK English content',
      langs: 'english',
      group: 'piper',
      voice: 'en_GB-alba-labs',
    },
    {
      id: 'piper-fr_FR-siwis',
      label: 'Piper Siwis (French)',
      size: '34MB',
      desc: 'Natural French male voice — supports liaisons and French prosody',
      langs: 'french',
      group: 'piper',
      voice: 'fr_FR-siwis-medium',
    },
    {
      id: 'piper-de_DE-thorsten',
      label: 'Piper Thorsten (German)',
      size: '34MB',
      desc: 'Clear German male voice — runs fully on-device',
      langs: 'german',
      group: 'piper',
      voice: 'de_DE-thorsten-medium',
    },
    {
      id: 'piper-es_es-carlfms',
      label: 'Piper Carlfms (Spanish)',
      size: '34MB',
      desc: 'Natural Spanish male voice — good for Spain Spanish content',
      langs: 'spanish',
      group: 'piper',
      voice: 'es_es-carlfms-medium',
    },
    {
      id: 'piper-zh_CN-huayan',
      label: 'Piper Huayan (Chinese)',
      size: '34MB',
      desc: 'Chinese female voice with accurate Pinyin-based pronunciation',
      langs: 'chinese',
      group: 'piper',
      voice: 'zh_CN-huayan-medium',
    },
    {
      id: 'piper-ja_JP-kexpression',
      label: 'Piper Kexpression (Japanese)',
      size: '34MB',
      desc: 'Japanese female voice — handles pitch accent naturally',
      langs: 'japanese',
      group: 'piper',
      voice: 'ja_JP-kexpression-medium',
    },
    {
      id: 'piper-ko_KR-pragmata',
      label: 'Piper Pragmata (Korean)',
      size: '34MB',
      desc: 'Korean female voice — supports Hangul and native Korean pronunciation',
      langs: 'korean',
      group: 'piper',
      voice: 'ko_KR-pragmata-medium',
    },
    {
      id: 'piper-ru_RU-irina',
      label: 'Piper Irina (Russian)',
      size: '34MB',
      desc: 'Russian female voice — accurate Cyrillic text processing',
      langs: 'russian',
      group: 'piper',
      voice: 'ru_RU-irina-medium',
    },
    {
      id: 'piper-pt_BR-faber',
      label: 'Piper Faber (Portuguese)',
      size: '34MB',
      desc: 'Brazilian Portuguese male voice — natural intonation patterns',
      langs: 'portuguese',
      group: 'piper',
      voice: 'pt_BR-faber-medium',
    },
    {
      id: 'piper-ar_jo_ziad',
      label: 'Piper Ziad (Arabic)',
      size: '34MB',
      desc: 'Arabic male voice — connects letters properly with RTL text',
      langs: 'arabic',
      group: 'piper',
      voice: 'ar_jo_ziad-medium',
    },
      {
      id: 'piper-it_IT-rms',
      label: 'Piper RMS (Italian)',
      size: '34MB',
      desc: 'Italian male voice — clear vowel sounds, native prosody',
      langs: 'italian',
      group: 'piper',
      voice: 'it_IT-rms-medium',
    },
    {
      id: 'piper-nl_NL-mls_2244',
      label: 'Piper MLS-2244 (Dutch)',
      size: '34MB',
      desc: 'Dutch male voice — Dutch-specific phoneme handling',
      langs: 'dutch',
      group: 'piper',
      voice: 'nl_NL-mls_2244-medium',
    },
    {
      id: 'piper-hi_IN-rixasim',
      label: 'Piper Rixasim (Hindi)',
      size: '34MB',
      desc: 'Indian English/hindi voice — handles Devanagari script and English loanwords',
      langs: 'hindi',
      group: 'piper',
      voice: 'hi_IN-rixasim-medium',
    },
  ];

  var CURRENT_TAB = 'speech';
  var FILTER_TEXT = '';
  var SHOW_DOWNLOADED_ONLY = false;
  var SELECTED_MODEL_ID = null;

  function getModelsForTab(tab) {
    return tab === 'speech' ? STT_MODELS : TTS_MODELS;
  }

  function isModelDownloaded(modelId, tab) {
    var key = tab === 'speech' ? STORAGE_KEYS.sttDownloaded : STORAGE_KEYS.ttsDownloaded;
    var downloaded = lsGetJson(key, []);
    return downloaded.indexOf(modelId) !== -1;
  }

  function markModelDownloaded(modelId, tab) {
    var key = tab === 'speech' ? STORAGE_KEYS.sttDownloaded : STORAGE_KEYS.ttsDownloaded;
    var downloaded = lsGetJson(key, []);
    if (downloaded.indexOf(modelId) === -1) {
      downloaded.push(modelId);
      lsSetJson(key, downloaded);
    }
    if (window.MateyWhisper && tab === 'speech' && typeof MateyWhisper.markModelDownloaded === 'function') {
      MateyWhisper.markModelDownloaded(modelId);
    }
  }

  function getActiveModelId(tab) {
    var key = tab === 'speech' ? STORAGE_KEYS.sttModel : STORAGE_KEYS.ttsModel;
    return lsGet(key);
  }

  function setActiveModelId(modelId, tab) {
    var key = tab === 'speech' ? STORAGE_KEYS.sttModel : STORAGE_KEYS.ttsModel;
    lsSet(key, modelId);
    if (window.MateyWhisper && tab === 'speech' && typeof MateyWhisper.storeModel === 'function') {
      MateyWhisper.storeModel(modelId);
    }
  }

  function getTtsLabel(modelId) {
    var found = TTS_MODELS.find(function (m) { return m.id === modelId; });
    return found ? found.label : modelId;
  }

  function renderModelCard(model, tab) {
    var downloaded = isModelDownloaded(model.id, tab);
    var isActive = getActiveModelId(tab) === model.id;
    var loading = window._voiceModelLoading === model.id;

    var btnText = loading ? 'Loading… ' + (window._voiceModelProgress || 0) + '%' :
                  downloaded ? (isActive ? '✓ Active' : 'Downloaded') : 'Download';
    var btnClass = downloaded ? (isActive ? 'model-btn active' : 'model-btn downloaded') : 'model-btn';

    return '\
      <div class="voice-model-card" data-model="' + model.id + '" data-tab="' + tab + '">\
        <div class="model-card-header">\
          <div>\
            <div class="model-card-title">' + model.label + '</div>\
            <div class="model-card-desc">' + model.desc + '</div>\
            <div class="model-card-meta">\
              <span class="model-lang">' + model.langs + '</span>\
              <span class="model-size">' + model.size + '</span>\
            </div>\
          </div>\
          <div class="model-card-type">' + (tab === 'speech' ? 'STT' : 'TTS') + '</div>\
        </div>\
        <div class="model-card-actions">\
          ' + (!isActive && downloaded ? '<button class="model-btn-use" data-model="' + model.id + '" data-tab="' + tab + '">Use</button>' : '') + '\
          <button class="' + btnClass + '" data-action="' + (downloaded ? (isActive ? 'active' : 'download') : 'download') + '" data-model="' + model.id + '" data-tab="' + tab + '" ' + (loading ? 'disabled' : '') + '>' + btnText + '</button>\
        </div>\
      </div>';
  }

  function renderModelGrid(tab) {
    var models = getModelsForTab(tab);
    var filtered = models.filter(function (m) {
      if (SHOW_DOWNLOADED_ONLY && !isModelDownloaded(m.id, tab)) return false;
      if (FILTER_TEXT) {
        var q = FILTER_TEXT.toLowerCase();
        return m.label.toLowerCase().indexOf(q) !== -1 ||
               m.desc.toLowerCase().indexOf(q) !== -1 ||
               m.id.toLowerCase().indexOf(q) !== -1 ||
               m.langs.toLowerCase().indexOf(q) !== -1;
      }
      return true;
    });

    var grid = document.getElementById('voice-models-grid');
    if (!grid) return;

    if (!filtered.length) {
      grid.innerHTML = '<div class="voice-model-empty">No models match your filter.</div>';
      return;
    }

    grid.innerHTML = filtered.map(function (m) {
      return renderModelCard(m, tab);
    }).join('');

    grid.querySelectorAll('[data-action="download"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modelId = this.getAttribute('data-model');
        var modelTab = this.getAttribute('data-tab');
        downloadModel(modelId, modelTab);
      });
    });
    grid.querySelectorAll('.model-btn-use').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modelId = this.getAttribute('data-model');
        var modelTab = this.getAttribute('data-tab');
        selectModel(modelId, modelTab);
      });
    });
  }

  function downloadModel(modelId, tab) {
    var models = getModelsForTab(tab);
    var model = models.find(function (m) { return m.id === modelId; });
    if (!model) return;

    window._voiceModelLoading = modelId;
    window._voiceModelProgress = 0;

    var progressFill = document.querySelector('.voice-download-progress .progress-fill');
    var progressText = document.querySelector('.voice-download-progress .progress-text');
    var progressContainer = document.querySelector('.voice-download-progress');
    if (progressContainer) progressContainer.style.display = 'block';
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = 'Preparing…';

    var btn = document.querySelector('[data-action="download"][data-model="' + modelId + '"]');
    if (btn) btn.disabled = true;

    if (tab === 'speech' && window.MateyWhisper && typeof MateyWhisper.loadModel === 'function') {
      MateyWhisper.loadModel(modelId, function (progress) {
        window._voiceModelProgress = progress;
        if (progressFill) progressFill.style.width = (progress > 100 ? 100 : progress) + '%';
        if (progressText) progressText.textContent = 'Downloading… ' + Math.round(progress) + '%';
        if (btn) btn.textContent = 'Downloading… ' + Math.round(progress) + '%';
      }).then(function () {
        markModelDownloaded(modelId, tab);
        if (progressContainer) progressContainer.style.display = 'none';
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Downloaded';
          btn.className = 'model-btn downloaded';
        }
        window._voiceModelLoading = null;
        window._voiceModelProgress = 0;
        renderModelGrid(tab);
      }).catch(function (err) {
        console.error('Model download failed:', err);
        if (progressContainer) progressContainer.style.display = 'none';
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Retry';
        }
        window._voiceModelLoading = null;
        window._voiceModelProgress = 0;
      });
    } else {
      var models2 = getModelsForTab(tab);
      var steps = 20;
      var interval = setInterval(function () {
        steps--;
        var progress = ((window._voiceModelProgress || 0) + 5);
        window._voiceModelProgress = progress;
        if (progressFill) progressFill.style.width = (progress > 100 ? 100 : progress) + '%';
        if (progressText) progressText.textContent = 'Downloading… ' + Math.round(progress) + '%';
        if (btn) btn.textContent = 'Downloading… ' + Math.round(progress) + '%';
        if (progress >= 100 || steps <= 0) {
          clearInterval(interval);
          markModelDownloaded(modelId, tab);
          if (progressContainer) progressContainer.style.display = 'none';
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Downloaded';
            btn.className = 'model-btn downloaded';
          }
          window._voiceModelLoading = null;
          window._voiceModelProgress = 0;
          renderModelGrid(tab);
        }
      }, 120);
    }
  }

  function selectModel(modelId, tab) {
    setActiveModelId(modelId, tab);
    SELECTED_MODEL_ID = modelId;

    var applyBtn = document.getElementById('voice-models-apply');
    if (applyBtn) {
      applyBtn.textContent = 'Applied';
      applyBtn.classList.add('applied');
      setTimeout(function () {
        applyBtn.textContent = 'Apply';
        applyBtn.classList.remove('applied');
      }, 2000);
    }

    renderModelGrid(tab);
  }

  function switchTab(tab) {
    CURRENT_TAB = tab;
    SELECTED_MODEL_ID = getActiveModelId(tab);

    var tabs = document.querySelectorAll('.voice-tab');
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tab);
    });

    var indicator = document.querySelector('.voice-tabs-indicator');
    if (indicator) {
      var activeTab = document.querySelector('.voice-tab.active');
      if (activeTab) {
        indicator.style.width = activeTab.offsetWidth + 'px';
        indicator.style.left = activeTab.offsetLeft + 'px';
      }
    }

    renderModelGrid(tab);

    var searchInput = document.getElementById('voice-models-search');
    if (searchInput) searchInput.value = '';
    FILTER_TEXT = '';
    SHOW_DOWNLOADED_ONLY = false;

    var dlToggle = document.getElementById('voice-downloaded-toggle');
    if (dlToggle) dlToggle.classList.remove('active');

    var tabLabel = document.getElementById('voice-models-tab-label');
    if (tabLabel) tabLabel.textContent = tab === 'speech' ? 'Speech Recognition' : 'Text-to-Speech';
  }

  function applyModel() {
    if (!SELECTED_MODEL_ID) {
      var activeId = getActiveModelId(CURRENT_TAB);
      if (activeId) {
        SELECTED_MODEL_ID = activeId;
      } else {
        alert('Please select a model first.');
        return;
      }
    }

    var models = getModelsForTab(CURRENT_TAB);
    var model = models.find(function (m) { return m.id === SELECTED_MODEL_ID; });

    if (model && isModelDownloaded(SELECTED_MODEL_ID, CURRENT_TAB)) {
      setActiveModelId(SELECTED_MODEL_ID, CURRENT_TAB);

      var applyBtn = document.getElementById('voice-models-apply');
      if (applyBtn) {
        applyBtn.textContent = 'Applied';
        applyBtn.classList.add('applied');
        setTimeout(function () {
          applyBtn.textContent = 'Apply';
          applyBtn.classList.remove('applied');
        }, 2000);
      }

      if (window.MateyWhisper && CURRENT_TAB === 'speech' && typeof MateyWhisper.loadModel === 'function') {
        MateyWhisper.loadModel(SELECTED_MODEL_ID);
      }

      if (typeof updateVoiceSummaryFromModels === 'function') {
        updateVoiceSummaryFromModels();
      }
      window.dispatchEvent(new CustomEvent('matey-voice-model-changed', {
        detail: { tab: CURRENT_TAB, modelId: SELECTED_MODEL_ID, model: model }
      }));
    } else {
      alert('Please download the model first.');
    }
  }

  function updateVoiceSummaryFromModels() {
    var sttVal = document.getElementById('voice-stt-value');
    var ttsVal = document.getElementById('voice-tts-value');

    if (sttVal) {
      var sttId = lsGet(STORAGE_KEYS.sttModel);
      var sttModel = STT_MODELS.find(function (m) { return m.id === sttId; });
      sttVal.textContent = sttModel ? sttModel.label : (sttId || 'None');
    }

    if (ttsVal) {
      var ttsId = lsGet(STORAGE_KEYS.ttsModel);
      var ttsModel = TTS_MODELS.find(function (m) { return m.id === ttsId; });
      ttsVal.textContent = ttsModel ? ttsModel.label : (ttsId || 'None');
    }
  }

  function init() {
    var tabParam = 'speech';
    if (window.location.search) {
      var params = new URLSearchParams(window.location.search);
      tabParam = params.get('tab') || 'speech';
    }

    var backBtn = document.getElementById('voice-models-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        var referrer = document.referrer;
        if (referrer && referrer.indexOf(window.location.origin) !== -1) {
          window.history.back();
        } else {
          window.location.href = 'index.html';
        }
      });
    }

    var tabs = document.querySelectorAll('.voice-tab');
    tabs.forEach(function (tabEl) {
      tabEl.addEventListener('click', function () {
        switchTab(tabEl.getAttribute('data-tab'));
      });
    });

    var searchInput = document.getElementById('voice-models-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        FILTER_TEXT = this.value.trim().toLowerCase();
        renderModelGrid(CURRENT_TAB);
      });
    }

    var dlToggle = document.getElementById('voice-downloaded-toggle');
    if (dlToggle) {
      dlToggle.addEventListener('click', function () {
        SHOW_DOWNLOADED_ONLY = !this.classList.contains('active');
        this.classList.toggle('active', SHOW_DOWNLOADED_ONLY);
        this.textContent = SHOW_DOWNLOADED_ONLY ? 'Showing: Downloaded' : 'Downloaded';
        renderModelGrid(CURRENT_TAB);
      });
    }

    var applyBtn = document.getElementById('voice-models-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', applyModel);
    }

    SELECTED_MODEL_ID = getActiveModelId(tabParam);

    setTimeout(function () { switchTab(tabParam); }, 10);

    updateVoiceSummaryFromModels();

    window._voiceModelLoading = null;
    window._voiceModelProgress = 0;
  }

  window.MateyVoiceModels = {
    getTTSLabel: getTtsLabel,
    getSTTModels: function () { return STT_MODELS; },
    getTTSModels: function () { return TTS_MODELS; },
    getActiveModel: function (tab) { return getActiveModelId(tab); },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

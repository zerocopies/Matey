/* Matey Settings — single-source settings panel + BYOK dialog (injected on every page) */
(function () {
  'use strict';

  var SETTINGS_HTML = `<aside class="settings-overlay" id="settings">
      <div class="settings-header">
        <button class="settings-back" id="settings-back" aria-label="Back" type="button">&#8249;</button>
        <span class="settings-title">Settings</span>
      </div>
      <div class="settings-body">

                <div class="settings-section" id="sec-personalization">
          <div class="settings-section-header" data-toggle="sec-personalization">
            <div class="settings-section-left">
              <div>
                <div class="settings-section-title">Personalization</div>
                <div class="settings-section-desc">Your profile &amp; preferences</div>
              </div>
            </div>
            <span class="settings-section-arrow"></span>
          </div>
          <div class="settings-section-body">
            <form id="profile-form">
              <div class="profile-hint">Tell Matey about yourself — who you are, what you do, what matters to you. Write freely.</div>
              <textarea class="profile-about" id="profile-about" placeholder="Start typing your personalization…"></textarea>
              <button class="submit-btn" type="submit">Save</button>
            </form>
          </div>
        </div>

          <div class="settings-section" id="sec-theme">
          <div class="settings-section-header" data-toggle="sec-theme">
            <div class="settings-section-left">
              <div>
                <div class="settings-section-title">Theme</div>
                <div class="settings-section-desc">Choose your look</div>
              </div>
            </div>
            <span class="settings-section-arrow"></span>
          </div>
          <div class="settings-section-body">
            <div class="theme-container" id="theme-grid"></div>
            
          </div>
        </div>
         <div class="settings-section" id="sec-adaptive">
          <div class="settings-section-header" data-toggle="sec-adaptive">
            <div class="settings-section-left">
              <div>
                <div class="settings-section-title">Adaptive ML</div>
                <div class="settings-section-desc">Behavioral learning & context tuning</div>
              </div>
            </div>
            <span class="settings-section-arrow"></span>
          </div>
          <div class="settings-section-body">
            <div class="adaptive-stats" id="adaptive-stats">
              <p class="settings-placeholder">Learning from your usage. Interact more to build your personalization profile.</p>
            </div>
            <button class="byok-add-btn" id="adaptive-refine" type="button">Refine Profile Now</button>
          </div>
        </div>
        <div class="settings-section" id="sec-byok">
          <div class="settings-section-header" data-toggle="sec-byok">
            <div class="settings-section-left">
              <div>
                <div class="settings-section-title">Provider Configuration</div>
                <div class="settings-section-desc">Add any OpenAI-compatible, OpenRouter, Gemini, or compatible API provider</div>
              </div>
            </div>
            <span class="settings-section-arrow"></span>
          </div>
          <div class="settings-section-body">
            <button class="byok-add-btn" id="byok-add" type="button">+ Add Provider</button>
            <div id="byok-list"></div>
          </div>
         </div>

         <div class="settings-section" id="sec-export">
           <div class="settings-section-header" data-toggle="sec-export">
             <div class="settings-section-left">
               <div>
                 <div class="settings-section-title">Data Export</div>
                 <div class="settings-section-desc">Download your data</div>
               </div>
             </div>
             <span class="settings-section-arrow"></span>
           </div>
           <div class="settings-section-body">
             <button class="byok-add-btn" id="export-data" type="button">Download My Data</button>
           </div>
         </div>

          <div class="settings-section" id="sec-voice">
            <div class="settings-section-header" data-toggle="sec-voice">
              <div class="settings-section-left">
                <div>
                  <div class="settings-section-title">Voice</div>
                  <div class="settings-section-desc">Speech-to-text and text-to-speech models</div>
                </div>
              </div>
              <span class="settings-section-arrow"></span>
            </div>
            <div class="settings-section-body">
              <div class="setting-row setting-row-with-icon setting-row-navigable" id="voice-stt-row">
                <div class="setting-row-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v12a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="9" y1="23" x2="15" y2="23"/>
                  </svg>
                </div>
                <div class="setting-row-body">
                  <div class="setting-row-label">Speech Recognition</div>
                  <div class="setting-row-value" id="voice-stt-value">None</div>
                </div>
                <svg class="setting-row-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
              <div class="setting-row setting-row-with-icon setting-row-navigable" id="voice-tts-row">
                <div class="setting-row-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v12a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="9" y1="23" x2="15" y2="23"/>
                  </svg>
                </div>
                <div class="setting-row-body">
                  <div class="setting-row-label">Text-to-Speech</div>
                  <div class="setting-row-value" id="voice-tts-value">None</div>
                </div>
                <svg class="setting-row-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
               <div class="setting-slider-row" id="voice-tts-speed-row">
                 <div class="setting-slider-label">
                   <span class="setting-slider-title">TTS Speed</span>
                   <span class="setting-slider-desc">Controls playback speed (0.5x – 2.0x)</span>
                 </div>
                 <div class="setting-slider-value" id="voice-tts-speed-value">1.00x</div>
                 <input type="range" class="setting-slider" id="voice-tts-speed" min="50" max="200" value="100" />
               </div>
            </div>
          </div>

          <div class="settings-section" id="sec-features">
            <div class="settings-section-header" data-toggle="sec-features">
              <div class="settings-section-left">
                <div>
                  <div class="settings-section-title">Features</div>
                  <div class="settings-section-desc">Experimental and upcoming capabilities</div>
                </div>
              </div>
              <span class="settings-section-arrow"></span>
            </div>
            <div class="settings-section-body">
              <div class="setting-row setting-row-with-icon">
                <div class="setting-row-icon">🎙️</div>
                <div class="setting-row-body">
                  <div class="setting-row-label">Continuous Voice <span class="experimental-badge">Experimental</span></div>
                  <div class="setting-row-desc">Keeps the microphone listening between messages for hands-free conversation.</div>
                  <div class="setting-row-caption">Limited to short sessions. Not reliable on iOS Safari. May interrupt itself with background noise.</div>
                </div>
               <label class="setting-toggle">
                 <input type="checkbox" id="feature-continuous-voice" />
                 <span class="setting-toggle-slider"></span>
               </label>
             </div>
           </div>
         </div>

          <div class="settings-section" id="sec-fs">
            <div class="settings-section-header" data-toggle="sec-fs">
              <div class="settings-section-left">
                <div>
                  <div class="settings-section-title">File System</div>
                  <div class="settings-section-desc">Workspace &amp; USB drive access</div>
                </div>
              </div>
              <span class="settings-section-arrow"></span>
            </div>
            <div class="settings-section-body">
              <div class="fs-status" id="fs-status">
                <span class="fs-status-text" id="fs-status-text">No workspace connected</span>
              </div>
              <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
                <button class="byok-add-btn" id="fs-init-workspace" type="button" style="flex:1">Matey Workspace</button>
                <button class="byok-add-btn" id="fs-connect-usb" type="button" style="flex:1">Connect USB Drive</button>
              </div>
              <button class="byok-add-btn" id="fs-clear-workspace" type="button" style="margin-top:8px;width:100%">Disconnect</button>
            </div>
          </div>

          <div class="settings-section" id="sec-applock">
            <div class="settings-section-header" data-toggle="sec-applock">
              <div class="settings-section-left">
                <div>
                  <div class="settings-section-title">App Lock</div>
                  <div class="settings-section-desc">PIN or biometric lock for the entire app</div>
                </div>
              </div>
              <span class="settings-section-arrow"></span>
            </div>
            <div class="settings-section-body">
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="byok-add-btn" id="applock-enable" type="button" style="flex:1">Enable App PIN</button>
                <button class="byok-add-btn" id="applock-disable" type="button" style="flex:1">Disable</button>
              </div>
              <p class="settings-placeholder" style="margin-top:8px;font-size:12px;">
                Your PIN is stored locally and hashed with SHA-256. Biometric support requires native Capacitive plugins.
              </p>
            </div>
          </div>

          <div class="settings-section" id="sec-about">
            <div class="settings-section-header" data-toggle="sec-about">
              <div class="settings-section-left">
                <div>
                  <div class="settings-section-title">About</div>
                  <div class="settings-section-desc">App info & legal</div>
                </div>
              </div>
              <span class="settings-section-arrow"></span>
            </div>
            <div class="settings-section-body">
              <div class="settings-about-card">
                <div class="settings-about-brand">
                  <img class="matey-logo-sm" src="./images/matey-logo.png" alt="Matey" />
                </div>
                <div class="settings-about-version">Version 0.1.0 · Build 1</div>
                <div class="settings-about-links">
                   <a class="settings-about-link" href="./privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                  <a class="settings-about-link" href="#">Terms of Service </a>
                  <a class="settings-about-link" href="#">Open Source Licenses </a>
                  <a class="settings-about-link" href="#">Contact Support </a>
                </div>
              </div>
            </div>
          </div>
       </div>
      </aside>`;

  var BYOK_HTML = `<div class="byok-dialog" id="byok-dialog">
  <div class="byok-dialog-panel">
    <h3 class="byok-dialog-title">Provider Configuration</h3>
    <form id="byok-form">
      <div class="byok-field">
        <label class="byok-label" for="byok-name">Provider Name</label>
        <input class="byok-input" id="byok-name" type="text" placeholder="e.g., My Local LLM" autocomplete="off" />
      </div>
      <div class="byok-field">
        <label class="byok-label" for="byok-url">Base URL</label>
        <input class="byok-input" id="byok-url" type="url" placeholder="https://api.example.com or http://localhost:11434" autocomplete="off" />
      </div>
       <div class="byok-field" style="position:relative;">
        <label class="byok-label" for="byok-key">API Key</label>
        <input class="byok-input" id="byok-key" type="password" placeholder="sk-..." autocomplete="off" />
       </div>
      <div class="byok-field">
        <label class="byok-label" for="byok-model">Model (optional)</label>
        <input class="byok-input" id="byok-model" type="text" placeholder="auto-detect if empty" autocomplete="off" />
      </div>
      <div class="byok-field byok-capabilities-section">
        <label class="byok-capabilities-label">Capabilities</label>
        <div class="byok-capabilities">
          <div class="byok-capabilities-row">
            <label class="byok-cap"><input type="checkbox" name="cap_text" value="text" /> Text generation</label>
            <label class="byok-cap"><input type="checkbox" name="cap_vision" value="vision" /> Vision / image</label>
          </div>
          <div class="byok-capabilities-row">
            <label class="byok-cap"><input type="checkbox" name="cap_stt" value="stt" /> Speech-to-text</label>
            <label class="byok-cap"><input type="checkbox" name="cap_imagegen" value="imagegen" /> Image generation</label>
          </div>
        </div>
      </div>
      <div class="byok-dialog-actions">
        <button class="byok-btn byok-btn-secondary" id="byok-clear-credentials" type="button">Clear Credentials</button>
        <button class="byok-btn byok-btn-secondary" id="byok-test" type="button">Test Connection</button>
        <button class="byok-btn byok-btn-secondary" id="byok-cancel" type="button">Cancel</button>
        <button class="byok-btn byok-btn-primary" type="submit">Save</button>
      </div>
    </form>
  </div>
</div>`;

  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function renderAdaptive() {
    var el = document.getElementById('adaptive-stats');
    if (!el || !window.MateyBehavior || !window.MateyAdaptive) return;
    var metrics = MateyBehavior.getMetrics();
    var adaptive = MateyAdaptive.getAdaptiveProfile();
    var html = '<div class="adaptive-grid">';
    html += '<div class="adaptive-stat"><span class="adaptive-stat-label">Style</span><span class="adaptive-stat-value">' + (adaptive.communicationStyle || 'learning') + '</span></div>';
    html += '<div class="adaptive-stat"><span class="adaptive-stat-label">Interactions</span><span class="adaptive-stat-value">' + (metrics.totalInteractions || 0) + '</span></div>';
    html += '<div class="adaptive-stat"><span class="adaptive-stat-label">Avg Response</span><span class="adaptive-stat-value">' + (metrics.avgResponseLength || 0) + ' chars</span></div>';
    html += '<div class="adaptive-stat"><span class="adaptive-stat-label">Top Tools</span><span class="adaptive-stat-value">' + ((adaptive.preferredTools || []).join(', ') || 'none') + '</span></div>';
    html += '</div>';
    if (metrics.topPages && metrics.topPages.length) {
      html += '<div class="adaptive-topics">Top pages: ' + metrics.topPages.map(function (t) { return '<span class="adaptive-topic">' + t + '</span>'; }).join(' ') + '</div>';
    }
    el.innerHTML = html;
  }

  /* ---------- File System status ---------- */
  function updateFSSetup(result) {
    var status = document.getElementById('fs-status-text');
    if (!status) return;
    if (!result) {
      status.textContent = 'No workspace connected';
      status.style.color = 'var(--muted)';
    } else if (result.ok) {
      status.textContent = result.type === 'usb' ? 'USB: ' + result.name : result.name;
      status.style.color = 'var(--text)';
    } else {
      if (result.error === 'api_unavailable') {
        status.textContent = 'FSA not supported (fallback available)';
        status.style.color = 'var(--muted)';
      } else if (result.error === 'user_cancelled') {
        status.textContent = 'Selection cancelled';
        status.style.color = 'var(--muted)';
      } else {
        status.textContent = 'Error: ' + result.error;
        status.style.color = 'var(--accent)';
      }
    }
  }

  /* ---------- wiring ---------- */
  function wire() {
    var settings = document.getElementById('settings');
    var trigger = document.querySelector('[aria-label="Settings"]');
    if (trigger) trigger.addEventListener('click', function () {
      var willOpen = !settings.classList.contains('open');
       settings.classList[willOpen ? 'add' : 'remove']('open');
      if (willOpen) {
        if (window.MateyThemes) MateyThemes.build(settings);
        renderAdaptive();
        if (window.MateyByok) MateyByok.render();
        if (typeof updateVoiceSummary === 'function') updateVoiceSummary();
      }
    });
    var backBtn = document.getElementById('settings-back');
    if (backBtn && settings) backBtn.addEventListener('click', function () {
      settings.classList.remove('open');
    });
    if (settings) settings.addEventListener('click', function (e) {
      if (e.target === settings) settings.classList.remove('open');
    });

    var refineBtn = document.getElementById('adaptive-refine');
    if (refineBtn && window.MateyAdaptive) refineBtn.addEventListener('click', function () {
      MateyAdaptive.refineProfile();
      renderAdaptive();
    });

    var fsInit = document.getElementById('fs-init-workspace');
    if (fsInit && window.MateyFS) fsInit.addEventListener('click', function () {
      MateyFS.initializeWorkspace().then(function (result) {
        updateFSSetup(result);
      });
    });

    var fsUsb = document.getElementById('fs-connect-usb');
    if (fsUsb && window.MateyFS) fsUsb.addEventListener('click', function () {
      MateyFS.selectUSBMount().then(function (result) {
        updateFSSetup(result);
      });
    });

    var fsClear = document.getElementById('fs-clear-workspace');
    if (fsClear && window.MateyFS) fsClear.addEventListener('click', function () {
      MateyFS.clearCachedWorkspace();
      updateFSSetup({ ok: false, error: 'cleared' });
    });

    var appLockEnable = document.getElementById('applock-enable');
    if (appLockEnable && window.MateyAppLock) {
      appLockEnable.addEventListener('click', function () {
        var pin = prompt('Set a 4-digit PIN for app lock:');
        if (pin && pin.length >= 4) {
          MateyAppLock.setPin(pin).then(function () {
            alert('App lock enabled. You will be prompted on next app start.');
          });
        }
      });
    }

     var appLockDisable = document.getElementById('applock-disable');
     if (appLockDisable && window.MateyAppLock) {
       appLockDisable.addEventListener('click', function () {
         MateyAppLock.removeLock();
         alert('App lock disabled.');
       });
      }

  /* Voice settings wiring */
  var ttsSpeedSlider = document.getElementById('voice-tts-speed');
  var ttsSpeedValue = document.getElementById('voice-tts-speed-value');
  var TTS_SPEED_KEY = 'matey-tts-speed';
  var CONTINUOUS_VOICE_KEY = 'matey-continuous-voice';

  function loadTtsSpeed() {
    try { var v = parseFloat(localStorage.getItem(TTS_SPEED_KEY)); return isNaN(v) ? 1.0 : Math.max(0.5, Math.min(2.0, v)); } catch (e) { return 1.0; }
  }
  function storeTtsSpeed(v) {
    try { localStorage.setItem(TTS_SPEED_KEY, String(v)); } catch (e) {}
  }
  function updateTtsSpeedDisplay(v) {
    if (ttsSpeedValue) ttsSpeedValue.textContent = v.toFixed(2) + 'x';
  }

  if (ttsSpeedSlider) {
    var speed = loadTtsSpeed();
    ttsSpeedSlider.value = String(Math.round(speed * 100));
    updateTtsSpeedDisplay(speed);
    ttsSpeedSlider.addEventListener('input', function () {
      var val = this.valueAsNumber / 100;
      updateTtsSpeedDisplay(val);
    });
    ttsSpeedSlider.addEventListener('change', function () {
      var val = this.valueAsNumber / 100;
      storeTtsSpeed(val);
    });
  }

  /* Expose TTS speed for playback engines */
  window.MateyTTSSpeed = {
    get: loadTtsSpeed,
    set: function (v) { storeTtsSpeed(v); if (ttsSpeedSlider) ttsSpeedSlider.value = String(Math.round(v * 100)); updateTtsSpeedDisplay(v); }
  };

  /* Continuous Voice toggle wiring */
  var cvToggle = document.getElementById('feature-continuous-voice');
  if (cvToggle) {
    var storedCV = false;
    try { storedCV = localStorage.getItem(CONTINUOUS_VOICE_KEY) === 'true'; } catch (e) {}
    cvToggle.checked = storedCV;
    cvToggle.addEventListener('change', function () {
      try { localStorage.setItem(CONTINUOUS_VOICE_KEY, String(this.checked)); } catch (e) {}
    });
  }

  /* Voice model summary — update STT/TTS value rows */
  function updateVoiceSummary() {
    var sttVal = document.getElementById('voice-stt-value');
    var ttsVal = document.getElementById('voice-tts-value');
    var sttText = 'None';
    var ttsText = 'None';
    if (window.MateyWhisper) {
      var stored = MateyWhisper.getStoredModel();
      if (stored) {
        var opts = MateyWhisper.getModelOptions();
        var found = opts ? opts.find(function (o) { return o.id === stored; }) : null;
        sttText = found ? found.label : stored;
      }
    }
    try {
      var ttsStored = localStorage.getItem('matey-tts-model') || '';
      if (ttsStored) {
        var ttsOpts = window.MateyVoiceModels ? MateyVoiceModels.getTTSLabel(ttsStored) : ttsStored;
        ttsText = ttsOpts || ttsStored;
      }
    } catch (e) {}
    if (sttVal) sttVal.textContent = sttText;
    if (ttsVal) ttsVal.textContent = ttsText;
  }

   /* Navigate to Voice Models screen when STT row is tapped */
   var sttRow = document.getElementById('voice-stt-row');
   if (sttRow) {
     sttRow.addEventListener('click', function () {
       var settings = document.getElementById('settings');
       if (settings) settings.classList.remove('open');
       setTimeout(function () {
         window.location.href = 'voice-models.html?tab=speech';
       }, 150);
     });
   }
   var ttsRow = document.getElementById('voice-tts-row');
   if (ttsRow) {
     ttsRow.addEventListener('click', function () {
       var settings = document.getElementById('settings');
       if (settings) settings.classList.remove('open');
       setTimeout(function () {
         window.location.href = 'voice-models.html?tab=tts';
       }, 150);
     });
   }

  /* BYOK Clear Credentials button */
  var clearCredBtn = document.getElementById('byok-clear-credentials');
  if (clearCredBtn) {
    clearCredBtn.addEventListener('click', function () {
      if (!confirm('Clear all saved provider credentials? This cannot be undone.')) return;
      if (window.MateyByok && typeof MateyByok.clearAll === 'function') {
        MateyByok.clearAll();
      } else {
        try { localStorage.removeItem('matey-providers'); } catch (e) {}
        try { localStorage.removeItem('matey_gemini_key'); } catch (e) {}
        try { localStorage.removeItem('matey_openai_key'); } catch (e) {}
      }
      alert('All provider credentials cleared.');
      if (window.MateyByok && typeof MateyByok.render === 'function') MateyByok.render();
    });
  }

  /* Update voice model summary when settings panel opens */

  /* Remove old Gemini-specific key UI — BYOK providers section is now the single source.
     Migration of legacy matey_gemini_key is handled by migrateLegacyProviders() on init. */

    updateFSSetup(null);

    var exportBtn = document.getElementById('export-data');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        try {
          var data = localStorage.getItem('matey-vots-data') || '{}';
          var blob = new Blob([data], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'matey-export-' + Date.now() + '.json';
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          console.error('Export failed', e);
        }
      });
    }

    document.querySelectorAll('[data-toggle]').forEach(function (el) {
        el.addEventListener('click', function () {
    var t = document.getElementById(el.dataset.toggle);
         if (t) t.classList.toggle('open');
         setTimeout(renderAdaptive, 50);
       });
    });
    var pf = document.getElementById('profile-form');
    if (pf && window.SnapProfile) pf.addEventListener('submit', SnapProfile.save);
  }

  function inject() {
    if (document.getElementById('settings')) { wire(); return; }
    document.body.insertAdjacentHTML('beforeend', SETTINGS_HTML + BYOK_HTML);
    if (window.MateyByok && typeof MateyByok.render === 'function') {
      MateyByok.render();
    }
    wire();
    if (window.MateyByok && typeof MateyByok.wireDynamic === 'function') {
      MateyByok.wireDynamic();
    }
  }

  window.MateySettings = {};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();

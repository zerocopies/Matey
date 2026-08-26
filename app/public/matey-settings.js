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
        <div class="settings-section" id="sec-models">
          <div class="settings-section-header" data-toggle="sec-models">
            <div class="settings-section-left">
              <div>
                <div class="settings-section-title">Micro Models</div>
                <div class="settings-section-desc">Download on-device AI models</div>
              </div>
            </div>
            <span class="settings-section-arrow"></span>
          </div>
          <div class="settings-section-body">
            <p class="settings-placeholder" id="models-status">No micro models downloaded. These run entirely on-device for enhanced AI capabilities.</p>
            <div class="micro-models-container">
              <div class="micro-model-group">
                <div class="micro-model-group-title">Grammar &amp; Punctuation Cleanup</div>
                <div class="micro-model-item">
                  <div class="micro-model-info">
                    <div class="micro-model-name">t5-efficient-tiny-grammar-correction</div>
                    <div class="micro-model-desc">Cleans up speech-to-text output, <span class="model-size">~60-100MB</span></div>
                  </div>
                  <button class="micro-model-download-btn" data-model="t5-grammar-correction" type="button">Download</button>
                </div>
              </div>
              <div class="micro-model-group">
                <div class="micro-model-group-title">Multilingual Translation</div>
                <div class="micro-model-item">
                  <div class="micro-model-info">
                    <div class="micro-model-name">German ↔ English</div>
                    <div class="micro-model-desc">Xenova/opus-mt-de-en + opus-mt-en-de, <span class="model-size">~40-90MB</span></div>
                  </div>
                  <button class="micro-model-download-btn" data-model="opus-mt-de-en" type="button">Download</button>
                </div>
                <div class="micro-model-item">
                  <div class="micro-model-info">
                    <div class="micro-model-name">Japanese ↔ English</div>
                    <div class="micro-model-desc">Xenova/opus-mt-ja-en + opus-mt-en-ja, <span class="model-size">~40-90MB</span></div>
                  </div>
                  <button class="micro-model-download-btn" data-model="opus-mt-ja-en" type="button">Download</button>
                </div>
                <div class="micro-model-item">
                  <div class="micro-model-info">
                    <div class="micro-model-name">Korean ↔ English</div>
                    <div class="micro-model-desc">Xenova/opus-mt-ko-en + opus-mt-en-ko, <span class="model-size">~40-90MB</span></div>
                  </div>
                  <button class="micro-model-download-btn" data-model="opus-mt-ko-en" type="button">Download</button>
                </div>
              </div>
              <div class="micro-model-group">
                <div class="micro-model-group-title">Speech-to-Text</div>
                <p class="settings-placeholder" id="whisper-status">No speech model loaded. Select a model below to enable offline voice-to-text.</p>
                <div id="whisper-models" class="whisper-models-dyn"></div>
                <div class="whisper-progress" id="whisper-progress" style="display:none;">
                  <div class="whisper-progress-bar"><div class="whisper-progress-fill" id="whisper-progress-fill"></div></div>
                  <span class="whisper-progress-text" id="whisper-progress-text">Downloading…</span>
                </div>
              </div>
            </div>
            <p class="whisper-hint">All models run entirely on-device. No data leaves your device. Download once, use offline.</p>
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
                <div class="settings-section-title">BYOK</div>
                 <div class="settings-section-desc">Bring Your Own Key — add any OpenAI-compatible, OpenRouter, Gemini, or compatible API provider</div>
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
    <h3 class="byok-dialog-title">Custom Provider</h3>
    <form id="byok-form">
      <div class="byok-field">
        <label class="byok-label" for="byok-name">Provider Name</label>
        <input class="byok-input" id="byok-name" type="text" placeholder="e.g., My Local LLM" autocomplete="off" />
      </div>
      <div class="byok-field">
        <label class="byok-label" for="byok-url">Base URL</label>
        <input class="byok-input" id="byok-url" type="url" placeholder="https://api.example.com or http://localhost:11434" autocomplete="off" />
      </div>
      <div class="byok-field">
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
            <label class="byok-cap"><input type="checkbox" name="cap_vision" value="vision" /> Vision / image understanding</label>
          </div>
          <div class="byok-capabilities-row">
            <label class="byok-cap"><input type="checkbox" name="cap_stt" value="stt" /> Speech-to-text</label>
            <label class="byok-cap"><input type="checkbox" name="cap_imagegen" value="imagegen" /> Image generation</label>
          </div>
        </div>
      </div>
      <div class="byok-dialog-actions">
        <button class="byok-btn byok-btn-secondary" id="byok-test" type="button">Test</button>
        <button class="byok-btn byok-btn-secondary" id="byok-cancel" type="button">Cancel</button>
        <button class="byok-btn byok-btn-primary" type="submit">Save Provider</button>
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

    /* Micro model download handlers — real downloads via Transformers.js */
    var downloadBtns = document.querySelectorAll('.micro-model-download-btn');
    downloadBtns.forEach(function (btn) {
      var modelId = btn.dataset.model;
      var itemEl = btn.closest('.micro-model-item');
      var nameEl = itemEl ? itemEl.querySelector('.micro-model-name') : null;
      var modelName = nameEl ? nameEl.textContent : modelId;

      /* Check if already loaded */
      if (window.MateyModels && MateyModels.isModelLoaded(modelId)) {
        btn.textContent = '✓ Downloaded';
        btn.disabled = true;
      }

      btn.addEventListener('click', async function () {
        if (!window.MateyModels) {
          btn.textContent = 'Error';
          return;
        }
        var btnText = btn.textContent;
        btn.textContent = 'Downloading… 0%';
        btn.disabled = true;
        btn.style.opacity = '0.6';

        try {
          await MateyModels.downloadModel(modelId, function (progress) {
            btn.textContent = 'Downloading… ' + Math.round(progress) + '%';
          });
          btn.textContent = '✓ Downloaded';
          btn.disabled = true;
          btn.style.opacity = '';
          btn.style.background = 'var(--accent-dim)';
          btn.style.color = 'var(--accent)';

          var status = document.getElementById('models-status');
          if (status) {
            status.textContent = 'Models ready — ' + MateyModels.getAvailableModels().filter(function (m) { return m.loaded; }).length + ' downloaded';
            status.style.color = 'var(--accent)';
          }
        } catch (err) {
          console.error('[MateySettings] Download failed:', {
            modelId: modelId,
            message: err.message || String(err),
            error: err,
            stack: err.stack || ''
          });
          btn.textContent = 'Retry';
          btn.disabled = false;
          btn.style.opacity = '';
          var status = document.getElementById('models-status');
          if (status) {
            status.textContent = 'Download failed: ' + (err.message || err);
            status.style.color = '#ff4444';
          }
        }
      });
    });
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

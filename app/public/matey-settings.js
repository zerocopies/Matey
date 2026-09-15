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
                  <div class="settings-section-desc">Speech recognition settings</div>
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
                <div class="setting-row setting-row-with-icon">
                  <div class="setting-row-icon">🎙️</div>
                  <div class="setting-row-body">
                    <div class="setting-row-label">Voice Activity Detection</div>
                    <div class="setting-row-desc">Trim silence before sending to AI</div>
                  </div>
                  <label class="setting-toggle">
                    <input type="checkbox" id="feature-vad-enabled" />
                    <span class="setting-toggle-slider"></span>
                  </label>
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
                <div class="setting-row setting-row-with-icon">
                  <div class="setting-row-icon">🖥️</div>
                  <div class="setting-row-body">
                    <div class="setting-row-label">Native Shell</div>
                    <div class="setting-row-desc">Allow the agent to run local shell commands (Termux/Android shell). Off by default. Medium/high-risk commands always ask first via the system confirm dialog.</div>
                  </div>
                 <label class="setting-toggle">
                   <input type="checkbox" id="feature-native-shell" />
                   <span class="setting-toggle-slider"></span>
                 </label>
                </div>
                <div class="setting-row setting-row-with-icon">
                  <div class="setting-row-icon">🌐</div>
                  <div class="setting-row-body">
                    <div class="setting-row-label">Community Wisdom <span class="experimental-badge">Experimental</span></div>
                    <div class="setting-row-desc">Share anonymized fix-pattern stats to help other Matey users, and receive theirs — no code or personal data is ever shared.</div>
                  </div>
                 <label class="setting-toggle">
                   <input type="checkbox" id="feature-community-wisdom" />
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
                  <div class="settings-section-desc">Workspace access</div>
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

           <div class="settings-section" id="sec-privacy">
             <div class="settings-section-header" data-toggle="sec-privacy">
               <div class="settings-section-left">
                 <div>
                   <div class="settings-section-title">Privacy</div>
                   <div class="settings-section-desc">Network activity & data</div>
                 </div>
               </div>
               <span class="settings-section-arrow"></span>
             </div>
             <div class="settings-section-body">
               <div class="setting-row">
                 <div class="setting-row-left">
                   <div class="setting-row-label">Cold Start</div>
                   <div class="setting-row-desc" id="cold-start-value">measuring…</div>
                 </div>
               </div>
               <div class="setting-row" id="network-activity-row">
                 <div class="setting-row-left">
                   <div class="setting-row-label">Network Activity</div>
                   <div class="setting-row-desc" id="network-activity-summary">No outbound calls logged yet</div>
                 </div>
                 <span class="setting-row-arrow">&rsaquo;</span>
               </div>
                <div class="setting-row" id="network-activity-clear" style="border-top:1px solid var(--app-border);">
                  <div class="setting-row-left">
                    <div class="setting-row-label" style="color:#f87171;">Clear Network Log</div>
                    <div class="setting-row-desc">Remove all recorded entries</div>
                  </div>
                </div>
                <div class="setting-row" id="brain-state-row" style="border-top:1px solid var(--app-border);">
                  <div class="setting-row-left">
                    <div class="setting-row-label">Brain State</div>
                    <div class="setting-row-desc" id="brain-state-summary">Loading…</div>
                  </div>
                </div>
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
       <div class="byok-field" style="position:relative;">
         <label class="byok-label" for="byok-key">API Key</label>
         <input class="byok-input" id="byok-key" type="password" placeholder="sk-ant-..., sk-..., AIza..., gsk_..., xai-..." autocomplete="off" />
         <div class="byok-detected" id="byok-detected" style="display:none;font-size:11px;color:var(--accent);margin-top:4px;"></div>
        </div>
       <div class="byok-field" style="display:none;">
         <label class="byok-label" for="byok-name">Provider Name</label>
         <input class="byok-input" id="byok-name" type="text" placeholder="auto-detected from key" autocomplete="off" />
       </div>
       <div class="byok-field" style="display:none;">
         <label class="byok-label" for="byok-url">Base URL</label>
         <input class="byok-input" id="byok-url" type="url" placeholder="auto-detected from key" autocomplete="off" />
       </div>
       <div class="byok-field" style="display:none;">
         <label class="byok-label" for="byok-model">Model</label>
         <select class="byok-input" id="byok-model-select" style="display:none;"></select>
         <input class="byok-input" id="byok-model" type="text" placeholder="auto-detect if empty" autocomplete="off" />
         <div class="byok-model-loading" id="byok-model-loading" style="display:none;font-size:11px;color:var(--text-dim);margin-top:4px;">Fetching models…</div>
       </div>
      <div class="byok-field byok-capabilities-section">
        <label class="byok-capabilities-label">Capabilities <span style="font-weight:400;color:var(--text-dim);">(auto-detected from your API key)</span></label>
        <div class="byok-capabilities">
          <div class="byok-capabilities-row">
            <label class="byok-cap"><input type="checkbox" id="cap_text" name="cap_text" value="text" /> Text generation</label>
            <label class="byok-cap"><input type="checkbox" id="cap_vision" name="cap_vision" value="vision" /> Vision / image</label>
          </div>
          <div class="byok-capabilities-row">
            <label class="byok-cap"><input type="checkbox" id="cap_stt" name="cap_stt" value="stt" /> Speech-to-text</label>
            <label class="byok-cap"><input type="checkbox" id="cap_imagegen" name="cap_imagegen" value="imagegen" /> Image generation</label>
          </div>
        </div>
      </div>
      <div class="byok-field">
         <button class="byok-btn byok-btn-secondary" id="byok-test" type="button" style="width:100%;">Test Connection</button>
         <div class="byok-status" id="byok-status" role="status" aria-live="polite"></div>
      </div>
      <div class="byok-dialog-actions">
         <button class="byok-btn byok-btn-secondary" id="byok-clear-credentials" type="button">Clear Credentials</button>
         <button class="byok-btn byok-btn-secondary" id="byok-cancel" type="button">Cancel</button>
         <button class="byok-btn byok-btn-primary" type="submit">Save</button>
      </div>
    </form>
  </div>
</div>`;

  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ---------- File System status ---------- */
  function updateFSSetup(result) {
    var status = document.getElementById('fs-status-text');
    if (!status) return;
    if (!result) {
      status.textContent = 'No workspace connected';
      status.style.color = 'var(--muted)';
    } else if (result.ok) {
      status.textContent = result.name;
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
        if (window.MateyByok) MateyByok.render();
        if (typeof updateVoiceSummary === 'function') updateVoiceSummary();
        if (typeof updateNetworkActivitySummary === 'function') updateNetworkActivitySummary();
        if (typeof updateColdStartSummary === 'function') updateColdStartSummary();
        if (typeof updateBrainStateSummary === 'function') updateBrainStateSummary();
      }
    });
    var backBtn = document.getElementById('settings-back');
    if (backBtn && settings) backBtn.addEventListener('click', function () {
      settings.classList.remove('open');
    });
    if (settings) settings.addEventListener('click', function (e) {
      if (e.target === settings) settings.classList.remove('open');
    });

    var fsInit = document.getElementById('fs-init-workspace');
    if (fsInit && window.MateyFS) fsInit.addEventListener('click', function () {
      MateyFS.selectWorkspace().then(function (result) {
        updateFSSetup(result);
      }).catch(function (err) {
        console.error('[MateySettings] selectWorkspace failed:', err);
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
  var TTS_SPEED_KEY = 'matey-tts-speed';
  var CONTINUOUS_VOICE_KEY = 'matey-continuous-voice';

  function loadTtsSpeed() {
    try { var v = parseFloat(localStorage.getItem(TTS_SPEED_KEY)); return isNaN(v) ? 1.0 : Math.max(0.5, Math.min(2.0, v)); } catch (e) { return 1.0; }
  }
  function storeTtsSpeed(v) {
    try { localStorage.setItem(TTS_SPEED_KEY, String(v)); } catch (e) {}
  }

  /* Expose TTS speed for playback engines (slider UI removed; value kept localStorage-backed) */
  window.MateyTTSSpeed = {
    get: loadTtsSpeed,
    set: function (v) { storeTtsSpeed(v); }
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

    /* Community Wisdom toggle wiring — default OFF */
    var communityToggle = document.getElementById('feature-community-wisdom');
    if (communityToggle) {
      var storedCommunity = false;
      try { storedCommunity = localStorage.getItem('matey-community-wisdom-enabled') === 'true'; } catch (e) {}
      communityToggle.checked = storedCommunity;
      communityToggle.addEventListener('change', function () {
        try { localStorage.setItem('matey-community-wisdom-enabled', String(this.checked)); } catch (e) {}
      });
    }

    /* Native Shell toggle wiring — default OFF.
       Backed by MateyShellGuard storage key 'matey-shell-enabled'. */
    var shellToggle = document.getElementById('feature-native-shell');
    if (shellToggle) {
      var storedShell = false;
      try {
        if (window.MateyShellGuard && typeof window.MateyShellGuard.isShellEnabled === 'function') {
          storedShell = window.MateyShellGuard.isShellEnabled();
        } else {
          storedShell = localStorage.getItem('matey-shell-enabled') === 'true';
        }
      } catch (e) {}
      shellToggle.checked = storedShell === true;
      shellToggle.addEventListener('change', function () {
        try {
          if (window.MateyShellGuard && typeof window.MateyShellGuard.setShellEnabled === 'function') {
            window.MateyShellGuard.setShellEnabled(this.checked);
          } else {
            localStorage.setItem('matey-shell-enabled', String(this.checked));
          }
        } catch (e) {}
      });
    }

   /* VAD toggle wiring — default ON */
   var vadToggle = document.getElementById('feature-vad-enabled');
   if (vadToggle) {
     var storedVAD = true;
     try { storedVAD = localStorage.getItem('matey-vad-enabled') !== 'false'; } catch (e) {}
     vadToggle.checked = storedVAD;
     vadToggle.addEventListener('change', function () {
       try { localStorage.setItem('matey-vad-enabled', String(this.checked)); } catch (e) {}
     });
   }

   /* ---- Privacy: Network Activity log ---- */
   function updateNetworkActivitySummary() {
     var el = document.getElementById('network-activity-summary');
     if (!el || !window.MateyNetworkLog) return;
     var hosts = window.MateyNetworkLog.getUniqueHosts();
     if (!hosts.length) { el.textContent = 'No outbound calls logged yet'; return; }
     el.textContent = hosts.length + ' host' + (hosts.length > 1 ? 's' : '') + ' · ' + hosts.slice(0, 3).map(function (h) { return h.hostname; }).join(', ');
   }

    function updateColdStartSummary() {
      var el = document.getElementById('cold-start-value');
      if (!el) return;
      var ms = null;
      if (window.MateyInit && typeof MateyInit.getColdStartMs === 'function') ms = MateyInit.getColdStartMs();
      if (ms == null) { try { ms = parseInt(localStorage.getItem('matey-cold-start-ms') || '0', 10); } catch (e) {} }
      if (ms != null && ms > 0) el.textContent = ms + ' ms';
      else el.textContent = 'measuring…';
    }

    function updateBrainStateSummary() {
      var el = document.getElementById('brain-state-summary');
      if (!el) return;
      var metrics = null;
      var schemaVersion = null;
      try {
        if (window.BrainState && typeof window.BrainState.getMetrics === 'function') {
          metrics = window.BrainState.getMetrics();
          schemaVersion = window.BrainState.brainSchemaVersion;
        }
      } catch (e) {}
      if (!metrics) {
        try {
          var raw = localStorage.getItem('matey-brain-state');
          if (raw) metrics = JSON.parse(raw);
        } catch (e) {}
      }
      if (!metrics) {
        el.textContent = 'No brain data yet';
        return;
      }
      console.log('[MateySettings] BrainState.getMetrics():', metrics);
      console.log('[MateySettings] Brain schema version:', schemaVersion);
      var instinctCount = metrics.instinctCount || 0;
      var localCoverage = metrics.localCoverage || 0;
      var avgLatency = metrics.avgLatencySavedMs || 0;
      var tokensSaved = metrics.tokensSavedEstimate || 0;
      var coldStartFraming = '';
      try {
        if (window.BrainState && typeof window.BrainState.getColdStartFraming === 'function') {
          coldStartFraming = window.BrainState.getColdStartFraming(metrics);
        }
      } catch (e) {}
      if (!coldStartFraming) {
        if (instinctCount < 5) {
          coldStartFraming = 'Building your brain: ' + instinctCount + ' experiences learned, local resolution starts appearing soon';
        } else if (localCoverage < 20) {
          coldStartFraming = 'Your brain is learning: ' + instinctCount + ' instincts cached, coverage is ' + localCoverage + '% — keep going';
        } else {
          coldStartFraming = 'Brain active: ' + instinctCount + ' instincts, ' + localCoverage + '% local coverage';
        }
      }
      el.textContent = coldStartFraming + ' · avg ' + avgLatency + 'ms saved · ~' + tokensSaved + ' tokens saved';
    }

   function renderNetworkActivity() {
     if (!window.MateyNetworkLog) return;
     var entries = window.MateyNetworkLog.getEntries();
     var hosts = window.MateyNetworkLog.getUniqueHosts();
     var modal = document.createElement('div');
     modal.className = 'lifestyle-modal';
     modal.id = 'network-activity-modal';
     var body = '<div class="lifestyle-backdrop"></div><div class="lifestyle-dialog" style="max-width:520px;"><div class="lifestyle-header"><span class="lifestyle-title">Network Activity</span><button class="lifestyle-close" data-close="network-activity-modal" type="button">&times;</button></div><div class="lifestyle-body" style="max-height:60vh;overflow-y:auto;">';
     body += '<p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">Outbound hostnames your app has contacted. No request content is ever logged — only the destination host and method.</p>';
     if (hosts.length) {
       body += '<div style="font-weight:600;margin-bottom:8px;font-size:13px;">Hosts (' + hosts.length + ')</div>';
       hosts.forEach(function (h) {
         body += '<div style="display:flex;justify-content:space-between;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:6px 10px;margin-bottom:4px;font-size:12px;">' +
           '<span style="font-family:monospace;color:#a5b4fc;">' + esc(h.hostname) + '</span>' +
           '<span style="color:var(--text-dim);">' + h.count + ' call' + (h.count > 1 ? 's' : '') + '</span></div>';
       });
       body += '<div style="font-weight:600;margin:14px 0 8px;font-size:13px;">Recent Calls</div>';
       entries.slice(-50).reverse().forEach(function (e) {
         var ts = new Date(e.ts);
         var timeStr = ts.getHours().toString().padStart(2, '0') + ':' + ts.getMinutes().toString().padStart(2, '0') + ':' + ts.getSeconds().toString().padStart(2, '0');
         body += '<div style="display:flex;justify-content:space-between;background:#111;border:1px solid #262626;border-radius:6px;padding:5px 10px;margin-bottom:3px;font-size:11px;">' +
           '<span style="font-family:monospace;color:#ccc;">' + esc(e.hostname) + '</span>' +
           '<span style="color:var(--text-dim);">' + e.method + ' · ' + timeStr + '</span></div>';
       });
     } else {
       body += '<p style="color:var(--text-secondary);">No outbound calls recorded yet. Make an API request (e.g. send a chat message) to see activity here.</p>';
     }
     body += '</div></div>';
     modal.innerHTML = body;
     document.body.appendChild(modal);
     modal.querySelector('.lifestyle-backdrop').addEventListener('click', function () { modal.remove(); });
     modal.querySelector('[data-close]').addEventListener('click', function () { modal.remove(); });
   }

   function wirePrivacy() {
     var row = document.getElementById('network-activity-row');
     if (row) row.addEventListener('click', function () { renderNetworkActivity(); });
     var clear = document.getElementById('network-activity-clear');
     if (clear) clear.addEventListener('click', function () {
       if (window.MateyNetworkLog) window.MateyNetworkLog.clear();
       updateNetworkActivitySummary();
     });
     updateNetworkActivitySummary();
     updateColdStartSummary();
   }

  /* Voice model summary — update STT value row */
  function updateVoiceSummary() {
    var sttVal = document.getElementById('voice-stt-value');
    var sttText = 'None';
    if (window.MateyWhisper) {
      var stored = MateyWhisper.getStoredModel();
      if (stored) {
        var opts = MateyWhisper.getModelOptions();
        var found = opts ? opts.find(function (o) { return o.id === stored; }) : null;
        sttText = found ? found.label : stored;
      }
    }
    if (sttVal) sttVal.textContent = sttText;
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
       });
    });
    var pf = document.getElementById('profile-form');
    if (pf && window.MateyProfile) pf.addEventListener('submit', MateyProfile.save);
  }

  function inject() {
    if (document.getElementById('settings')) { wire(); return; }
    document.body.insertAdjacentHTML('beforeend', SETTINGS_HTML + BYOK_HTML);
    if (window.MateyByok && typeof MateyByok.render === 'function') {
      MateyByok.render();
    }
    wire();
    if (typeof wirePrivacy === 'function') wirePrivacy();
    if (window.MateyByok && typeof MateyByok.wireDynamic === 'function') {
      MateyByok.wireDynamic();
    }
  }

  window.MateySettings = {
    isCommunityWisdomEnabled: function () {
      try { return localStorage.getItem('matey-community-wisdom-enabled') === 'true'; }
      catch (_) { return false; }
    },
    isNativeShellEnabled: function () {
      try {
        if (window.MateyShellGuard && typeof window.MateyShellGuard.isShellEnabled === 'function') {
          return window.MateyShellGuard.isShellEnabled();
        }
        return localStorage.getItem('matey-shell-enabled') === 'true';
      } catch (_) { return false; }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();

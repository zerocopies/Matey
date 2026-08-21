/* Matey Settings — single-source settings panel + BYOK dialog (injected on every page) */
(function () {
  'use strict';

  var SETTINGS_HTML = `<aside class="settings-overlay" id="settings">
      <div class="settings-header">
        <button class="settings-back" id="settings-back" aria-label="Back" type="button">&#8249;</button>
        <span class="settings-title">Settings</span>
        <button class="settings-menu" id="settings-menu" type="button" aria-label="Menu" title="Menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
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

        <div class="settings-section" id="sec-library">
          <div class="settings-section-header" data-toggle="sec-library">
            <div class="settings-section-left">
              <div>
                <div class="settings-section-title">Library</div>
                <div class="settings-section-desc">Gallery, Notes, Learning &amp; Guides</div>
              </div>
            </div>
            <span class="settings-section-arrow"></span>
          </div>
          <div class="settings-section-body">
            <div class="lib-subsections">
              <div class="lib-subsection">
                <div class="lib-sub-header" data-lib="recap">
                  <span class="lib-sub-title">Recap</span>
                  <span class="lib-sub-arrow"></span>
                </div>
                <div class="lib-sub-body" id="lib-recap">
                  <p class="settings-placeholder">Your weekly and monthly recaps with insights and progress tracking will appear here.</p>
                </div>
              </div>
              <div class="lib-subsection">
                <div class="lib-sub-header" data-lib="gallery">
                  <span class="lib-sub-title">Gallery</span>
                  <span class="lib-sub-arrow"></span>
                </div>
                <div class="lib-sub-body" id="lib-gallery">
                  <p class="settings-placeholder">Your saved images and media will appear here.</p>
                </div>
              </div>
              <div class="lib-subsection">
                <div class="lib-sub-header" data-lib="notes">
                  <span class="lib-sub-title">Notes</span>
                  <span class="lib-sub-arrow"></span>
                </div>
                <div class="lib-sub-body" id="lib-notes">
                  <div id="notes-list"><p class="settings-placeholder">No notes yet. Use ** prefix in chat or Markdown to save.</p></div>
                </div>
              </div>
              <div class="lib-subsection">
                <div class="lib-sub-header" data-lib="learning">
                  <span class="lib-sub-title">Learning</span>
                  <span class="lib-sub-arrow"></span>
                </div>
                <div class="lib-sub-body" id="lib-learning">
                  <p class="settings-placeholder">Your AI learning insights and behavior patterns will appear here as you use the app.</p>
                </div>
              </div>
              <div class="lib-subsection">
                <div class="lib-sub-header" data-lib="howto">
                  <span class="lib-sub-title">How to Use</span>
                  <span class="lib-sub-arrow"></span>
                </div>
                <div class="lib-sub-body" id="lib-howto">
                  <div class="syntax-cards">
                    <div class="syntax-card"><span class="syntax-token">**</span><span class="syntax-desc">Permanent note — saved to vault with topic tags. Use in chat or Markdown.</span></div>
                    <div class="syntax-card"><span class="syntax-token">##</span><span class="syntax-desc">Scratchpad — temporary notes that auto-expire after 24 hours.</span></div>
                    <div class="syntax-card"><span class="syntax-token">//</span><span class="syntax-desc">Silent automation — background processing, no visible output.</span></div>
                    <div class="syntax-card"><span class="syntax-token">??</span><span class="syntax-desc">Knowledge Bank query — search your saved notes instantly.</span></div>
                    <div class="syntax-card"><span class="syntax-token">!!</span><span class="syntax-desc">Priority flag — pin important items to the top.</span></div>
                  </div>
                  <p class="settings-placeholder" style="margin-top:14px;font-size:12px;line-height:1.6;">
                    <strong style="color:var(--text);">Markdown Guide:</strong><br>
                    <code># Heading</code> = large title · <code>## Subheading</code> = medium · <code>**bold**</code> · <code>*italic*</code><br>
                    <code>- list item</code> · <code>\\\`code\\\`</code> · <code>[link](url)</code> · <code>\`\`\`code block\`\`\`</code><br>
                    All work in both the chat bar and the Markdown page.
                  </p>
                </div>
              </div>
            </div>
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
        <div class="settings-section" id="sec-localai">
          <div class="settings-section-header" data-toggle="sec-localai">
            <div class="settings-section-left">
              <div>
                <div class="settings-section-title">Local AI</div>
                <div class="settings-section-desc">Voice-to-text & model management</div>
              </div>
            </div>
            <span class="settings-section-arrow"></span>
          </div>
          <div class="settings-section-body">
            <p class="settings-placeholder" id="whisper-status">No speech model loaded. Select a model below to enable offline voice-to-text.</p>
            <div class="whisper-models" id="whisper-models"></div>
            <div class="whisper-progress" id="whisper-progress" style="display:none;">
              <div class="whisper-progress-bar"><div class="whisper-progress-fill" id="whisper-progress-fill"></div></div>
              <span class="whisper-progress-text" id="whisper-progress-text">Downloading...</span>
            </div>
            <p class="whisper-hint">Models run entirely on-device. No data leaves your device. Download once, use offline.</p>
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
            <div class="model-list" id="model-list">
              <div class="model-item">
                <div class="model-info">
                  <div class="model-name">TinyLLM — 20M params</div>
                  <div class="model-desc">Lightweight text generation, <span class="model-size">~25MB</span></div>
                </div>
                <button class="model-download-btn" data-model="tinyllm-20m" type="button">Download</button>
              </div>
              <div class="model-item">
                <div class="model-info">
                  <div class="model-name">MiniSTT — Whisper Tiny</div>
                  <div class="model-desc">Speech-to-text, <span class="model-size">~75MB</span></div>
                </div>
                <button class="model-download-btn" data-model="ministt-75m" type="button">Download</button>
              </div>
              <div class="model-item">
                <div class="model-info">
                  <div class="model-name">CodeHelper — 50M params</div>
                  <div class="model-desc">Code completion & assistance, <span class="model-size">~50MB</span></div>
                </div>
                <button class="model-download-btn" data-model="codehelper-50m" type="button">Download</button>
              </div>
            </div>
            <p class="whisper-hint">All models run locally. No data leaves your device.</p>
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
        <div class="settings-section" id="sec-custom">
          <div class="settings-section-header" data-toggle="sec-custom">
            <div class="settings-section-left">
              <div>
                <div class="settings-section-title">Custom</div>
                <div class="settings-section-desc">Integrations &amp; extensions</div>
              </div>
            </div>
            <span class="settings-section-arrow"></span>
          </div>
                    <div class="settings-section-body">
            <button class="byok-add-btn" id="byok-add" type="button">+ Add Provider</button>
            <div id="byok-list"></div>
            <div class="settings-list-item">
              <div class="settings-list-left">
                <span class="settings-list-label">Webhooks</span>
                <span class="settings-list-desc">Configure event callbacks</span>
              </div>
              <span class="settings-list-arrow"></span>
            </div>
            <div class="settings-list-item">
              <div class="settings-list-left">
                <span class="settings-list-label">Data Export</span>
                <span class="settings-list-desc">Download your data</span>
              </div>
              <span class="settings-list-arrow"></span>
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

        <div class="settings-section" id="sec-hooks">
          <div class="settings-section-header" data-toggle="sec-hooks">
            <div class="settings-section-left">
              <div>
                <div class="settings-section-title">Hooks</div>
                <div class="settings-section-desc">Web monitor & keyword tracking</div>
              </div>
            </div>
            <span class="settings-section-arrow"></span>
          </div>
          <div class="settings-section-body">
            <div class="hooks-sub-section">
              <h4 class="hooks-sub-title">Web Monitor Hooks</h4>
              <p class="settings-placeholder">Monitor web pages for changes. Add a URL, describe what to watch for in natural language, and set a schedule (3-7 days).</p>
              <div class="hook-list" id="hook-list-web">
                <p class="settings-placeholder-small">No web monitors configured.</p>
              </div>
              <button class="byok-add-btn" id="hook-add-web" type="button">+ Add Web Monitor</button>
            </div>
            <div class="hooks-sub-section">
              <h4 class="hooks-sub-title">Keyword Hooks</h4>
              <p class="settings-placeholder">Track keywords across the web — people, brands, topics, languages. Results refresh automatically.</p>
              <div class="hook-list" id="hook-list-keywords">
                <p class="settings-placeholder-small">No keyword hooks configured.</p>
              </div>
              <button class="byok-add-btn" id="hook-add-keyword" type="button">+ Add Keyword Hook</button>
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
                <a class="settings-about-link" href="#">Privacy Policy </a>
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
      <div class="byok-dialog-actions">
        <button class="byok-btn byok-btn-secondary" id="byok-test" type="button">Test</button>
        <button class="byok-btn byok-btn-secondary" id="byok-cancel" type="button">Cancel</button>
        <button class="byok-btn byok-btn-primary" type="submit">Save Provider</button>
      </div>
    </form>
  </div>
</div>`;

  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ---------- Recap: real data ---------- */
  function renderRecap() {
    var el = document.getElementById('lib-recap');
    if (!el || !window.MateySyntax) return;
    var d = MateySyntax.getAllNotes();
    var perm = d.permanent || [], scr = d.scratchpads || [], pri = d.priorities || [], rec = d.recap || [];
    var total = perm.length + scr.length + pri.length;
    if (!total && !rec.length) { el.innerHTML = '<p class="settings-placeholder">Your weekly and monthly recaps with insights will appear here as you use Matey.</p>'; return; }
    var topics = {};
    perm.forEach(function (n) { if (n.topic) topics[n.topic] = (topics[n.topic] || 0) + 1; });
    var topTopics = Object.keys(topics).sort(function (a, b) { return topics[b] - topics[a]; }).slice(0, 3);
    var week = 0, day = 0, now = Date.now();
    rec.forEach(function (r) { var t = now - (r.time || 0); if (t < 86400000) day++; if (t < 7 * 86400000) week++; });
    var days = {};
    rec.forEach(function (r) { var k = new Date(r.time || 0).toLocaleDateString([], { weekday: 'short' }); days[k] = (days[k] || 0) + 1; });
    var max = Math.max.apply(null, Object.keys(days).map(function (k) { return days[k]; }).concat([1]));
    var bars = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function () { return 0; });
    var order = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var barHtml = order.map(function (k) {
      var v = days[k] || 0;
      var h = Math.round(4 + (v / max) * 28);
      return '<div class="recap-bar-col"><div class="recap-bar" style="height:' + h + 'px;' + (v ? 'background:var(--accent);' : '') + '"></div><span>' + k[0] + '</span></div>';
    }).join('');
    var html = '';
    html += '<div class="recap-stats">';
    html += '<div class="recap-stat"><span class="recap-stat-num">' + total + '</span><span class="recap-stat-label">Notes</span></div>';
    html += '<div class="recap-stat"><span class="recap-stat-num">' + day + '</span><span class="recap-stat-label">Today</span></div>';
    html += '<div class="recap-stat"><span class="recap-stat-num">' + week + '</span><span class="recap-stat-label">This week</span></div>';
    html += '<div class="recap-stat"><span class="recap-stat-num">' + pri.length + '</span><span class="recap-stat-label">Priority</span></div>';
    html += '</div>';
    html += '<div class="recap-bars">' + barHtml + '</div>';
    if (topTopics.length) html += '<div class="recap-topics">Top topics: ' + topTopics.map(function (t) { return '<span class="recap-topic">' + esc(t) + '</span>'; }).join(' ') + '</div>';
    var recent = rec.slice(0, 6);
    if (recent.length) {
      html += '<div class="recap-recent">' + recent.map(function (r) {
        return '<div class="recap-item"><span>' + esc((r.text || '').substring(0, 70)) + '</span><span class="recap-time">' + new Date(r.time).toLocaleDateString([], { month: 'short', day: 'numeric' }) + '</span></div>';
      }).join('') + '</div>';
    }
    el.innerHTML = html;
  }

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
        renderRecap();
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

    /* Settings menu (three lines) */
    var settingsMenu = document.getElementById('settings-menu');
    if (settingsMenu) {
      settingsMenu.addEventListener('click', function (e) {
        e.stopPropagation();
        var menu = document.querySelector('.settings-context-menu');
        if (!menu) {
          var m = document.createElement('div');
          m.className = 'settings-context-menu';
          m.innerHTML =
            '<button data-action="incognito" type="button">Incognito Mode</button>' +
            '<button data-action="theme" type="button">Change Theme</button>' +
            '<button data-action="language" type="button">Language</button>';
          settingsMenu.parentNode.appendChild(m);

          m.querySelectorAll('button').forEach(function (btn) {
            btn.addEventListener('click', function () {
              if (btn.dataset.action === 'incognito') {
                var inc = document.querySelector('.incognito-trigger');
                if (inc) inc.click();
              } else if (btn.dataset.action === 'theme') {
                var t = document.getElementById('sec-theme');
                if (t) t.classList.add('open');
              } else if (btn.dataset.action === 'language') {
                var l = document.getElementById('lang-select');
                if (l) l.focus();
              }
              m.remove();
            });
          });

          var rect = settingsMenu.getBoundingClientRect();
          m.style.position = 'fixed';
          m.style.top = (rect.bottom + 8) + 'px';
          m.style.right = (window.innerWidth - rect.right - 8) + 'px';

          document.addEventListener('click', function closeMenu(e2) {
            if (!m.contains(e2.target) && e2.target !== settingsMenu) {
              m.remove();
              document.removeEventListener('click', closeMenu);
            }
          });
        }
      });
    }

    updateFSSetup(null);

    document.querySelectorAll('[data-toggle]').forEach(function (el) {
        el.addEventListener('click', function () {
        var t = document.getElementById(el.dataset.toggle);
        if (t) t.classList.toggle('open');
        setTimeout(renderRecap, 50);
      });
    });
    var pf = document.getElementById('profile-form');
    if (pf && window.SnapProfile) pf.addEventListener('submit', SnapProfile.save);

    /* Micro model download handlers */
    var downloadBtns = document.querySelectorAll('.model-download-btn');
    downloadBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modelId = btn.dataset.model;
        var modelName = btn.closest('.model-item').querySelector('.model-name').textContent;
        btn.textContent = 'Downloading…';
        btn.disabled = true;

        /* Simulate download progress */
        var progress = 0;
        var interval = setInterval(function () {
          progress += Math.random() * 15;
          if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            btn.textContent = 'Downloaded';
            btn.style.background = 'var(--accent, rgba(245, 197, 67, 0.2))';
            btn.style.color = 'var(--accent)';

            /* Update status */
            var status = document.getElementById('models-status');
            if (status) {
              status.textContent = '1 model ready: ' + modelName;
              status.style.color = 'var(--accent)';
            }
          }
        }, 300);
      });
    });
  }

  function inject() {
    if (document.getElementById('settings')) { wire(); return; }
    document.body.insertAdjacentHTML('beforeend', SETTINGS_HTML + BYOK_HTML);
    wire();
    if (window.MateyByok && typeof MateyByok.wireDynamic === 'function') {
      MateyByok.wireDynamic();
    }
  }

  window.MateySettings = { renderRecap: renderRecap };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();

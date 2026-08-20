/* Matey Settings — single-source settings panel + BYOK dialog (injected on every page) */
(function () {
  'use strict';

  var SETTINGS_HTML = `<aside class="settings-overlay" id="settings">
      <div class="settings-header">
        <button class="settings-back" id="settings-close" type="button" aria-label="Close">←</button>
        <h2 class="settings-title">Settings</h2>
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
        <div class="settings-section" id="sec-incognito">
          <div class="settings-section-header" data-toggle="sec-incognito">
            <div class="settings-section-left">
              <div>
                <div class="settings-section-title">Incognito Mode</div>
                <div class="settings-section-desc">Private browsing & data</div>
              </div>
            </div>
            <span class="settings-section-arrow"></span>
          </div>
          <div class="settings-section-body">
            <div class="settings-incognito-row">
              <div class="settings-incognito-left">
                <span class="settings-incognito-title">Private Browsing</span>
                <span class="settings-incognito-desc">Disables local data storage</span>
              </div>
              <label class="toggle">
                <input type="checkbox" id="incognito-toggle" />
                <span class="toggle-track"></span>
                <span class="toggle-thumb"></span>
              </label>
            </div>
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

  /* ---------- wiring ---------- */
  function wire() {
    var settings = document.getElementById('settings');
    var trigger = document.querySelector('[aria-label="Settings"]');
    if (trigger) trigger.addEventListener('click', function () {
      settings.classList.add('open');
      if (window.MateyThemes) MateyThemes.build(settings);
      renderRecap();
      if (window.MateyByok) MateyByok.render();
    });
    var close = document.getElementById('settings-close');
    if (close) close.addEventListener('click', function () { settings.classList.remove('open'); });
    document.querySelectorAll('[data-toggle]').forEach(function (el) {
      el.addEventListener('click', function () {
        var t = document.getElementById(el.dataset.toggle);
        if (t) t.classList.toggle('open');
        setTimeout(renderRecap, 50);
      });
    });
    var pf = document.getElementById('profile-form');
    if (pf && window.SnapProfile) pf.addEventListener('submit', SnapProfile.save);
  }

  function inject() {
    if (document.getElementById('settings')) { wire(); return; }
    document.body.insertAdjacentHTML('beforeend', SETTINGS_HTML + BYOK_HTML);
    wire();
  }

  window.MateySettings = { renderRecap: renderRecap };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();

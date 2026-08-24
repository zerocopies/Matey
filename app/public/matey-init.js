/* Matey Init — wires Whisper, license, settings, app lock gate */
(function () {
  'use strict';

  /* ---- App Lock Gate ---- */
  var APP_LOCK_KEY = 'matey-app-lock';
  var APP_LOCK_SESSION = 'matey-app-lock-session';
  var APP_LOCK_DURATION = 5 * 60 * 1000;

  function appLockEnabled() {
    try {
      var raw = localStorage.getItem(APP_LOCK_KEY);
      if (!raw) return false;
      var cfg = JSON.parse(raw);
      return cfg.enabled && cfg._pinHash;
    } catch (e) { return false; }
  }

  function appLockCheckSession() {
    try {
      var s = JSON.parse(localStorage.getItem(APP_LOCK_SESSION) || '{}');
      return s.unlocked && s.expires > Date.now();
    } catch (e) { return false; }
  }

  function appLockScreen() {
    if (!appLockEnabled()) return;
    if (appLockCheckSession()) return;

    var existing = document.getElementById('matey-app-lock-overlay');
    if (existing) return;

    var overlay = document.createElement('div');
    overlay.id = 'matey-app-lock-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;display:flex;align-items:center;justify-content:center;';

    var pin = document.createElement('input');
    pin.type = 'password';
    pin.inputMode = 'numeric';
    pin.pattern = '[0-9]*';
    pin.placeholder = 'PIN';
    pin.style.cssText = 'padding:12px 16px;font-size:24px;text-align:center;width:200px;background:#111;border:1px solid #333;border-radius:12px;color:#fff;font-family:monospace;letter-spacing:6px;';

    var btn = document.createElement('button');
    btn.textContent = 'Unlock';
    btn.style.cssText = 'margin-top:12px;padding:10px 24px;background:#f5c542;color:#000;border:none;border-radius:10px;font-weight:600;cursor:pointer;';

    var col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
    col.appendChild(pin);
    col.appendChild(btn);
    overlay.appendChild(col);

    btn.addEventListener('click', tryUnlock);
    pin.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && pin === document.activeElement) { e.preventDefault(); tryUnlock(); }
    });

    function tryUnlock() {
      window.MateyAppLock.unlock(pin.value).then(function (ok) {
        if (ok) {
          overlay.remove();
          pin.value = '';
        } else {
          pin.value = '';
          pin.focus();
        }
      });
    }

    // Insert overlay BEFORE any content renders, then hide body content
    overlay.style.display = 'none';
    document.body.appendChild(overlay);

    // Hide all visible content behind the lock
    var appShell = document.querySelector('.app-shell');
    var wasVisible = appShell ? appShell.style.opacity : '';
    if (appShell) appShell.style.opacity = '0';

    // Show overlay after brief delay
    requestAnimationFrame(function () {
      overlay.style.display = 'flex';
      if (pin) pin.focus();
    });
  }

  /* ---- App Lock API (inline, used by matey-init gate) ---- */
  window.MateyAppLock = window.MateyAppLock || {
    setPin: function (pin) {
      return (async function () {
        var salt = '';
        var arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        salt = Array.from(arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        var enc = new TextEncoder();
        var data = enc.encode(pin + salt);
        var hashBuffer = await crypto.subtle.digest('SHA-256', data);
        var hashArray = Array.from(new Uint8Array(hashBuffer));
        var pinHash = hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        localStorage.setItem(APP_LOCK_KEY, JSON.stringify({
          enabled: true, useBiometric: false, _pinHash: pinHash, _salt: salt
        }));
      })();
    },
    verifyPin: function (pin) {
      return (async function () {
        try {
          var cfg = JSON.parse(localStorage.getItem(APP_LOCK_KEY) || '{}');
          if (!cfg.enabled || !cfg._pinHash) return false;
          var enc = new TextEncoder();
          var data = enc.encode(pin + cfg._salt);
          var hashBuffer = await crypto.subtle.digest('SHA-256', data);
          var hashArray = Array.from(new Uint8Array(hashBuffer));
          var inputHash = hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
          return inputHash === cfg._pinHash;
        } catch (e) { return false; }
      })();
    },
    unlock: function (pin) {
      return window.MateyAppLock.verifyPin(pin).then(function (valid) {
        if (valid) {
          localStorage.setItem(APP_LOCK_SESSION, JSON.stringify({
            unlocked: true, expires: Date.now() + APP_LOCK_DURATION
          }));
        }
        return valid;
      });
    },
    lock: function () {
      localStorage.removeItem(APP_LOCK_SESSION);
    },
    isLockEnabled: appLockEnabled,
    isLocked: function () { return appLockEnabled() && !appLockCheckSession(); },
    removeLock: function () {
      localStorage.removeItem(APP_LOCK_KEY);
      localStorage.removeItem(APP_LOCK_SESSION);
    }
  };

  var APPLockListeners = [];
  function appLockNotify(event) {
    APPLockListeners.forEach(function (fn) { fn(event); });
  }
  window.MateyAppLock.onLockChange = function (fn) { APPLockListeners.push(fn); };

  function initWhisperUI() {
    var c=document.getElementById('whisper-models'),s=document.getElementById('whisper-status'),p=document.getElementById('whisper-progress'),f=document.getElementById('whisper-progress-fill'),t=document.getElementById('whisper-progress-text');
    if(!c||!s)return;
    var models=MateyWhisper.getModelOptions(),stored=MateyWhisper.getStoredModel(),state=MateyWhisper.getState();
    if(state.ready){var m=models.find(function(x){return x.id===stored;});s.textContent='Loaded: '+(m?m.label:stored);}
    c.innerHTML=models.map(function(m){
      var downloaded=MateyWhisper.isModelDownloaded(m.id);
      var il=state.loading&&stored===m.id;
      return '<div class="micro-model-item"><div class="micro-model-info"><div class="micro-model-name">'+m.label+'</div><div class="micro-model-desc">'+m.desc+'</div></div><button class="whisper-model-btn'+(downloaded?' downloaded':'')+'" data-model="'+m.id+'"'+(il?' disabled':'')+'>'+(downloaded?'✓ Downloaded':'Download')+'</button></div>';
    }).join('');
    c.querySelectorAll('.whisper-model-btn').forEach(function(b){
      b.addEventListener('click',function(){
        var id=b.getAttribute('data-model');
        var modelObj=models.find(function(x){return x.id===id;});
        var isDownloaded=MateyWhisper.isModelDownloaded(id);
        MateyWhisper.storeModel(id);
        b.disabled=true;
        if(isDownloaded){
          b.textContent='Loading… 0%';
          MateyWhisper.loadModel(id,function(pr){b.textContent='Loading… '+Math.round(pr)+'%';}).then(function(){
            s.textContent='Loaded: '+(modelObj?modelObj.label:id);
            initWhisperUI();
          }).catch(function(e){b.disabled=false;b.textContent='Retry';});
          return;
        }
        b.textContent='Downloading… 0%';
        p.style.display='flex';
        f.style.width='0%';
        t.textContent='Downloading model…';
        MateyWhisper.loadModel(id,function(pr){
          b.textContent='Downloading… '+Math.round(pr)+'%';
          f.style.width=pr+'%';
          if(pr>=100)t.textContent='Initializing…';
        }).then(function(){
          p.style.display='none';
          MateyWhisper.markModelDownloaded(id);
          s.textContent='Loaded: '+(modelObj?modelObj.label:id);
          initWhisperUI();
        }).catch(function(e){
          p.style.display='none';b.disabled=false;b.textContent='Retry';t.textContent='Error';
        });
      });
    });
  }
  function initLicenseUI() {
    var ab=document.querySelector("#sec-about .settings-section-body");if(!ab)return;var card=ab.querySelector('.settings-about-card');if(!card||document.getElementById('license-row'))return;
    var lic=MateyLicense.get(),row=document.createElement('div');row.id='license-row';row.style.cssText='margin-top:16px;padding-top:16px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;';
    var unlocked=lic.tier==='unlocked';
    row.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:15px;font-weight:var(--font-weight-medium);color:var(--text);">Matey</span><span style="font-size:13px;font-weight:var(--font-weight-medium);padding:4px 12px;border-radius:8px;'+(unlocked?'background:var(--accent);color:#000;':'background:var(--surface);color:var(--text-secondary);')+'">'+(unlocked?'∞ Unlocked':'Free')+'</span></div>'+(unlocked?'<p style="font-size:12px;color:var(--text-secondary);">One-time lifetime unlock — no subscription, no expiry. Thanks for supporting Matey.</p>':'<button id="upgrade-btn" style="border:none;background:var(--accent);color:#000;padding:10px;border-radius:12px;font:inherit;font-size:14px;font-weight:var(--font-weight-medium);cursor:pointer;">Unlock Matey ∞ — $'+MateyLicense.PRICE.toFixed(2)+' one-time</button><p style="font-size:12px;color:var(--text-secondary);">Unlimited memory, Ask Matey recall, proactive actions, BYOK + local models, sync & more. One payment, yours forever.</p>');
    row.querySelector('#upgrade-btn').addEventListener('click',function(){MateyLicense.unlock();row.remove();initLicenseUI();});card.appendChild(row);
  }

  function init(){
    initWhisperUI();initLicenseUI();
    // Track page visit for adaptive ML
    if (window.MateyBehavior) {
      var page = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
      MateyBehavior.trackPage(page);
    }
    // Gate the app with PIN/biometric lock if enabled
    appLockScreen();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

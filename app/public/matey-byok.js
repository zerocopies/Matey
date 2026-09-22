/* Matey BYOK — Custom Provider Manager */
(function () {
  'use strict';
  var KEY = 'matey-providers';

  /* Native HTTP wrapper that bypasses CORS on Android/iOS by using
     CapacitorHttp (native HTTP stack) instead of the browser fetch().
     Falls back to fetch() on pure web. */
  function nativeFetch(url, options) {
    var opts = options || {};
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
      var reqOpts = {
        method: (opts.method || 'GET').toUpperCase(),
        url: url,
        headers: opts.headers || {}
      };
      if (opts.body) {
        if (typeof opts.body === 'string') {
          try { reqOpts.data = JSON.parse(opts.body); }
          catch (e) { reqOpts.data = opts.body; reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'text/plain'; }
        } else {
          reqOpts.data = opts.body;
        }
      }
      return window.Capacitor.Plugins.CapacitorHttp.request(reqOpts).then(function (resp) {
        return {
          ok: resp.status >= 200 && resp.status < 300,
          status: resp.status,
          statusText: resp.status,
          headers: resp.headers || {},
          url: resp.url || url,
          json: function () { return Promise.resolve(resp.data); },
          text: function () { return Promise.resolve(typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)); }
        };
      });
    }
    return fetch(url, opts);
  }

  var BAZAARLINK_BASE = 'https://api.bazaarlink.ai/v1';

  /* Auto-register an agent with BazaarLink to get a free API key.
     Per skill.md: POST /v1/agents/register returns api_key, free_model "auto:free".
     New agents with 0 credits can immediately use model "auto:free". */
  function autoRegisterAgent(label) {
    var name = label || 'Matey Mobile Agent';
    var url = BAZAARLINK_BASE + '/agents/register';
    console.log('[BazaarLink] Auto-registering agent:', name);
    return nativeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, description: 'Matey AI assistant running on-device' })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('Registration failed: HTTP ' + r.status + ': ' + t.slice(0, 200)); });
      return r.json();
    }).then(function (j) {
      var key = j.api_key;
      if (!key) throw new Error('No API key returned from registration');
      console.log('[BazaarLink] Registered! Key:', key.substring(0, 12) + '...', 'Free model:', j.free_model || 'auto:free');
      return { apiKey: key, baseUrl: BAZAARLINK_BASE, freeModel: j.free_model || 'auto:free' };
    }).catch(function (err) {
      console.warn('[BazaarLink] Registration failed:', err.message || err);
      throw err;
    });
  }

  /* Ensure a provider is available, auto-registering with BazaarLink if none exist. */
  function ensureProvider() {
    var providers = load();
    if (providers.length > 0) return Promise.resolve(providers[0]);
    console.log('[BazaarLink] No providers configured, attempting auto-registration');
    return autoRegisterAgent('Matey Agent').then(function (result) {
      var entry = {
        name: 'BazaarLink (auto)',
        baseUrl: result.baseUrl,
        apiKey: result.apiKey,
        model: result.freeModel,
        capabilities: ['text', 'vision', 'stt', 'imagegen']
      };
      providers.push(entry);
      save(providers);
      console.log('[BazaarLink] Saved auto-registered provider');
      return entry;
    }).catch(function (err) {
      console.warn('[BazaarLink] Could not auto-register:', err.message || err);
      return null;
    });
  }

  /* Strip markdown link formatting from a URL string.
     e.g. [label](https://example.com/v1) → https://example.com/v1
          https://example.com/v1 → https://example.com/v1 */
  function cleanBaseUrl(raw) {
    var s = (raw || '').trim();
    /* Extract URL from markdown link syntax [text](url) if present */
    var mdMatch = s.match(/\]\(([^)]+)\)/);
    if (mdMatch) s = mdMatch[1];
    /* If still has markdown link structure at start, strip it */
    s = s.replace(/^\[.*\]\(/, '').replace(/\)[^)]*$/, '');
    /* Remove any remaining stray markdown braces/brackets */
    s = s.replace(/[\[\]]/g, '').trim();
    /* Strip trailing slashes */
    s = s.replace(/\/+$/, '');
    return s;
  }

  /* Build a clean API URL from base URL + endpoint.
     Avoids duplicate /v1 when base already contains it. */
  function buildApiUrl(baseUrl, endpoint) {
    var base = cleanBaseUrl(baseUrl || '');
    /* Strip trailing /v1 or /v1/ from base so we control the path */
    base = base.replace(/\/v1\/?$/, '');
    return base + endpoint;
  }

  /* ---- Provider storage: IndexedDB (keys never persisted to localStorage) ---- */
  var _providersCache = null;   /* null = not yet seeded */
  var _providersDB = null;
  var _providersReady = null;

  function _providersOpenDB() {
    if (_providersReady) return _providersReady;
    _providersReady = new Promise(function (resolve) {
      if (typeof indexedDB === 'undefined') { _providersCache = _providersCache || []; resolve(); return; }
      var req = indexedDB.open('MateyByokDB', 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
      };
      req.onsuccess = function () {
        _providersDB = req.result;
        try {
          var q = _providersDB.transaction('kv', 'readonly').objectStore('kv').get(KEY);
          q.onsuccess = function () {
            var stored = q.result;
            var legacy = null;
            try { var raw = localStorage.getItem(KEY); if (raw) legacy = JSON.parse(raw); } catch (e) {}
            if (Array.isArray(stored) && stored.length) {
              _providersCache = stored;
              try { localStorage.removeItem(KEY); } catch (e) {}
            } else if (Array.isArray(legacy) && legacy.length) {
              _providersCache = legacy;
              try {
                _providersDB.transaction('kv', 'readwrite').objectStore('kv').put(legacy, KEY);
                localStorage.removeItem(KEY);
              } catch (e) {}
            } else {
              _providersCache = _providersCache || [];
            }
            resolve();
          };
          q.onerror = function () { _providersCache = _providersCache || []; resolve(); };
        } catch (e) { _providersCache = _providersCache || []; resolve(); }
      };
      req.onerror = function () { _providersCache = _providersCache || []; resolve(); };
    });
    return _providersReady;
  }

  function load() {
    if (_providersCache !== null) return _providersCache;
    /* First synchronous call before IDB seeding completes — fall back to a legacy
       read, then let the seed take over ownership once open resolves. */
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var p = JSON.parse(raw); if (Array.isArray(p)) { _providersCache = p; return p; } }
    } catch (e) {}
    return [];
  }

  function save(list) {
    _providersCache = Array.isArray(list) ? list : [];
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (_providersDB) {
      try {
        var tx = _providersDB.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(_providersCache, KEY);
      } catch (e) {}
      return Promise.resolve();
    }
    return _providersReady ? _providersReady.then(function () {
      if (!_providersDB) return;
      try {
        var tx = _providersDB.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(_providersCache, KEY);
      } catch (e) {}
    }) : Promise.resolve();
  }

  /* Migrate legacy single-provider keys into the generic BYOK list */
  function migrateLegacyProviders() {
    var providers = load();
    var migrated = false;

    /* Migrate matey_gemini_key → Gemini provider entry */
    var geminiKey = localStorage.getItem('matey_gemini_key');
    if (geminiKey && !providers.some(function (p) { return p.name === 'Gemini' && p.baseUrl.indexOf('generativelanguage') !== -1; })) {
      providers.unshift({
        name: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: geminiKey,
        model: '',
        capabilities: ['text', 'text-gen', 'vision']
      });
      migrated = true;
      localStorage.removeItem('matey_gemini_key');
    }

    /* Migrate matey_openai_key → OpenAI provider entry */
    var openaiKey = localStorage.getItem('matey_openai_key');
    if (openaiKey && !providers.some(function (p) { return p.name.toLowerCase().indexOf('openai') !== -1; })) {
      providers.unshift({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: openaiKey,
        model: '',
        capabilities: ['text', 'text-gen', 'vision', 'imagegen']
      });
      migrated = true;
      localStorage.removeItem('matey_openai_key');
    }

    if (migrated) save(providers);
    return providers;
  }

  function renderList() {
     var el = document.getElementById('byok-list');
     if (!el) return;
     var providers = load();
     if (!providers.length) { el.innerHTML = '<p class="byok-empty">No custom providers configured.</p>'; return; }
     el.innerHTML = providers.map(function (p, i) {
       var caps = (p.capabilities || []).map(function (c) {
         var label = { text: 'Text', vision: 'Vision', stt: 'Voice', imagegen: 'Image Gen' }[c] || c;
         return '<span class="byok-cap-tag">' + label + '</span>';
       }).join('');
       var maskedKey = maskKey(p.apiKey);
       return '<div class="byok-provider-item" data-index="' + i + '">' +
         '<div class="byok-provider-info"><span class="byok-provider-name">' + esc(p.name) + '</span>' +
         '<span class="byok-provider-url">' + esc(p.baseUrl) + '</span>' +
         '<span class="byok-provider-key">' + maskedKey + '</span>' +
         (caps ? '<div class="byok-provider-caps">' + caps + '</div>' : '') +
         '</div>' +
         '<div class="byok-provider-actions">' +
         '<button class="byok-edit" data-action="edit" data-index="' + i + '" aria-label="Edit">✎</button>' +
         '<button class="byok-delete" data-action="delete" data-index="' + i + '" aria-label="Delete">✕</button>' +
         '</div></div>';
     }).join('');
     el.querySelectorAll('[data-action]').forEach(function (btn) {
       btn.addEventListener('click', function (e) {
         e.stopPropagation();
         var idx = parseInt(this.getAttribute('data-index'));
         if (this.getAttribute('data-action') === 'delete') deleteProvider(idx);
         else editProvider(idx);
       });
     });
   }

   function maskKey(key) {
     if (!key) return 'No key';
     if (key.length <= 8) return '••••••••';
     return key.slice(0, 4) + '••••' + key.slice(-4);
   }

   function readRateLimitHeaders(headers) {
     if (!headers) return null;
     var result = {};
     var keys = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-tokens'];
     var found = false;
     keys.forEach(function (k) {
       var v = null;
       if (typeof headers.get === 'function') { try { v = headers.get(k); } catch (e) {} }
       else if (typeof headers === 'object') { v = headers[k] || headers[k.toLowerCase()]; }
       if (v != null && v !== '') { result[k] = v; found = true; }
     });
     return found ? result : null;
   }

   function formatRateLimit(rate) {
     if (!rate) return '';
     var parts = [];
     if (rate['x-ratelimit-remaining-requests'] != null && rate['x-ratelimit-limit-requests'] != null) {
       parts.push(rate['x-ratelimit-remaining-requests'] + '/' + rate['x-ratelimit-limit-requests'] + ' req');
     }
     if (rate['x-ratelimit-remaining-tokens'] != null && rate['x-ratelimit-limit-tokens'] != null) {
       parts.push(rate['x-ratelimit-remaining-tokens'] + '/' + rate['x-ratelimit-limit-tokens'] + ' tokens');
     }
     if (rate['retry-after']) parts.push('retry after ' + rate['retry-after'] + 's');
     return parts.join(' · ');
   }

   function showStatus(ok, title, detail) {
     var el = document.getElementById('byok-status');
     if (!el) return;
     el.className = 'byok-status visible ' + (ok ? 'ok' : 'fail');
     var html = '<div class="byok-status-title">' + esc(title) + '</div>';
     if (detail) html += '<div class="byok-status-detail">' + detail + '</div>';
     el.innerHTML = html;
   }

   function clearStatus() {
     var el = document.getElementById('byok-status');
     if (el) { el.className = 'byok-status'; el.innerHTML = ''; }
   }

   /* Silent key validation: one minimal-token diagnostic call that confirms the
      key is valid, the model is accessible, and (optionally) reads rate limits. */
   function testConnection() {
     var nameEl = document.getElementById('byok-name');
     var urlEl = document.getElementById('byok-url');
     var apiKey = document.getElementById('byok-key').value.trim();
     var model = document.getElementById('byok-model').value.trim();
     var testBtn = document.getElementById('byok-test');

    /* Auto-detect from the API key if the hidden fields are not yet populated
       (user clicked Test before the debounced detection fired). */
    if ((!nameEl || !nameEl.value.trim()) && apiKey && window.MateyProviderPresets) {
      var preset = window.MateyProviderPresets.detect(apiKey);
      if (preset) {
        if (nameEl) nameEl.value = preset.name;
        if (urlEl) urlEl.value = preset.baseUrl;
        if (!model && preset.defaultModel) model = preset.defaultModel;
        (preset.capabilities || ['text']).forEach(function (c) {
          var el = document.getElementById('cap_' + c);
          if (el) el.checked = true;
        });
      }
    }

     var baseUrl = urlEl ? urlEl.value.trim() : '';
     if (!baseUrl) { showStatus(false, 'Unrecognized API key', 'Could not auto-detect the provider from this key.'); return; }
     testBtn.textContent = 'Validating…';
     testBtn.disabled = true;
     clearStatus();

      var baseLower = baseUrl.toLowerCase();
      var isGemini = baseLower.indexOf('generativelanguage') !== -1 || baseLower.indexOf('gemini') !== -1;
      var isAnthropic = baseLower.indexOf('anthropic') !== -1;

      var resolvedModel = model;
      var detectedModel = null;
      var rateLimit = null;

      function doValidate(modelToUse) {
        if (isAnthropic) {
          var anthModel = modelToUse || 'claude-3-5-sonnet-20241022';
          var url = 'https://api.anthropic.com/v1/messages';
          return nativeFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
            body: JSON.stringify({ model: anthModel, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
          }).then(function (r) {
            return r.text().then(function (t) {
              if (r.status === 401 || r.status === 403) throw new Error('Invalid API key (HTTP ' + r.status + '): ' + t.slice(0, 120));
              if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 120));
              return r.json().then(function () { return anthModel; });
            });
          });
        }
        if (isGemini) {
         var geminiModel = modelToUse || 'gemini-1.5-flash';
         var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(geminiModel) + ':generateContent';
         return nativeFetch(url, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
           body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } })
         }).then(function (r) {
           rateLimit = readRateLimitHeaders(r.headers);
           if (!r.ok) {
             return r.text().then(function (t) {
               var reason = t.slice(0, 120);
               if (r.status === 401 || r.status === 403) throw new Error('Invalid API key (HTTP ' + r.status + ')');
               if (r.status === 404) throw new Error('Model "' + geminiModel + '" not found (HTTP 404)');
               throw new Error('HTTP ' + r.status + ': ' + reason);
             });
           }
           return r.json().then(function () { return geminiModel; });
         });
       }
       var apiUrl = buildApiUrl(baseUrl, '/v1/chat/completions');
       return nativeFetch(apiUrl, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
         body: JSON.stringify({ model: modelToUse, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false })
       }).then(function (r) {
         rateLimit = readRateLimitHeaders(r.headers);
         if (!r.ok) {
           return r.text().then(function (t) {
             var reason = t.slice(0, 120);
             if (r.status === 401 || r.status === 403) throw new Error('Invalid API key (HTTP ' + r.status + ')');
             if (r.status === 404) throw new Error('Model "' + modelToUse + '" not found (HTTP 404)');
             throw new Error('HTTP ' + r.status + ': ' + reason);
           });
         }
         return r.json().then(function (j) {
           if (j.model) detectedModel = j.model;
           return modelToUse;
         });
       });
     }

     var modelPromise = model ? Promise.resolve(model) : resolveModelForProbe(baseUrl, apiKey, isGemini);
     modelPromise.then(function (m) {
       resolvedModel = m;
       return doValidate(m);
     }).then(function (validatedModel) {
       var detailLines = ['Model: <span>' + esc(validatedModel) + '</span>'];
       if (detectedModel && detectedModel !== validatedModel) detailLines.push('Server reported: <span>' + esc(detectedModel) + '</span>');
       var rl = formatRateLimit(rateLimit);
       if (rl) detailLines.push('Rate limit: <span>' + esc(rl) + '</span>');
       showStatus(true, 'Key valid — connected', detailLines.join('<br>'));
       testBtn.textContent = 'Test Connection';
       testBtn.disabled = false;
     }).catch(function (err) {
       showStatus(false, 'Validation failed', err.message || 'Unknown error');
       testBtn.textContent = 'Test Connection';
       testBtn.disabled = false;
       console.warn('[BYOK] Key validation failed:', err.message || err);
     });
   }

   /* Lightweight model detection for the probe (avoids pulling the full catalog
      when the user left the model field empty). */
   function resolveModelForProbe(baseUrl, apiKey, isGemini) {
     if (isGemini) return Promise.resolve('gemini-1.5-flash');
     var url = buildApiUrl(baseUrl, '/v1/models');
     return nativeFetch(url, { headers: apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {} })
       .then(function (r) { if (!r.ok) throw new Error('models endpoint failed'); return r.json(); })
       .then(function (j) {
         var list = (j.data || []).map(function (m) { return m.id; });
         if (!list.length) throw new Error('no models listed');
         var pref = list.filter(function (id) { return /gpt-4o|llama|mistral|claude|qwen|default/i.test(id); });
         return (pref[0] || list[0]);
       })
       .catch(function () { return 'gpt-4o-mini'; });
   }

  function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function showDialog(editingIndex) {
     var dialog = document.getElementById('byok-dialog');
     if (!dialog) return;
     var providers = load();
     var p = (editingIndex != null && editingIndex >= 0) ? providers[editingIndex] : null;
     document.getElementById('byok-name').value = p ? p.name : '';
     document.getElementById('byok-url').value = p ? p.baseUrl : '';
     document.getElementById('byok-key').value = p ? p.apiKey : '';
     var modelEl = document.getElementById('byok-model');
     if (modelEl) modelEl.value = p ? (p.model || '') : '';
     var caps = p ? (p.capabilities || []) : [];
     /* New providers default to text generation; detection refines below */
     if (!caps.length) caps = ['text'];
     ['cap_text', 'cap_vision', 'cap_stt', 'cap_imagegen'].forEach(function (id) {
       var el = document.getElementById(id);
       if (el) el.checked = caps.indexOf(el.value) !== -1;
     });
      dialog.setAttribute('data-edit-index', editingIndex != null ? editingIndex : '');
      dialog.classList.add('open');
      dialog.style.display = 'flex';
      wireAutoDetect();
    }

   /* ---- Auto-detect provider from API key ---- */
   var _detectDebounce = null;
   function wireAutoDetect() {
     var keyEl = document.getElementById('byok-key');
     if (!keyEl || keyEl.getAttribute('data-autodetect-wired') === '1') return;
     keyEl.setAttribute('data-autodetect-wired', '1');
     keyEl.addEventListener('input', function () {
       if (_detectDebounce) clearTimeout(_detectDebounce);
       var key = keyEl.value.trim();
       if (!key) { clearDetected(); return; }
       _detectDebounce = setTimeout(function () { detectAndFill(key); }, 400);
     });
   }

   function clearDetected() {
     var det = document.getElementById('byok-detected');
     if (det) { det.style.display = 'none'; det.textContent = ''; }
   }

   function detectAndFill(key) {
     var preset = window.MateyProviderPresets ? window.MateyProviderPresets.detect(key) : null;
     var det = document.getElementById('byok-detected');
     var nameEl = document.getElementById('byok-name');
     var urlEl = document.getElementById('byok-url');
     var modelSelect = document.getElementById('byok-model-select');
     var modelInput = document.getElementById('byok-model');
     var loadingEl = document.getElementById('byok-model-loading');

     if (!preset) {
       if (det) { det.style.display = 'block'; det.textContent = 'Unknown key format — enter Base URL manually'; }
       return;
     }

     if (det) { det.style.display = 'block'; det.textContent = '✓ ' + preset.name + ' detected — everything is configured automatically'; }

     /* Auto-fill name and URL only if they're empty (fields are hidden; provider details are managed silently) */
     if (nameEl && !nameEl.value.trim()) nameEl.value = preset.name;
     if (urlEl && !urlEl.value.trim()) urlEl.value = preset.baseUrl;

     /* Auto-check capabilities based on the detected provider */
     var presetCaps = preset.capabilities || ['text'];
     ['cap_text', 'cap_vision', 'cap_stt', 'cap_imagegen'].forEach(function (id) {
       var el = document.getElementById(id);
       if (el) el.checked = presetCaps.indexOf(el.value) !== -1;
     });

     /* Fetch supported models */
     if (preset.modelEndpoint && preset.parseModels) {
       if (loadingEl) { loadingEl.style.display = 'block'; loadingEl.textContent = 'Fetching models…'; }
       fetchModels(preset, key).then(function (models) {
         if (loadingEl) loadingEl.style.display = 'none';
         populateModelDropdown(models, preset, modelSelect, modelInput);
       }).catch(function () {
         if (loadingEl) loadingEl.style.display = 'none';
       });
     } else {
       /* No model endpoint — set default model */
       if (modelInput && !modelInput.value.trim() && preset.defaultModel) {
         modelInput.value = preset.defaultModel;
       }
     }
   }

   function fetchModels(preset, key) {
     var url = preset.baseUrl + preset.modelEndpoint;
     var headers = preset.authHeader ? preset.authHeader(key) : {};
     var fetchOpts = { method: 'GET', headers: headers };
     if (preset.authQueryParam) {
       url += (url.indexOf('?') === -1 ? '?' : '&') + preset.authQueryParam + '=' + encodeURIComponent(key);
     }
     return nativeFetch(url, fetchOpts).then(function (r) {
       if (!r.ok) throw new Error('models endpoint failed');
       return r.json();
     }).then(function (j) { return preset.parseModels(j); });
   }

   function populateModelDropdown(models, preset, modelSelect, modelInput) {
     if (!modelSelect || !models || !models.length) {
       if (modelSelect) modelSelect.style.display = 'none';
       if (modelInput && !modelInput.value.trim() && preset.defaultModel) modelInput.value = preset.defaultModel;
       return;
     }
     modelSelect.innerHTML = '';
     models.forEach(function (m) {
       var opt = document.createElement('option');
       opt.value = m;
       opt.textContent = m;
       modelSelect.appendChild(opt);
     });
     /* Show select, hide text input */
     modelSelect.style.display = 'block';
     if (modelInput) modelInput.style.display = 'none';
     /* Sync: when select changes, update hidden input */
     modelSelect.addEventListener('change', function () {
       if (modelInput) modelInput.value = modelSelect.value;
     });
     /* Set initial value */
     if (modelInput) modelInput.value = models[0];
   }

function hideDialog() {
     var dialog = document.getElementById('byok-dialog');
     if (dialog) {
       dialog.classList.remove('open');
       dialog.style.display = 'none';
     }
   }

   /* Ensure dialog is hidden on page load */
   if (document.readyState === 'loading') {
     document.addEventListener('DOMContentLoaded', function () {
       var dialog = document.getElementById('byok-dialog');
       if (dialog) { dialog.classList.remove('open'); dialog.style.display = 'none'; }
     });
   } else {
     var dialog = document.getElementById('byok-dialog');
     if (dialog) { dialog.classList.remove('open'); dialog.style.display = 'none'; }
   }

   function saveProvider(e) {
    e.preventDefault();
    var dialog = document.getElementById('byok-dialog');
    var name = document.getElementById('byok-name').value.trim();
    var baseUrl = document.getElementById('byok-url').value.trim();
    var apiKey = document.getElementById('byok-key').value.trim();
    var modelEl = document.getElementById('byok-model');
    var model = modelEl ? modelEl.value.trim() : '';

    /* 100% auto-detect: if the hidden fields were never filled (user typed a key
       and hit Save before the debounced detection ran), resolve everything from
       the API key now. No manual input is ever required. */
    var preset = window.MateyProviderPresets ? window.MateyProviderPresets.detect(apiKey) : null;
    if (!name || !baseUrl) {
      if (!preset) {
        if (window.AgentToast) {
          window.AgentToast.show('Unrecognized API key format. Could not auto-detect the provider.', true);
        } else {
          console.error('Unrecognized API key format. Could not auto-detect the provider.');
        }
        return;
      }
      if (!name) name = preset.name;
      if (!baseUrl) baseUrl = preset.baseUrl;
      /* Reflect detection in the capability checkboxes */
      var presetCaps = preset.capabilities || ['text'];
      presetCaps.forEach(function (c) {
        var el = document.getElementById('cap_' + c);
        if (el) el.checked = true;
      });
    }
    /* Final model fallback: use the detected preset's default model if the
       models-list fetch failed or never ran */
    if (!model && preset && preset.defaultModel) model = preset.defaultModel;

    var caps = [];
    ['cap_text', 'cap_vision', 'cap_stt', 'cap_imagegen'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.checked) caps.push(el.value);
    });
      baseUrl = cleanBaseUrl(baseUrl);
     var providers = load();
    var editIdx = dialog.getAttribute('data-edit-index');
    var entry = { name: name, baseUrl: baseUrl, apiKey: apiKey, model: model, capabilities: caps };
    if (editIdx !== '' && editIdx !== null) {
      providers[parseInt(editIdx)] = entry;
    } else {
      providers.push(entry);
    }
    save(providers);
    hideDialog();
    renderList();
  }

  function deleteProvider(idx) {
    if (!window.confirm('Remove this provider?')) return;
    var providers = load();
    providers.splice(idx, 1);
    save(providers);
    renderList();
  }

  function editProvider(idx) { showDialog(idx); }

  function init() {
    migrateLegacyProviders();
    renderList();
    wireDynamic();
  }

  function wireDynamic() {
    var addBtn = document.getElementById('byok-add');
    if (addBtn) addBtn.addEventListener('click', function () { showDialog(null); });
    var cancelBtn = document.getElementById('byok-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', hideDialog);
    var form = document.getElementById('byok-form');
    if (form) form.addEventListener('submit', saveProvider);
    var testBtn = document.getElementById('byok-test');
    if (testBtn) testBtn.addEventListener('click', testConnection);
    var clearBtn = document.getElementById('byok-clear-credentials');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      if (!window.confirm('Clear all saved provider credentials? This cannot be undone.')) return;
      _providersCache = [];
      if (_providersDB) {
        try { _providersDB.transaction('kv', 'readwrite').objectStore('kv').delete(KEY); } catch (e) {}
      }
      try { localStorage.removeItem('matey-providers'); } catch (e) {}
      try { localStorage.removeItem('matey_gemini_key'); } catch (e) {}
      try { localStorage.removeItem('matey_openai_key'); } catch (e) {}
      if (window.AgentToast) { window.AgentToast.show('All provider credentials cleared.', false); } else { console.log('All provider credentials cleared.'); };
      renderList();
    });
    var backdrop = document.getElementById('byok-dialog');
    if (backdrop) backdrop.addEventListener('click', function (e) { if (e.target === backdrop) hideDialog(); });
  }

  function resolveModel(p) {
    if (p.model) return Promise.resolve(p.model);
    /* BazaarLink auto-router: "auto" (paid) or "auto:free" (free, no credits needed) */
    if (p.baseUrl && p.baseUrl.indexOf('api.bazaarlink.ai') !== -1) {
      console.log('[BazaarLink] Using auto:free router for model resolution');
      return Promise.resolve('auto:free');
    }
    var url = buildApiUrl(p.baseUrl, '/v1/models');
    return nativeFetch(url, { headers: p.apiKey ? { 'Authorization': 'Bearer ' + p.apiKey } : {} })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var list = (j.data || []).map(function (m) { return m.id; });
        if (!list.length) throw new Error('No models available');
        var pref = list.filter(function (id) { return /gpt-4o|llama|mistral|gemini|claude|qwen|default/i.test(id); });
        return (pref[0] || list[0]);
      });
  }

  function convertMessages(messages) {
    return messages.map(function (msg) {
      if (!msg.content || !Array.isArray(msg.content)) return msg;
      var converted = [];
      msg.content.forEach(function (block) {
        if (block.type === 'image' && block.source && block.source.type === 'base64') {
          converted.push({
            type: 'image_url',
            image_url: {
              url: 'data:' + (block.source.media_type || 'image/jpeg') + ';base64,' + block.source.data
            }
          });
        } else {
          converted.push(block);
        }
      });
      return { role: msg.role, content: converted };
    });
  }

   /* Gemini API — clean vanilla JS REST fetch implementation.
      Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent (auth via x-goog-api-key header)
      Body schema: {"contents":[{"parts":[{"text":userPrompt}]}]} */
  function sendToGemini(apiKey, userPrompt) {
    var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    var body = JSON.stringify({
      contents: [{
        parts: [{ text: userPrompt }]
      }]
    });
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: body
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = 'HTTP ' + r.status + ': ' + t.slice(0, 120);
          if (r.status === 401 || r.status === 403) {
            throw new Error('Invalid API Key: ' + msg);
          }
          throw new Error(msg);
        });
      }
      return r.json();
    }).then(function (j) {
      var txt = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
      if (!txt) throw new Error('Empty response from Gemini API');
      return txt;
    }).catch(function (err) {
      if (err.message && err.message.indexOf('Failed to fetch') !== -1) {
        throw new Error('Network Error: Failed to fetch — check API key or network connectivity');
      }
      throw err;
    });
  }

  /* Route a request through the appropriate provider API.
     Detects Gemini (generativelanguage) providers and uses Gemini format,
     otherwise uses OpenAI-compatible /v1/chat/completions with tool calling.
     Returns a message object with { role, content, tool_calls } */
  function routeRequest(opts) {
    var capability = opts.capability;
    var messages = opts.messages;
    var tools = opts.tools;
    var toolChoice = opts.toolChoice;
    var timeoutMs = opts.timeoutMs || 30000;

    var p = MateyByok_instance.getProvider(capability);
    if (!p) {
      return MateyByok_instance.resolveProvider(capability).then(function (resolved) {
        return doRouteRequest(resolved, capability, messages, tools, toolChoice, timeoutMs);
      });
    }
    return doRouteRequest(p, capability, messages, tools, toolChoice, timeoutMs);
  }

  var MateyByok_instance = null;
  function doRouteRequest(p, capability, messages, tools, toolChoice, timeoutMs) {
    var baseLower = (p.baseUrl || '').toLowerCase();
    var isGemini = baseLower.indexOf('generativelanguage') !== -1 || baseLower.indexOf('gemini') !== -1;

    if (isGemini) {
      return doGeminiRequest(p, messages, timeoutMs);
    }

    /* OpenAI-compatible request with tool calling */
    var apiUrl = buildApiUrl(p.baseUrl, '/v1/chat/completions');
    var converted = convertMessages(messages);
    return resolveModel(p).then(function (model) {
      var body = { model: model, messages: converted, stream: false };
      if (tools && tools.length) {
        body.tools = tools;
        if (toolChoice) body.tool_choice = toolChoice;
      }
      /* Stage 5: AbortController-based timeout */
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(new Error('Request timed out after ' + timeoutMs + 'ms')); }, timeoutMs);
      return nativeFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal
      }).finally(function () { clearTimeout(timer); });
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        if (r.status === 401) throw new Error('Authentication failed (401): Invalid API key');
        throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
      });
      return r.json();
    }).then(function (j) {
      if (!j.choices || !j.choices.length) throw new Error('Empty response from provider');
      return j.choices[0].message;
    });
  }

  /* Gemini request — converts OpenAI-format messages to Gemini format */
  function doGeminiRequest(p, messages, timeoutMs) {
    var model = p.model || 'gemini-1.5-flash';
    var apiKey = p.apiKey;
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';

    /* Convert messages to Gemini contents format */
    var systemParts = [];
    var contents = [];
    messages.forEach(function (msg) {
      if (msg.role === 'system') {
        systemParts.push({ text: msg.content });
      } else if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content }] });
      } else if (msg.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: msg.content || '(analyzing...)' }] });
      } else if (msg.role === 'tool') {
        systemParts.push({ text: 'Tool result: ' + JSON.stringify(msg.content || msg.content) });
      }
    });

    /* Merge system prompt into first user message */
    if (systemParts.length > 0 && contents.length > 0) {
      var firstUser = contents[0];
      if (firstUser.role === 'user') {
        firstUser.parts = [{ text: systemParts.map(function (s) { return s.text; }).join('\n\n') + '\n\n' + (firstUser.parts[0].text || '') }];
      } else {
        contents.unshift({ role: 'user', parts: systemParts });
      }
    }

    var body = {
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    };

    /* Stage 5: AbortController-based timeout */
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(new Error('Request timed out after ' + timeoutMs + 'ms')); }, timeoutMs);
    return nativeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal
    }).finally(function () { clearTimeout(timer); }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        if (r.status === 401) throw new Error('Authentication failed (401): Invalid API key');
        throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
      });
      return r.json();
    }).then(function (j) {
      if (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0]) {
        var text = j.candidates[0].content.parts[0].text;
        /* Return in OpenAI message format for consistency */
        return { role: 'assistant', content: text, tool_calls: null };
      }
      throw new Error('Empty response from Gemini API');
    });
  }

  /* Create a persistent instance reference for internal use before window.MateyByok is set */
  var MateyByok_instance = { getProvider: null, resolveProvider: null };
  function initInstanceRef() {
    _providersOpenDB();
    MateyByok_instance.getProvider = function(cap) {
      var providers = load();
      if (providers.length > 0) {
        if (!cap) return providers[0];
        var normCap = cap.replace ? cap.replace(/-gen$/, '') : cap;
        for (var i = 0; i < providers.length; i++) {
          var caps = providers[i].capabilities || [];
          if (caps.indexOf(cap) !== -1 || (normCap && caps.indexOf(normCap) !== -1)) return providers[i];
        }
        for (var j = 0; j < providers.length; j++) {
          var caps2 = providers[j].capabilities || [];
          if (!caps2.length) return providers[j];
        }
        return providers[0];
      }
      return null;
    };
    MateyByok_instance.resolveProvider = function(cap) {
      var p = MateyByok_instance.getProvider(cap);
      if (p) return Promise.resolve(p);
      return ensureProvider().then(function (result) {
        if (result) return result;
        return Promise.reject('No provider configured for capability: ' + cap);
      });
    };
   }
   if (typeof window !== 'undefined') {
     if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initInstanceRef);
     else initInstanceRef();
   }

    window.MateyByok = {
      load: load,
    hasProviders: function () { return load().length > 0; },
      getProvider: function (capability) {
        var providers = load();
        if (providers.length > 0) {
          if (!capability) return providers[0];
          var normCap = capability.replace ? capability.replace(/-gen$/, '') : capability;
          for (var i = 0; i < providers.length; i++) {
            var caps = providers[i].capabilities || [];
            if (caps.indexOf(capability) !== -1 || (normCap && caps.indexOf(normCap) !== -1)) return providers[i];
          }
          for (var j = 0; j < providers.length; j++) {
            var caps2 = providers[j].capabilities || [];
            if (!caps2.length) return providers[j];
          }
          return providers[0];
        }
        return null;
      },
    resolveProvider: function (capability) {
      var p = this.getProvider(capability);
      if (p) return Promise.resolve(p);
      return ensureProvider().then(function (result) {
        if (result) return result;
        return Promise.reject('No provider configured for capability: ' + capability);
      });
    },
    autoRegister: autoRegisterAgent,
    chat: function (messages) {
      return this.send('text', messages);
    },
     chatVision: function (messages) {
       return this.sendVision('vision', messages);
     },
        send: function (capability, messages) {
          var self = this;
          var p = this.getProvider(capability);
          if (!p) {
            return this.resolveProvider(capability).then(function (resolved) {
              return self._doSend(resolved, capability, messages);
            });
          }
          return this._doSend(p, capability, messages);
        },
        _doSend: function (p, capability, messages) {
          var apiUrl = buildApiUrl(p.baseUrl, '/v1/chat/completions');
         var converted = convertMessages(messages);
         return resolveModel(p).then(function (model) {
           return nativeFetch(apiUrl, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
             body: JSON.stringify({ model: model, messages: converted, stream: false })
           }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 120)); });
            return r.json();
           });
         }).then(function (j) {
          var txt = j && j.choices && j.choices[0] && (j.choices[0].message && j.choices[0].message.content);
          if (!txt) throw new Error('Empty response from provider');
          return txt;
        }).catch(function (err) {
          if (err.message && err.message.indexOf('Failed to fetch') !== -1) {
            throw new Error('Failed to fetch: check URL/key or network. URL=' + apiUrl);
          }
          throw err;
        });
       },
       sendVision: function (capability, messages) {
         var self = this;
         var p = this.getProvider(capability || 'vision');
         if (!p) {
           return this.resolveProvider(capability || 'vision').then(function (resolved) {
             return self._doSendVision(resolved, capability || 'vision', messages);
           });
         }
         return this._doSendVision(p, capability || 'vision', messages);
       },
       _doSendVision: function (p, capability, messages) {
         var apiUrl = buildApiUrl(p.baseUrl, '/v1/chat/completions');
         var converted = convertMessages(messages);
         return resolveModel(p).then(function (model) {
           return nativeFetch(apiUrl, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
           body: JSON.stringify({ model: model, messages: converted, stream: false })
         }).then(function (r) {
           if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 120)); });
           return r.json();
         });
       }).then(function (j) {
         var txt = j && j.choices && j.choices[0] && (j.choices[0].message && j.choices[0].message.content);
         if (!txt) throw new Error('Empty response from provider');
         return txt;
       }).catch(function (err) {
         if (err.message && err.message.indexOf('Failed to fetch') !== -1) {
           throw new Error('Failed to fetch: check URL/key or network. URL=' + apiUrl);
         }
         throw err;
       });
     },
      render: renderList,
      wireDynamic: wireDynamic,
      sendToGemini: sendToGemini,
      routeRequest: routeRequest,
      buildApiUrl: buildApiUrl,
      nativeFetch: nativeFetch,
      migrateLegacyProviders: migrateLegacyProviders,
      maskKey: maskKey,
      clearAll: function () {
        try { localStorage.removeItem('matey-providers'); } catch (e) {}
        try { localStorage.removeItem('matey_gemini_key'); } catch (e) {}
        try { localStorage.removeItem('matey_openai_key'); } catch (e) {}
        if (typeof renderList === 'function') renderList();
      }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

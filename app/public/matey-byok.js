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

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }

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

  function testConnection() {
    var name = document.getElementById('byok-name').value.trim();
    var baseUrl = cleanBaseUrl(document.getElementById('byok-url').value);
    var apiKey = document.getElementById('byok-key').value.trim();
    var testBtn = document.getElementById('byok-test');
    if (!baseUrl) return;
    testBtn.textContent = 'Testing…';
    testBtn.disabled = true;
    nativeFetch(buildApiUrl(baseUrl, '/v1/models'), {
      method: 'GET',
      headers: apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {}
    }).then(function (r) {
      if (r.ok) return r.json().then(function () { return '✅ Connected'; });
      return r.text().then(function (t) { throw new Error(t.slice(0,80)); });
    }).then(function (msg) {
      testBtn.textContent = msg;
      testBtn.style.color = '#22c55e';
    }).catch(function (err) {
      testBtn.textContent = '❌ Failed';
      testBtn.style.color = '#f87171';
      console.warn('BYOK test:', err.message || err);
    }).finally(function () {
      setTimeout(function () {
        testBtn.textContent = 'Test';
        testBtn.style.color = '';
        testBtn.disabled = false;
      }, 2500);
    });
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
    ['cap_text', 'cap_vision', 'cap_stt', 'cap_imagegen'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.checked = caps.indexOf(el.value) !== -1;
    });
    dialog.setAttribute('data-edit-index', editingIndex != null ? editingIndex : '');
    dialog.classList.add('open');
  }

  function hideDialog() {
    var dialog = document.getElementById('byok-dialog');
    if (dialog) dialog.classList.remove('open');
  }

   function saveProvider(e) {
    e.preventDefault();
    var dialog = document.getElementById('byok-dialog');
    var name = document.getElementById('byok-name').value.trim();
    var baseUrl = document.getElementById('byok-url').value.trim();
    var apiKey = document.getElementById('byok-key').value.trim();
    var modelEl = document.getElementById('byok-model');
    var model = modelEl ? modelEl.value.trim() : '';
    var caps = [];
    ['cap_text', 'cap_vision', 'cap_stt', 'cap_imagegen'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.checked) caps.push(el.value);
    });
      if (!name || !baseUrl) return;
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
    if (!confirm('Remove this provider?')) return;
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
      if (!confirm('Clear all saved provider credentials? This cannot be undone.')) return;
      try { localStorage.removeItem('matey-providers'); } catch (e) {}
      try { localStorage.removeItem('matey_gemini_key'); } catch (e) {}
      try { localStorage.removeItem('matey_openai_key'); } catch (e) {}
      alert('All provider credentials cleared.');
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
      Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}
      Body schema: {"contents":[{"parts":[{"text":userPrompt}]}]} */
  function sendToGemini(apiKey, userPrompt) {
    var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
    var body = JSON.stringify({
      contents: [{
        parts: [{ text: userPrompt }]
      }]
    });
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      return nativeFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
        body: JSON.stringify(body)
      });
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
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);

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

    return nativeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
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

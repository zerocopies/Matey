/* Matey BYOK — Custom Provider Manager */
(function () {
  'use strict';
  var KEY = 'matey-providers';

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }

   function renderList() {
    var el = document.getElementById('byok-list');
    if (!el) return;
    var providers = load();
    if (!providers.length) { el.innerHTML = '<p class="byok-empty">No custom providers configured.</p>'; return; }
    el.innerHTML = providers.map(function (p, i) {
      var caps = (p.capabilities || []).map(function (c) {
        var label = { text: 'Text', vision: 'Vision', stt: 'Speach', imagegen: 'Image Gen' }[c] || c;
        return '<span class="byok-cap-tag">' + label + '</span>';
      }).join('');
      return '<div class="byok-provider-item" data-index="' + i + '">' +
        '<div class="byok-provider-info"><span class="byok-provider-name">' + esc(p.name) + '</span>' +
        '<span class="byok-provider-url">' + esc(p.baseUrl) + '</span>' +
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

  function testConnection() {
    var name = document.getElementById('byok-name').value.trim();
    var baseUrl = document.getElementById('byok-url').value.trim();
    var apiKey = document.getElementById('byok-key').value.trim();
    var testBtn = document.getElementById('byok-test');
    if (!baseUrl) return;
    testBtn.textContent = 'Testing…';
    testBtn.disabled = true;
    fetch(baseUrl + '/v1/models', {
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
     baseUrl = baseUrl.replace(/\/+$/, '');
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
    var backdrop = document.getElementById('byok-dialog');
    if (backdrop) backdrop.addEventListener('click', function (e) { if (e.target === backdrop) hideDialog(); });
  }

  function resolveModel(p) {
    if (p.model) return Promise.resolve(p.model);
    var url = (p.baseUrl.replace(/\/+$/, '') || '') + '/v1/models';
    return fetch(url, { headers: p.apiKey ? { 'Authorization': 'Bearer ' + p.apiKey } : {} })
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

   window.MateyByok = {
    load: load,
    hasProviders: function () { return load().length > 0; },
     getProvider: function (capability) {
       var providers = load();
       if (!providers.length) return null;
       for (var i = 0; i < providers.length; i++) {
         var caps = providers[i].capabilities || [];
         if (caps.indexOf(capability) !== -1) return providers[i];
       }
       for (var j = 0; j < providers.length; j++) {
         var caps2 = providers[j].capabilities || [];
         if (!caps2.length) return providers[j];
       }
       return providers[0];
     },
    resolveProvider: function (capability) {
      var p = this.getProvider(capability);
      if (!p) return Promise.reject('No provider configured for capability: ' + capability);
      return p;
    },
    chat: function (messages) {
      return this.send('text', messages);
    },
     chatVision: function (messages) {
       return this.sendVision('vision', messages);
     },
      send: function (capability, messages) {
        var p = this.getProvider(capability);
        if (!p) return Promise.reject('No provider configured for: ' + capability + '. Add one in Settings → Custom.');
        if (!p.apiKey) return Promise.reject('No API key configured for provider: ' + p.name + '. Check Settings → BYOK.');
        var baseUrl = (p.baseUrl || '').replace(/\/+$/, '');
        var apiUrl = baseUrl + '/v1/chat/completions';
        var converted = convertMessages(messages);
        return resolveModel(p).then(function (model) {
          return fetch(apiUrl, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
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
         if (err.message === 'Failed to fetch') {
           throw new Error('Failed to fetch: check URL/key or network. URL=' + apiUrl);
         }
         throw err;
       });
      },
      sendVision: function (capability, messages) {
        var p = this.getProvider(capability || 'vision');
        if (!p) return Promise.reject('No vision provider configured. Add one in Settings → Custom (enable Vision capability).');
        if (!p.apiKey) return Promise.reject('No API key configured for provider: ' + p.name + '. Check Settings → BYOK.');
        var baseUrl = (p.baseUrl || '').replace(/\/+$/, '');
        var apiUrl = baseUrl + '/v1/chat/completions';
        var converted = convertMessages(messages);
        return resolveModel(p).then(function (model) {
          return fetch(apiUrl, {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
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
        if (err.message === 'Failed to fetch') {
          throw new Error('Failed to fetch: check URL/key or network. URL=' + apiUrl);
        }
        throw err;
      });
    },
    render: renderList,
    wireDynamic: wireDynamic
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

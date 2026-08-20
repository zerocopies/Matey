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
      return '<div class="byok-provider-item" data-index="' + i + '">' +
        '<div class="byok-provider-info"><span class="byok-provider-name">' + esc(p.name) + '</span>' +
        '<span class="byok-provider-url">' + esc(p.baseUrl) + '</span></div>' +
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
    var p = editingIndex != null && editingIndex >= 0 ? providers[editingIndex] : null;
    document.getElementById('byok-name').value = p ? p.name : '';
    document.getElementById('byok-url').value = p ? p.baseUrl : '';
    document.getElementById('byok-key').value = p ? p.apiKey : '';
    var modelEl = document.getElementById('byok-model');
    if (modelEl) modelEl.value = p ? (p.model || '') : '';
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
    if (!name || !baseUrl) return;
    var providers = load();
    var editIdx = dialog.getAttribute('data-edit-index');
    var entry = { name: name, baseUrl: baseUrl, apiKey: apiKey, model: model };
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
    return fetch(p.baseUrl + '/v1/models', { headers: p.apiKey ? { 'Authorization': 'Bearer ' + p.apiKey } : {} })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var list = (j.data || []).map(function (m) { return m.id; });
        if (!list.length) throw new Error('No models available');
        var pref = list.filter(function (id) { return /gpt-4o|llama|mistral|gemini|claude|qwen|default/i.test(id); });
        return (pref[0] || list[0]);
      });
  }

  window.MateyByok = {
    load: load,
    hasProviders: function () { return load().length > 0; },
    send: function (providerId, messages) {
      var providers = load();
      if (providerId < 0 || providerId >= providers.length) return Promise.reject('Provider not found');
      var p = providers[providerId];
      return resolveModel(p).then(function (model) {
        return fetch(p.baseUrl + '/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
          body: JSON.stringify({ model: model, messages: messages, stream: false })
        }).then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 120)); });
          return r.json();
        });
      });
    },
    chat: function (messages) {
      var providers = load();
      if (!providers.length) return Promise.reject('No provider configured. Add one in Settings → Custom.');
      return this.send(0, messages).then(function (j) {
        var txt = j && j.choices && j.choices[0] && (j.choices[0].message && j.choices[0].message.content);
        if (!txt) throw new Error('Empty response from provider');
        return txt;
      });
    },
    render: renderList
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

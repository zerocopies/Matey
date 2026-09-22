/* Matey Vault — Unified library overlay for all Matey data */
var MateyVault = (function () {
  'use strict';

  var VAULT_DB_NAME = 'matey-vault';
  var VAULT_DB_VERSION = 1;
  var VAULT_STORE = 'vault_items';
  var VAULT_PIN_KEY = 'matey-vault-pin';
  var VAULT_SESSION_KEY = 'matey-vault-session';
  var VAULT_SESSION_DURATION = 5 * 60 * 1000;

  var _db = null;
  var _currentFolder = null;
  var _selectedIds = new Set();
  var _allItems = [];
  var _pinVerified = false;

  function _openAgentChatDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('matey-chats', 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function _openIDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(VAULT_STORE)) {
          var store = db.createObjectStore(VAULT_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('folder', 'folder', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function _tx(mode) {
    if (!_db) return null;
    try { return _db.transaction(VAULT_STORE, mode).objectStore(VAULT_STORE); }
    catch (e) { return null; }
  }

  function _reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function _txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error('tx aborted')); };
      tx.onabort = function () { reject(tx.error || new Error('tx aborted')); };
    });
  }

  async function _ensureDB() {
    if (_db) return _db;
    try { return await _openIDB(); }
    catch (e) { console.warn('[MateyVault] IDB open failed:', e); return null; }
  }

  function _isPinSet() {
    try { return !!localStorage.getItem(VAULT_PIN_KEY); }
    catch (_) { return false; }
  }

  function _setPin(pin) {
    try { localStorage.setItem(VAULT_PIN_KEY, pin); } catch (_) {}
  }

  function _verifyPin(pin) {
    try { return pin === localStorage.getItem(VAULT_PIN_KEY); }
    catch (_) { return false; }
  }

  function _checkSession() {
    try {
      var raw = localStorage.getItem(VAULT_SESSION_KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      return s.unlocked && s.expires > Date.now();
    } catch (_) { return false; }
  }

  function _setSession(unlocked) {
    try {
      localStorage.setItem(VAULT_SESSION_KEY, JSON.stringify({
        unlocked: unlocked,
        expires: Date.now() + VAULT_SESSION_DURATION
      }));
    } catch (_) {}
  }

  async function saveItem(item) {
    var db = await _ensureDB();
    if (!db) return null;
    try {
      var store = _tx('readwrite');
      if (!store) return null;
      var req = store.put(item);
      return await _reqToPromise(req);
    } catch (e) { return null; }
  }

  async function getItemsByFolder(folder) {
    var db = await _ensureDB();
    if (!db) return [];
    try {
      var store = _tx('readonly');
      if (!store) return [];
      var idx = store.index('folder');
      var req = idx.getAll(folder);
      return await _reqToPromise(req) || [];
    } catch (e) { return []; }
  }

  async function deleteItem(id) {
    var db = await _ensureDB();
    if (!db) return;
    try {
      var store = _tx('readwrite');
      if (!store) return;
      store.delete(id);
      await _txDone(store.transaction);
    } catch (e) {}
  }

  async function toggleStar(id) {
    var db = await _ensureDB();
    if (!db) return false;
    try {
      var store = _tx('readwrite');
      if (!store) return false;
      var getReq = store.get(id);
      var record = await _reqToPromise(getReq);
      if (!record) return false;
      record.isStarred = !record.isStarred;
      var putReq = store.put(record);
      await _reqToPromise(putReq);
      return record.isStarred;
    } catch (e) { return false; }
  }

  /* ---- UI Rendering ---- */

  function createOverlay() {
    var existing = document.getElementById('matey-vault-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'matey-vault-overlay';
    overlay.innerHTML = '\
      <div id="matey-vault-backdrop"></div>\
      <div id="matey-vault-container">\
        <div id="matey-vault-header">\
          <h2 id="matey-vault-title">Vault</h2>\
          <button id="matey-vault-close" type="button">&times;</button>\
        </div>\
        <div id="matey-vault-body"></div>\
      </div>\
      <div id="matey-vault-pin-overlay" style="display:none;">\
        <div id="matey-vault-pin-backdrop"></div>\
        <div id="matey-vault-pin-dialog">\
          <div id="matey-vault-pin-title">Enter PIN</div>\
          <div id="matey-vault-pin-display"></div>\
          <div id="matey-vault-pin-keys"></div>\
        </div>\
      </div>\
      <div id="matey-vault-action-bar" style="display:none;">\
        <button id="vault-action-rename" type="button">✏️ Rename</button>\
        <button id="vault-action-delete" type="button">🗑️ Delete</button>\
        <button id="vault-action-download" type="button">⬇️ Download</button>\
        <button id="vault-action-share" type="button">🔗 Share</button>\
      </div>';
    document.body.appendChild(overlay);

    document.getElementById('matey-vault-close').addEventListener('click', closeVault);
    document.getElementById('matey-vault-backdrop').addEventListener('click', closeVault);
    document.getElementById('matey-vault-pin-backdrop').addEventListener('click', () => hidePinOverlay());
  }

  function showDashboard() {
    var body = document.getElementById('matey-vault-body');
    if (!body) return;
    document.getElementById('matey-vault-title').textContent = 'Vault';
    document.getElementById('matey-vault-action-bar').style.display = 'none';
    _selectedIds.clear();

    var folders = [
      { id: 'lifestyle', icon: '📁', label: 'Lifestyle', desc: 'Wardrobe, Culinary, Grooming, Living' },
      { id: 'editor', icon: '📁', label: 'Text Editor', desc: 'Markdown documents' },
      { id: 'journal', icon: '📁', label: 'Journal', desc: 'Diary entries' },
      { id: 'vots', icon: '📁', label: 'My Words', desc: 'VOTS entries' },
      { id: 'agent', icon: '📁', label: 'Agent', desc: 'Chat sessions' },
      { id: 'coach', icon: '📁', label: 'Coach Tips', desc: 'Saved coaching tips' }
    ];

    var html = '<div class="vault-folder-grid">';
    folders.forEach(function (f) {
      html += '<div class="vault-folder-card" data-folder="' + f.id + '">' +
        '<div class="vault-folder-icon">' + f.icon + '</div>' +
        '<div class="vault-folder-label">' + f.label + '</div>' +
        '<div class="vault-folder-desc">' + f.desc + '</div>' +
        '</div>';
    });
    html += '</div>';
    body.innerHTML = html;

    body.querySelectorAll('.vault-folder-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var folder = card.getAttribute('data-folder');
        openFolder(folder);
      });
    });
  }

  async function openFolder(folder) {
    if (_isPinSet() && !_pinVerified && !_checkSession()) {
      showPinOverlay(folder);
      return;
    }
    _pinVerified = true;
    _setSession(true);
    await renderFolderList(folder);
  }

  function showPinOverlay(folder) {
    var overlay = document.getElementById('matey-vault-pin-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    _pinPendingFolder = folder;
    renderPinKeys();
  }

  function hidePinOverlay() {
    var overlay = document.getElementById('matey-vault-pin-overlay');
    if (overlay) overlay.style.display = 'none';
    _pinPendingFolder = null;
  }

  var _pinPendingFolder = null;
  var _pinInput = '';

  function renderPinKeys() {
    var display = document.getElementById('matey-vault-pin-display');
    var keysContainer = document.getElementById('matey-vault-pin-keys');
    if (!display || !keysContainer) return;

    display.textContent = _pinInput;
    keysContainer.innerHTML = '';
    var keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'];
    keys.forEach(function (k) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vault-pin-key';
      if (k === '') {
        btn.disabled = true;
      } else if (k === '⌫') {
        btn.textContent = '⌫';
        btn.addEventListener('click', () => {
          _pinInput = _pinInput.slice(0, -1);
          renderPinKeys();
        });
      } else {
        btn.textContent = k;
        btn.addEventListener('click', () => {
          if (_pinInput.length < 4) {
            _pinInput += k;
            renderPinKeys();
            if (_pinInput.length === 4) {
              setTimeout(() => verifyPinAndOpen(_pinPendingFolder), 200);
            }
          }
        });
      }
      keysContainer.appendChild(btn);
    });
  }

  async function verifyPinAndOpen(folder) {
    if (_verifyPin(_pinInput)) {
      _pinVerified = true;
      _setSession(true);
      hidePinOverlay();
      _pinInput = '';
      await renderFolderList(folder);
    } else {
      var display = document.getElementById('matey-vault-pin-display');
      if (display) {
        display.style.color = '#F87171';
        setTimeout(() => { display.style.color = ''; }, 600);
      }
      _pinInput = '';
      setTimeout(renderPinKeys, 300);
    }
  }

  async function renderFolderList(folder) {
    var body = document.getElementById('matey-vault-body');
    if (!body) return;
    _currentFolder = folder;
    _selectedIds.clear();
    document.getElementById('matey-vault-action-bar').style.display = 'none';

    var folderNames = {
      lifestyle: 'Lifestyle', editor: 'Text Editor', journal: 'Journal',
      vots: 'My Words', agent: 'Agent', coach: 'Coach Tips'
    };
    document.getElementById('matey-vault-title').textContent = folderNames[folder] || folder;

    var items = [];
    try {
      if (folder === 'lifestyle') {
        items = await loadLifestyleItems();
      } else if (folder === 'editor') {
        items = await loadEditorItems();
      } else if (folder === 'journal') {
        items = await loadJournalItems();
      } else if (folder === 'vots') {
        items = await loadVotsItems();
      } else if (folder === 'agent') {
        items = await loadAgentItems();
      } else if (folder === 'coach') {
        items = await loadCoachItems();
      }
    } catch (e) {
      items = [];
    }

    _allItems = items;
    renderItemList(items, folder);
  }

  async function loadLifestyleItems() {
    var items = [];
    try {
      var wardrobe = JSON.parse(localStorage.getItem('matey-wardrobe-items') || '[]');
      wardrobe.forEach(function (w, i) {
        items.push({ id: 'lifestyle-wardrobe-' + i, folder: 'lifestyle', title: w.name || 'Wardrobe Item', type: 'wardrobe', data: w, createdAt: w.id || Date.now() });
      });
      var culinary = JSON.parse(localStorage.getItem('matey-culinary-prefs') || '{}');
      if (Object.keys(culinary).length) {
        items.push({ id: 'lifestyle-culinary', folder: 'lifestyle', title: 'Culinary Preferences', type: 'culinary', data: culinary, createdAt: Date.now() });
      }
      var grooming = JSON.parse(localStorage.getItem('matey-grooming-likes') || '[]');
      if (grooming.length) {
        items.push({ id: 'lifestyle-grooming', folder: 'lifestyle', title: 'Grooming Likes', type: 'grooming', data: grooming, createdAt: Date.now() });
      }
    } catch (e) {}
    return items;
  }

  async function loadEditorItems() {
    try {
      var text = localStorage.getItem('matey-markdown') || '';
      if (!text) return [];
      return [{ id: 'editor-current', folder: 'editor', title: 'Current Document', type: 'markdown', data: { content: text }, createdAt: Date.now() }];
    } catch (e) { return []; }
  }

  async function loadJournalItems() {
    try {
      var journals = await MateyJournal.getAllJournals();
      var items = [];
      journals.forEach(function (j) {
        items.push({ id: 'journal-' + j.id, folder: 'journal', title: j.name || 'Untitled Journal', type: 'journal', data: j, createdAt: j.createdAt || Date.now() });
      });
      return items;
    } catch (e) { return []; }
  }

  async function loadVotsItems() {
    try {
      var db = await _ensureDB();
      if (!db) return [];
      var store = _tx('readonly');
      if (!store) return [];
      var idx = store.index('folder');
      var req = idx.getAll('vots');
      return await _reqToPromise(req) || [];
    } catch (e) { return []; }
  }

  async function loadAgentItems() {
    try {
      var db = await _openAgentChatDB();
      if (!db) return [];
      var tx = db.transaction('sessions', 'readonly');
      var store = tx.objectStore('sessions');
      var req = store.getAll();
      var sessions = await new Promise(function (resolve, reject) {
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
      });
      return sessions.map(function (s) {
        return { id: 'agent-' + s.id, folder: 'agent', title: s.title || 'Untitled Chat', type: 'agent', data: s, createdAt: s.createdAt || Date.now() };
      });
    } catch (e) { return []; }
  }

  async function loadCoachItems() {
    try {
      if (window.mateyCoach && typeof window.mateyCoach.db && window.mateyCoach.db.getAllTips) {
        var tips = await window.mateyCoach.db.getAllTips();
        return tips.map(function (t, i) {
          return { id: 'coach-' + (t.id || i), folder: 'coach', title: 'Tip #' + (i + 1), type: 'coach', data: t, createdAt: t.createdAt || Date.now() };
        });
      }
    } catch (e) {}
    return [];
  }

  function renderItemList(items, folder) {
    var body = document.getElementById('matey-vault-body');
    if (!body) return;

    var html = '<div class="vault-list-header">' +
      '<label class="vault-select-all"><input type="checkbox" id="vault-select-all" /> Select All</label>' +
      '<span class="vault-item-count">' + items.length + ' items</span>' +
      '</div>' +
      '<div class="vault-item-list">';

    if (!items.length) {
      html += '<div class="vault-empty">No items in this folder</div>';
    } else {
      items.forEach(function (item) {
        html += '<div class="vault-item" data-id="' + item.id + '">' +
          '<input type="checkbox" class="vault-item-check" data-id="' + item.id + '" />' +
          '<div class="vault-item-icon">' + getItemIcon(item.type) + '</div>' +
          '<div class="vault-item-info">' +
            '<div class="vault-item-title">' + escapeHtml(item.title) + '</div>' +
            '<div class="vault-item-meta">' + new Date(item.createdAt).toLocaleString() + '</div>' +
          '</div>' +
          '<button class="vault-item-star" data-id="' + item.id + '" type="button">' + (item.data && item.data.isStarred ? '★' : '☆') + '</button>' +
          '</div>';
      });
    }

    html += '</div>';
    body.innerHTML = html;

    var selectAll = document.getElementById('vault-select-all');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        var checked = this.checked;
        body.querySelectorAll('.vault-item-check').forEach(function (cb) { cb.checked = checked; });
        updateSelection();
      });
    }

    body.querySelectorAll('.vault-item-check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = this.getAttribute('data-id');
        if (this.checked) _selectedIds.add(id); else _selectedIds.delete(id);
        updateSelection();
      });
    });

    body.querySelectorAll('.vault-item-star').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = this.getAttribute('data-id');
        var starred = await toggleStar(parseInt(id));
        this.textContent = starred ? '★' : '☆';
      });
    });
  }

  function updateSelection() {
    var actionBar = document.getElementById('matey-vault-action-bar');
    if (!actionBar) return;
    var count = document.querySelectorAll('.vault-item-check:checked').length;
    if (count > 0) {
      actionBar.style.display = 'flex';
      var renameBtn = document.getElementById('vault-action-rename');
      if (renameBtn) renameBtn.style.display = count === 1 ? 'flex' : 'none';
    } else {
      actionBar.style.display = 'none';
    }
  }

  function getItemIcon(type) {
    var icons = { wardrobe: '👕', culinary: '🍳', grooming: '💇', living: '🏠', beat: '🎵', markdown: '📝', journal: '📓', vots: '💬', agent: '🤖', coach: '💡' };
    return icons[type] || '📄';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&', '<': '<', '>': '>', '"': '"', "'": "'" }[c];
    });
  }

  function openVault() {
    createOverlay();
    var overlay = document.getElementById('matey-vault-overlay');
    if (overlay) overlay.style.display = 'flex';
    showDashboard();
  }

  function closeVault() {
    var overlay = document.getElementById('matey-vault-overlay');
    if (overlay) overlay.style.display = 'none';
    _selectedIds.clear();
    _currentFolder = null;
  }

  async function init() {
    await _ensureDB();
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('#vault-launcher');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        openVault();
      }
    });
  }

  return {
    init: init,
    openVault: openVault,
    closeVault: closeVault,
    saveItem: saveItem,
    deleteItem: deleteItem,
    toggleStar: toggleStar
  };
})();

/* Matey FileSystem — File System Access API integration for workspace & USB OTG
 *
 * Features:
 * 1. User-designated folder via showDirectoryPicker()
 * 2. Hard boundary: path traversal protection at code level
 * 3. IndexedDB persistence for multiple named workspaces
 * 4. Permission health checks on every launch + before every agent action
 * 5. Visible trust signals: workspace display in header + activity log
 * 6. Destructive-action confirmation (dry-run mode available)
 * 7. Multiple named workspaces with switching
 * 8. USB safety: temp file + atomic rename on write
 * 9. Error handling: try/catch, AbortError, permission-denial
 * 10. Fallback: <input type="file"> for non-FSA browsers
 */
(function () {
  'use strict';

  var DB_NAME = 'MateyFS';
  var DB_VERSION = 2;
  var STORE_WORKSPACES = 'workspaces';
  var STORE_LOG = 'activity_log';
  var db = null;
  var currentWorkspace = null;
  var activityLog = [];
  var listeners = [];
  var isShutdown = false;

  /* ==================== IndexedDB ==================== */
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_WORKSPACES)) {
          db.createObjectStore(STORE_WORKSPACES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_LOG)) {
          db.createObjectStore(STORE_LOG, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = function (e) { db = e.target.result; resolve(db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function dbPut(storeName, value) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var req = database.transaction(storeName, 'readwrite')
          .objectStore(storeName).put(value);
        req.onsuccess = function () { resolve(); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  function dbGet(storeName, key) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var req = database.transaction(storeName).objectStore(storeName).get(key);
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  function dbDelete(storeName, key) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var req = database.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
        req.onsuccess = function () { resolve(); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  function dbGetAll(storeName) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var req = database.transaction(storeName).objectStore(storeName).getAll();
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  /* ==================== Handle Serialization ==================== */
  function serializeHandle(handle) {
    return new Promise(function (resolve) {
      if (window.structuredClone) {
        try { resolve(structuredClone(handle)); return; } catch (e) {}
      }
      try {
        var json = JSON.stringify(handle, function (k, v) {
          if (typeof v === 'object' && v && typeof v.then === 'function') return undefined;
          return v;
        });
        resolve(JSON.parse(json));
      } catch (e) {
        resolve(null);
      }
    });
  }

  function deserializeHandle(serialized) {
    if (!serialized) return null;
    if (window.structuredClone) {
      try { return structuredClone(serialized); } catch (e) { return null; }
    }
    return serialized;
  }

  /* ==================== Capability Detection ==================== */
  function supportsFSA() {
    return typeof window !== 'undefined' &&
           typeof window.showDirectoryPicker === 'function' &&
           typeof window.showOpenFilePicker === 'function' &&
           typeof window.showSaveFilePicker === 'function';
  }

  /* ==================== Path Security (Hard Boundary) ==================== */
  function sanitizePath(path) {
    if (!path || typeof path !== 'string') throw new Error('Invalid path');
    var clean = path.replace(/\\/g, '/').trim();
    if (clean.startsWith('/')) clean = clean.slice(1);
    var parts = clean.split('/').filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '..') {
        throw new Error('Path traversal blocked: ".." not allowed');
      }
      if (parts[i] === '.' || parts[i] === '') {
        parts.splice(i, 1);
        i--;
      }
    }
    return parts.length ? parts : [];
  }

  function joinPaths(parts) {
    if (Array.isArray(parts)) return parts.map(function (p) {
      if (p === '..') throw new Error('Path traversal blocked');
      return encodeURIComponent(p.replace(/^\/+|\/+$/g, ''));
    }).join('/');
  }

  /* ==================== Permission Helpers ==================== */
  async function verifyPermission(fileHandle, readWrite) {
    var mode = readWrite ? 'readwrite' : 'read';
    try {
      var status = await fileHandle.queryPermission({ mode: mode });
      if (status === 'granted') return true;
      if (status === 'prompt') {
        var newStatus = await fileHandle.requestPermission({ mode: mode });
        return newStatus === 'granted';
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async function verifyDirectoryPermission(dirHandle, readWrite) {
    return verifyPermission(dirHandle, readWrite);
  }

  async function healthCheckWorkspace(handle, readWrite) {
    if (!handle) return false;
    try {
      var mode = readWrite ? 'readwrite' : 'read';
      var status = await handle.queryPermission({ mode: mode });
      if (status === 'granted') return true;
      if (status === 'prompt') {
        var newStatus = await handle.requestPermission({ mode: mode });
        return newStatus === 'granted';
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /* ==================== Activity Log ==================== */
  function logActivity(action, path, details) {
    var entry = {
      timestamp: Date.now(),
      action: action,
      path: path,
      details: details || '',
      workspace: currentWorkspace ? currentWorkspace.name : null
    };
    activityLog.push(entry);
    if (activityLog.length > 500) activityLog.shift();
    try {
      dbPut(STORE_LOG, entry);
    } catch (e) {}
    notifyListeners('log', entry);
    updateActivityLogDisplay();
  }

  async function loadActivityLog() {
    try {
      var entries = await dbGetAll(STORE_LOG);
      activityLog = entries.sort(function (a, b) { return b.timestamp - a.timestamp; });
      return activityLog;
    } catch (e) {
      return [];
    }
  }

  function clearActivityLog() {
    activityLog = [];
    try {
      var tx = db.transaction(STORE_LOG, 'readwrite').objectStore(STORE_LOG).clear();
      tx.onsuccess = function () { notifyListeners('logCleared'); updateActivityLogDisplay(); };
    } catch (e) {}
    updateActivityLogDisplay();
  }

  function notifyListeners(type, data) {
    listeners.forEach(function (fn) { fn(type, data); });
  }

  function onFSChange(fn) {
    if (listeners.indexOf(fn) === -1) listeners.push(fn);
    return function () {
      var idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  /* ==================== Workspace Management (Multiple Named) ==================== */
  async function pickDirectory(options) {
    options = options || {};
    if (!supportsFSA()) {
      return { ok: false, error: 'api_unavailable', fallback: true };
    }
    try {
      var dirHandle = await window.showDirectoryPicker({
        mode: options.mode || 'readwrite',
        id: options.requestId || 'matey-workspace'
      });
      var name = dirHandle.name || 'Untitled';
      return { ok: true, handle: dirHandle, name: name };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: 'user_cancelled' };
      return { ok: false, error: e.message || String(e) };
    }
  }

  async function selectWorkspace(name) {
    if (!name) {
      var defaultName = 'Matey Workspace';
      var result = await pickDirectory({ name: defaultName, requestId: 'matey-workspace' });
      if (!result.ok) return result;
      name = defaultName;
      return await saveWorkspace(name, result.handle, { type: 'workspace' });
    }
    var result = await pickDirectory({ name: name, mode: 'readwrite' });
    if (!result.ok) return result;
    return await saveWorkspace(name, result.handle, { type: 'workspace' });
  }

  async function selectUSBMount() {
    var result = await pickDirectory({ mode: 'readwrite' });
    if (!result.ok) return result;
    return await saveWorkspace(result.name + ' (USB)', result.handle, { type: 'usb' });
  }

  async function saveWorkspace(name, handle, opts) {
    opts = opts || {};
    var serialized = await serializeHandle(handle);
    var ws = {
      id: name,
      handle: serialized,
      name: name,
      type: opts.type || 'workspace',
      savedAt: Date.now()
    };
    await dbPut(STORE_WORKSPACES, ws);
    return { ok: true, name: name, type: ws.type };
  }

  async function listWorkspaces() {
    try {
      var entries = await dbGetAll(STORE_WORKSPACES);
      return entries.map(function (e) { return { name: e.name, type: e.type }; });
    } catch (e) {
      return [];
    }
  }

  async function switchWorkspace(name) {
    var serialized = await loadHandle(STORE_WORKSPACES, name);
    if (!serialized) return { ok: false, error: 'workspace_not_found' };
    var handle = deserializeHandle(serialized);
    if (!handle) {
      await dbDelete(STORE_WORKSPACES, name);
      return { ok: false, error: 'handle_corrupted', needs_reselection: true };
    }
    var granted = await healthCheckWorkspace(handle, true);
    if (!granted) {
      return { ok: false, error: 'permission_denied', needs_reselection: true };
    }
    currentWorkspace = { name: name, handle: handle, type: serialized.type || 'workspace' };
    await updateDisplay(name);
    logActivity('switch', name, 'Switched to workspace');
    notifyListeners('workspaceChanged', currentWorkspace);
    return { ok: true, name: name };
  }

  async function deleteWorkspace(name) {
    await dbDelete(STORE_WORKSPACES, name);
    if (currentWorkspace && currentWorkspace.name === name) {
      currentWorkspace = null;
      await updateDisplay(null);
    }
    notifyListeners('workspaceRemoved', name);
    return { ok: true };
  }

  async function restoreLastWorkspace() {
    try {
      var all = await dbGetAll(STORE_WORKSPACES);
      if (!all.length) return null;
      var last = all.sort(function (a, b) { return b.savedAt - a.savedAt; })[0];
      var result = await switchWorkspace(last.id);
      if (result.ok) return result;
      return null;
    } catch (e) {
      return null;
    }
  }

  async function verifyAndRestore() {
    var ws = await restoreLastWorkspace();
    if (ws && ws.ok) return ws;
    if (currentWorkspace && currentWorkspace.handle) {
      var granted = await healthCheckWorkspace(currentWorkspace.handle, true);
      if (!granted) {
        currentWorkspace = null;
        await updateDisplay(null);
      }
    }
    return null;
  }

  function clearCachedWorkspace() {
    currentWorkspace = null;
    updateDisplay(null);
    notifyListeners('workspaceCleared');
  }

  function getCurrentWorkspace() {
    return currentWorkspace;
  }

  /* ==================== Display + UI Updates ==================== */
  async function updateDisplay(name) {
    var el = document.querySelector('.workspace-name, #workspace-display');
    if (!el) {
      if (!document.querySelector('.workspace-display-container')) {
        injectWorkspaceUI();
        return updateDisplay(name);
      }
      return;
    }
    el.textContent = name ? name : 'Workspace';
    el.classList.toggle('active', !!name);
    if (name) {
      el.title = 'Active workspace: ' + name;
    }
  }

  var _debounceTimer = null;
  function debouncedDisplay(name) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () { updateDisplay(name); }, 100);
  }

  function injectWorkspaceUI() {
    var existing = document.querySelector('.workspace-display-container');
    var dropdown = document.getElementById('workspace-dropdown');

    if (existing) {
      if (!dropdown) return;
      dropdown.addEventListener('click', function (e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', function close(e) {
        if (dropdown && dropdown.contains(e.target)) return;
        if (dropdown) dropdown.classList.remove('open');
      });
      return;
    }

    var header = document.querySelector('.header-top');
    if (!header) return;

    var container = document.createElement('div');
    container.className = 'workspace-display-container';
    container.id = 'workspace-display-container';
    container.innerHTML =
      '<div class="workspace-dropdown" id="workspace-dropdown">' +
        '<span class="workspace-name" id="workspace-display">Workspace</span>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
      '</div>' +
      '<div class="workspace-selector" id="workspace-selector"></div>';

    header.insertBefore(container, header.querySelector('.header-actions'));

    dropdown = document.getElementById('workspace-dropdown');
    if (dropdown) {
      dropdown.addEventListener('click', function (e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
    }
    document.addEventListener('click', function close(e) {
      if (dropdown && dropdown.contains(e.target)) return;
      if (dropdown) dropdown.classList.remove('open');
    });
  }

  /* ==================== Activity Log UI ==================== */
  function injectActivityLogUI() {
    if (document.querySelector('#fs-activity-log')) return;
    var container = document.createElement('div');
    container.className = 'fs-activity-log-container';
    container.id = 'fs-activity-log-container';
    container.innerHTML =
      '<button class="fs-log-toggle" id="fs-log-toggle" type="button" aria-label="Activity log">' +
        '<span class="fs-log-icon">📋</span><span class="fs-log-badge" id="fs-log-badge">0</span>' +
      '</button>' +
      '<div class="fs-log-panel" id="fs-log-panel">' +
        '<div class="fs-log-header">' +
          '<span class="fs-log-title">Activity Log</span>' +
          '<button class="fs-log-clear" id="fs-log-clear" type="button">Clear</button>' +
        '</div>' +
        '<div class="fs-log-list" id="fs-log-list"></div>' +
      '</div>';
    document.body.appendChild(container);
    setupActivityLogEvents();
  }

  function setupActivityLogEvents() {
    var toggle = document.getElementById('fs-log-toggle');
    var panel = document.getElementById('fs-log-panel');
    var clearBtn = document.getElementById('fs-log-clear');
    if (toggle) {
      toggle.addEventListener('click', function () {
        panel.classList.toggle('open');
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', clearActivityLog);
    }
  }

  function updateActivityLogDisplay() {
    var container = document.querySelector('.fs-activity-log-container');
    if (!container) return;
    var list = document.getElementById('fs-log-list');
    if (!list) return;
    list.innerHTML = '';
    activityLog.slice(0, 100).forEach(function (entry) {
      var item = document.createElement('div');
      item.className = 'fs-log-item fs-log-' + entry.action;
      var time = new Date(entry.timestamp).toLocaleTimeString();
      item.innerHTML = '<span class="fs-log-time">[' + time + ']</span> ' +
        '<span class="fs-log-action">' + entry.action + '</span>: ' +
        '<span class="fs-log-path">' + escapeHtml(entry.path) + '</span>';
      if (entry.details) item.innerHTML += ' <span class="fs-log-details">' + escapeHtml(entry.details) + '</span>';
      list.appendChild(item);
    });
    var badge = document.getElementById('fs-log-badge');
    if (badge) badge.textContent = activityLog.length;
  }

  /* ==================== Confirmation Dialog ==================== */
  var pendingConfirm = null;

  function showConfirmDialog(options) {
    return new Promise(function (resolve) {
      if (!supportsFSA()) { resolve(true); return; }
      pendingConfirm = { options: options, resolve: resolve };
      injectConfirmDialog();
      var dialog = document.getElementById('fs-confirm-dialog');
      if (dialog) dialog.classList.add('open');
    });
  }

  function injectConfirmDialog() {
    if (document.getElementById('fs-confirm-dialog')) return;
    var dialog = document.createElement('div');
    dialog.id = 'fs-confirm-dialog';
    dialog.className = 'fs-confirm-overlay';
    dialog.innerHTML =
      '<div class="fs-confirm-content">' +
        '<div class="fs-confirm-icon">⚠️</div>' +
        '<div class="fs-confirm-body">' +
          '<div class="fs-confirm-title" id="fs-confirm-title"></div>' +
          '<div class="fs-confirm-message" id="fs-confirm-message"></div>' +
          '<pre class="fs-confirm-preview" id="fs-confirm-preview"></pre>' +
        '</div>' +
        '<div class="fs-confirm-actions">' +
          '<button class="fs-btn fs-btn-secondary" id="fs-confirm-cancel">Cancel</button>' +
          '<button class="fs-btn fs-btn-danger" id="fs-confirm-proceed">Proceed</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);
    document.getElementById('fs-confirm-cancel').addEventListener('click', function () {
      if (pendingConfirm) {
        pendingConfirm.resolve(false);
        pendingConfirm = null;
      }
      dialog.classList.remove('open');
    });
    document.getElementById('fs-confirm-proceed').addEventListener('click', function () {
      if (pendingConfirm) {
        pendingConfirm.resolve(true);
        pendingConfirm = null;
      }
      dialog.classList.remove('open');
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function confirmDestructive(action, path, preview) {
    if (!supportsFSA() || !currentWorkspace) return true;
    var ok = await showConfirmDialog({
      title: action === 'delete' ? 'Delete file?' : 'Overwrite file?',
      message: action === 'delete'
        ? 'This will permanently delete: ' + path
        : 'This will overwrite: ' + path,
      preview: preview
    });
    return ok;
  }

  /* ==================== Core File Operations (Scoped) ==================== */
  async function requireWorkspace() {
    if (!currentWorkspace || !currentWorkspace.handle) {
      throw new Error('No active workspace. Call selectWorkspace() first.');
    }
    var granted = await healthCheckWorkspace(currentWorkspace.handle, true);
    if (!granted) {
      logActivity('permission_denied', currentWorkspace.name, 'Permission revoked — prompt to reselect');
      notifyListeners('permissionRevoked', currentWorkspace.name);
      throw new Error('Workspace permission revoked — please reselect workspace');
    }
    return currentWorkspace.handle;
  }

  async function getDirEntry(path) {
    var rootHandle = await requireWorkspace();
    var parts = sanitizePath(path);
    var handle = rootHandle;
    for (var i = 0; i < parts.length; i++) {
      var granted = await verifyDirectoryPermission(handle, true);
      if (!granted) throw new Error('Permission denied for directory: ' + handle.name);
      handle = await handle.getDirectoryHandle(parts[i], { create: true });
    }
    return handle;
  }

  async function getFileEntry(path) {
    var parts = sanitizePath(path);
    if (parts.length === 0) throw new Error('Cannot get file entry for empty path');
    var fileName = parts.pop();
    var dir = await getDirEntry(parts.join('/'));
    var granted = await verifyDirectoryPermission(dir, true);
    if (!granted) throw new Error('Permission denied for directory: ' + dir.name);
    try {
      return await dir.getFileHandle(fileName, { create: false });
    } catch (e) {
      throw new Error('File not found: ' + path);
    }
  }

  async function createSubfolder(path, name) {
    try {
      var parentDir = await getDirEntry(path);
      var granted = await verifyDirectoryPermission(parentDir, true);
      if (!granted) throw new Error('Permission denied');
      var handle = await parentDir.getDirectoryHandle(name, { create: true });
      var fullPath = path ? path + '/' + name : name;
      logActivity('create_dir', fullPath, 'Created subfolder');
      return handle;
    } catch (e) {
      logActivity('error', path, e.message);
      throw e;
    }
  }

  async function writeFile(path, content, opts) {
    opts = opts || {};
    try {
      var rootHandle = await requireWorkspace();
      var parts = sanitizePath(path);
      if (parts.length === 0) throw new Error('Cannot write to empty path');
      var fileName = parts.pop();
      var dir = await getDirEntry(parts.join('/'));

      var granted = await verifyDirectoryPermission(dir, true);
      if (!granted) throw new Error('Permission denied for directory: ' + dir.name);

      var existing = false;
      try {
        await dir.getFileHandle(fileName, { create: false });
        existing = true;
      } catch (e) { existing = false; }

      if (existing && !opts.force) {
        var preview = opts.dryRun ? '[dry-run] content preview (first 500 chars):\n' + String(content).substring(0, 500) :
          String(content).length + ' bytes of content';
        var confirmed = await confirmDestructive('overwrite', path, preview);
        if (!confirmed) {
          logActivity('cancelled', path, 'Write cancelled by user');
          throw new Error('Write cancelled by user');
        }
      }

      if (opts.dryRun) {
        logActivity('dry_run', path, 'Dry-run: would write ' + String(content).length + ' bytes');
        return { dryRun: true, path: path, bytes: String(content).length };
      }

      var tempName = '.' + fileName + '.tmp_' + Date.now();
      var tempHandle;
      try {
        tempHandle = await dir.getFileHandle(tempName, { create: true });
      } catch (e) {
        tempHandle = await dir.getFileHandle(fileName, { create: true });
        tempName = fileName;
      }

      var granted2 = await verifyPermission(tempHandle, true);
      if (!granted2) throw new Error('Permission denied for file: ' + path);

      var writable = await tempHandle.createWritable();
      if (opts.isBase64) {
        var binary = atob(content);
        var buffer = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
        await writable.write(buffer);
      } else {
        await writable.write(content);
      }
      await writable.close();

      if (tempName !== fileName) {
        try {
          await dir.removeEntry(fileName, { mode: 'readwrite' });
        } catch (e) {}
        await tempHandle.move(dir, fileName);
      }

      logActivity(existing ? 'modify' : 'create', path,
        (existing ? 'Overwrote ' : 'Created ') + String(content).length + ' bytes');
      return tempHandle;
    } catch (e) {
      logActivity('error', path, e.message);
      throw e;
    }
  }

  async function readFile(path, opts) {
    opts = opts || {};
    try {
      var fileHandle = await getFileEntry(path);
      var granted = await verifyPermission(fileHandle, false);
      if (!granted) throw new Error('Permission denied for file: ' + path);
      var file = await fileHandle.getFile();
      if (opts.asBase64) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      var text = await file.text();
      logActivity('read', path, 'Read ' + text.length + ' bytes');
      return text;
    } catch (e) {
      logActivity('error', path, e.message);
      throw e;
    }
  }

  async function readFileAsBase64(path) {
    return readFile(path, { asBase64: true });
  }

  async function listFiles(path) {
    try {
      var dir = await getDirEntry(path || '');
      var granted = await verifyDirectoryPermission(dir, false);
      if (!granted) throw new Error('Permission denied');
      var entries = [];
      var iter = dir.values();
      while (true) {
        var result = await iter.next();
        if (result.done) break;
        var entry = result.value;
        entries.push({ name: entry.name, kind: entry.kind });
      }
      return entries;
    } catch (e) {
      logActivity('error', path || '', e.message);
      throw e;
    }
  }

  async function fileExists(path) {
    try {
      await getFileEntry(path);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function deleteFile(path, opts) {
    opts = opts || {};
    try {
      var parts = sanitizePath(path);
      if (parts.length === 0) throw new Error('Cannot delete workspace root');
      var fileName = parts.pop();
      var dir = await getDirEntry(parts.join('/'));
      var granted = await verifyDirectoryPermission(dir, true);
      if (!granted) throw new Error('Permission denied');

      if (!opts.force) {
        var confirmed = await confirmDestructive('delete', path);
        if (!confirmed) {
          logActivity('cancelled', path, 'Delete cancelled by user');
          throw new Error('Delete cancelled by user');
        }
      }

      await dir.removeEntry(fileName, { mode: 'readwrite' });
      logActivity('delete', path, 'Deleted');
      return true;
    } catch (e) {
      logActivity('error', path, e.message);
      throw e;
    }
  }

  async function copyFile(srcPath, destPath) {
    try {
      if (!await fileExists(srcPath)) throw new Error('Source not found: ' + srcPath);
      var content = await readFile(srcPath);
      if (await fileExists(destPath)) {
        var confirmed = await confirmDestructive('overwrite', destPath);
        if (!confirmed) throw new Error('Copy cancelled by user');
      }
      await writeFile(destPath, content);
      logActivity('copy', srcPath + ' → ' + destPath, 'Copied');
      return true;
    } catch (e) {
      logActivity('error', srcPath, e.message);
      throw e;
    }
  }

  async function listAllFiles(path, result) {
    path = path || [];
    result = result || [];
    try {
      var dir = await getDirEntry('');
      var granted = await verifyDirectoryPermission(dir, false);
      if (!granted) return result;
      for (var i = 0; i < path.length; i++) {
        dir = await dir.getDirectoryHandle(path[i], { create: false });
      }
      var iter = dir.values();
      while (true) {
        var val = await iter.next();
        if (val.done) break;
        var entry = val.value;
        var fullPath = path.concat(entry.name);
        if (entry.kind === 'directory') {
          await listAllFiles(fullPath, result);
        } else {
          result.push(fullPath.join('/'));
        }
      }
      return result;
    } catch (e) {
      return result;
    }
  }

  /* ==================== USB Safety: Safe Write ==================== */
  async function safeWrite(path, content, opts) {
    opts = opts || {};
    var originalOpts = Object.assign({}, opts);
    originalOpts.force = true;

    var tempPath = path + '.tmp_write_' + Date.now();

    try {
      await writeFile(tempPath, content, originalOpts);

      try {
        await moveFile(tempPath, path, { force: true });
      } catch (e) {
        await deleteFile(tempPath, { force: true });
        throw e;
      }
      return true;
    } catch (e) {
      try { await deleteFile(tempPath, { force: true }); } catch (ee) {}
      logActivity('error', path, 'Safe write failed: USB may have been disconnected');
      throw new Error('Write failed — USB may be disconnected. Original file unchanged.');
    }
  }

  async function moveFile(srcPath, destPath, opts) {
    opts = opts || {};
    try {
      var srcParts = sanitizePath(srcPath);
      var destParts = sanitizePath(destPath);
      if (srcParts.length === 0 || destParts.length === 0) throw new Error('Invalid path');

      var srcName = srcParts.pop();
      var destName = destParts.pop();
      var srcDir = await getDirEntry(srcParts.join('/'));
      var destDir = await getDirEntry(destParts.join('/'));

      var granted = await verifyDirectoryPermission(destDir, true);
      if (!granted) throw new Error('Permission denied for destination directory');

      if (await fileExists(destPath) && !opts.force) {
        var confirmed = await confirmDestructive('overwrite', destPath);
        if (!confirmed) throw new Error('Move cancelled by user');
      }

      var srcEntry = await srcDir.getFileHandle(srcName, { create: false });
      try {
        await srcEntry.move(destDir, destName);
      } catch (e) {
        var content = await readFile(srcPath);
        await writeFile(destPath, content, { force: true });
        await deleteFile(srcPath, { force: true });
      }

      logActivity('move', srcPath + ' → ' + destPath, 'Moved');
      return true;
    } catch (e) {
      logActivity('error', srcPath, e.message);
      throw e;
    }
  }

  /* ==================== Fallback ==================== */
  function createFallbackInput(options) {
    options = options || {};
    var input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = !!options.directory;
    input.multiple = !!options.multiple;
    if (options.accept) input.accept = options.accept;
    return input;
  }

  function handleFallbackFiles(input, callback) {
    var files = input.files;
    var results = [];
    var remaining = files.length;
    var hasError = false;
    var opts = input.__fsaOptions || {};

    Array.from(files).forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        results.push({
          name: file.name.replace(/^.*[\\/]/, ''),
          path: file.webkitRelativePath || file.name,
          content: reader.result,
          size: file.size,
          type: file.type
        });
        remaining--;
        if (remaining === 0 && !hasError) callback(null, results);
      };
      reader.onerror = function () { hasError = true; callback(reader.error); };
      if (opts.asBase64) reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
  }

  function triggerFallbackPicker(options) {
    options = options || {};
    if (supportsFSA()) {
      return selectWorkspace(options.name);
    }
    var input = createFallbackInput({ directory: true, multiple: true });
    input.__fsaOptions = options;
    input.onchange = function (e) {
      handleFallbackFiles(input, function (err, files) {
        if (err) {
          logActivity('error', '', 'Fallback picker error: ' + err.message);
          return;
        }
        var dirName = files[0].path.split('/')[0] || 'Upload';
        currentWorkspace = { name: dirName, type: 'fallback' };
        updateDisplay(dirName);
        logActivity('imported', dirName, 'Imported ' + files.length + ' files (fallback mode)');
        notifyListeners('fallbackFiles', files);
      });
    };
    input.click();
    return { ok: true, fallback: true };
  }

  /* ==================== Toast ==================== */
  function showFSToast(message, duration) {
    /* Toast notifications disabled */
  }

  /* ==================== Shutdown ==================== */
  function shutdown() {
    isShutdown = true;
  }

  /* ==================== Public API ==================== */
  window.MateyFS = window.FileSystemManager = {
    /* Capability & state */
    supports: supportsFSA,
    getCurrentWorkspace: getCurrentWorkspace,
    updateDisplay: updateDisplay,
    isShutdown: function () { return isShutdown; },

    /* Workspace management — multiple named workspaces */
    selectWorkspace: selectWorkspace,
    selectUSBMount: selectUSBMount,
    switchWorkspace: switchWorkspace,
    listWorkspaces: listWorkspaces,
    deleteWorkspace: deleteWorkspace,
    restoreLastWorkspace: restoreLastWorkspace,
    verifyAndRestore: verifyAndRestore,
    clearCachedWorkspace: clearCachedWorkspace,

    /* Permission health checks */
    verifyPermission: verifyPermission,
    verifyDirectoryPermission: verifyDirectoryPermission,
    healthCheck: healthCheckWorkspace,
    requireWorkspace: requireWorkspace,

    /* File operations */
    createSubfolder: createSubfolder,
    writeFile: writeFile,
    readFile: readFile,
    readFileAsBase64: readFileAsBase64,
    listFiles: listFiles,
    fileExists: fileExists,
    deleteFile: deleteFile,
    copyFile: copyFile,
    listAllFiles: listAllFiles,
    moveFile: moveFile,
    safeWrite: safeWrite,

    /* Destructive-action confirmation */
    confirmDestructive: confirmDestructive,
    setConfirmHandler: function (fn) { confirmHandler = fn; },
    enableConfirmations: function (enabled) { confirmationsEnabled = enabled; },

    /* Fallback helpers */
    createFallbackInput: createFallbackInput,
    handleFallbackFiles: handleFallbackFiles,
    triggerFallbackPicker: triggerFallbackPicker,

    /* Activity log */
    logActivity: logActivity,
    loadActivityLog: loadActivityLog,
    clearActivityLog: clearActivityLog,
    getActivityLog: function () { return activityLog.slice(); },
    onFSChange: onFSChange,

    /* UI helpers */
    showFSToast: showFSToast,
    injectActivityLogUI: injectActivityLogUI,
    injectConfirmDialog: injectConfirmDialog,
    injectWorkspaceUI: injectWorkspaceUI,

    /* Lifecycle */
    shutdown: shutdown,

    /* IndexedDB helpers (for testing/extension) */
    _saveHandle: dbPut,
    _loadHandle: dbGet,
    _removeHandle: dbDelete,
    _getAll: dbGetAll
  };

  /* ==================== UI Initialization ==================== */
  function setupWorkspaceSelector() {
    var selector = document.getElementById('workspace-selector');
    if (!selector) return;

    populateWorkspaceSelector().catch(function (e) {
      console.error('populateWorkspaceSelector failed:', e);
    });
    selector.addEventListener('click', async function (e) {
      var btn = e.target.closest('button[data-workspace]');
      if (!btn) return;
      var ws = btn.getAttribute('data-workspace');
      var dropdown = document.getElementById('workspace-dropdown');
      if (dropdown) dropdown.classList.remove('open');

      if (ws === 'create') {
        var result = await selectWorkspace();
        if (result.ok) {
          showFSToast('Workspace ready: ' + result.name);
          switchWorkspace(result.name);
        } else if (result.error && result.error !== 'user_cancelled') {
          if (result.fallback) {
            showFSToast('FSA unavailable — using file input');
            triggerFallbackPicker();
          } else {
            showFSToast('Error: ' + result.error);
          }
        }
      } else if (ws === 'usb') {
        var usbResult = await selectUSBMount();
        if (usbResult.ok) {
          showFSToast('USB mounted: ' + usbResult.name);
          switchWorkspace(usbResult.name);
        } else if (usbResult.error && usbResult.error !== 'user_cancelled') {
          showFSToast('Error: ' + usbResult.error);
        }
      } else if (ws === 'clear') {
        clearCachedWorkspace();
        showFSToast('Workspace disconnected');
      } else if (ws && ws !== 'placeholder') {
        var switchResult = await switchWorkspace(ws);
        if (switchResult.ok) {
          showFSToast('Switched to: ' + switchResult.name);
        } else if (switchResult.error) {
          showFSToast('Permission needed: ' + switchResult.name);
          if (switchResult.needs_reselection) {
            await selectWorkspace(switchResult.name);
          }
        }
      }
    });
  }

  async function populateWorkspaceSelector() {
    var selector = document.getElementById('workspace-selector');
    if (!selector) return;
    try {
      var workspaces = await listWorkspaces();
      selector.innerHTML = '';
      if (workspaces.length) {
        workspaces.forEach(function (ws) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('data-workspace', ws.name);
          btn.textContent = ws.name + (ws.type === 'usb' ? ' (USB)' : '');
          btn.className = 'ws-option';
          if (currentWorkspace && currentWorkspace.name === ws.name) {
            btn.classList.add('active');
          }
          selector.appendChild(btn);
        });
        var divider = document.createElement('div');
        divider.className = 'ws-divider';
        selector.appendChild(divider);
      }
      selector.innerHTML +=
        '<button type="button" data-workspace="create" class="ws-create">📁 Create / Select Workspace</button>' +
        '<button type="button" data-workspace="usb" class="ws-usb">💾 Select USB Drive</button>' +
        '<button type="button" data-workspace="clear" class="ws-clear">Disconnect</button>';
    } catch (e) {
      selector.innerHTML =
        '<button type="button" data-workspace="create" class="ws-create">📁 Create / Select Workspace</button>' +
        '<button type="button" data-workspace="usb" class="ws-usb">💾 Select USB Drive</button>';
    }
  }

  /* ==================== Launch Sequence ==================== */
  async function initUI() {
    injectWorkspaceUI();
    injectConfirmDialog();
    setupWorkspaceSelector();
    await loadActivityLog();
    notifyListeners('logLoaded', activityLog);
  }

  async function checkLaunchPermissions() {
    if (!supportsFSA()) return;
    var ws = await verifyAndRestore();
    if (ws && ws.ok) {
      updateActivityLogDisplay();
    } else {
      if (!currentWorkspace && !await restoreLastWorkspace()) {
        // Workspace setup toast removed — no bottom-right corner elements
      }
    }
    updateActivityLogDisplay();
  }

  /* Auto-init on load */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', async function () {
        await initUI();
        await checkLaunchPermissions();
      });
    } else {
      (async function () {
        await initUI();
        await checkLaunchPermissions();
      })();
    }
  }

  window.addEventListener('beforeunload', function () {
    shutdown();
  });
})();

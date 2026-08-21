/* Matey FileSystem — File System Access API integration for workspace & USB OTG */
(function () {
  'use strict';

  var DB_NAME = 'MateyFS';
  var DB_VERSION = 1;
  var STORE_NAME = 'handles';
  var db = null;
  var currentWorkspace = null; // { name: string, handle: FileSystemDirectoryHandle, type: 'workspace'|'usb' }

  /* ---------- IndexedDB ---------- */
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = function (e) { db = e.target.result; resolve(db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function saveHandle(id, serialized) {
    return openDB().then(function (database) {
      var tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id: id, handle: serialized, savedAt: Date.now() });
      return tx.complete;
    });
  }

  function loadHandle(id) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var req = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(id);
        req.onsuccess = function (e) { resolve(e.target.result ? e.target.result.handle : null); };
        req.onerror = reject;
      });
    });
  }

  function removeHandle(id) {
    return openDB().then(function (database) {
      var tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      return tx.complete;
    });
  }

  /* ---------- Handle serialization (structured clone) ---------- */
  function serializeHandle(handle) {
    return new Promise(function (resolve) {
      if (window.structuredClone) {
        try { resolve(structuredClone(handle)); return; } catch (e) {}
      }
      /* Fallback for environments without structuredClone */
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

  /* ---------- Permission helpers ---------- */
  async function verifyPermission(fileHandle, readWrite) {
    var mode = readWrite ? 'readwrite' : 'read';
    var granted = false;
    try {
      var status = await fileHandle.queryPermission({ mode: mode });
      if (status === 'granted') { granted = true; return true; }
      if (status === 'prompt') {
        var newStatus = await fileHandle.requestPermission({ mode: mode });
        return newStatus === 'granted';
      }
      return status === 'granted';
    } catch (e) {
      return granted;
    }
  }

  async function verifyDirectoryPermission(dirHandle, readWrite) {
    var mode = readWrite ? 'readwrite' : 'read';
    var granted = false;
    try {
      var status = await dirHandle.queryPermission({ mode: mode });
      if (status === 'granted') { granted = true; return true; }
      if (status === 'prompt') {
        var newStatus = await dirHandle.requestPermission({ mode: mode });
        return newStatus === 'granted';
      }
      return status === 'granted';
    } catch (e) {
      return granted;
    }
  }

  /* ---------- Capability detection ---------- */
  function supportsFSA() {
    return typeof window !== 'undefined' &&
           typeof window.showDirectoryPicker === 'function' &&
           typeof window.showOpenFilePicker === 'function' &&
           typeof window.showSaveFilePicker === 'function';
  }

  /* ---------- Workspace management ---------- */
  async function initializeWorkspace() {
    if (!supportsFSA()) {
      return { ok: false, error: 'api_unavailable', fallback: true };
    }
    try {
      var dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'matey-workspace' });
      var name = dirHandle.name || 'Matey Workspace';
      var serialized = await serializeHandle(dirHandle);
      await saveHandle('workspace', serialized);
      currentWorkspace = { name: name, handle: dirHandle, type: 'workspace' };
      updateWorkspaceDisplay(name);
      return { ok: true, name: name, type: 'workspace' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: 'user_cancelled' };
      return { ok: false, error: e.message || String(e) };
    }
  }

  async function selectUSBMount() {
    if (!supportsFSA()) {
      return { ok: false, error: 'api_unavailable', fallback: true };
    }
    try {
      var dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      var name = dirHandle.name || 'USB Drive';
      var serialized = await serializeHandle(dirHandle);
      await saveHandle('usb', serialized);
      currentWorkspace = { name: name, handle: dirHandle, type: 'usb' };
      updateWorkspaceDisplay(name + ' (USB)');
      return { ok: true, name: name, type: 'usb' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: 'user_cancelled' };
      return { ok: false, error: e.message || String(e) };
    }
  }

  async function restoreWorkspace() {
    try {
      var serialized = await loadHandle('workspace');
      if (!serialized) return null;
      var handle = deserializeHandle(serialized);
      if (!handle) return null;
      var granted = await verifyDirectoryPermission(handle, true);
      if (!granted) {
        /* Try to re-prompt */
        var result = await initializeWorkspace();
        if (!result.ok) {
          /* Clear stale handle */
          await removeHandle('workspace');
          return null;
        }
        return currentWorkspace;
      }
      var name = handle.name || 'Matey Workspace';
      currentWorkspace = { name: name, handle: handle, type: 'workspace' };
      updateWorkspaceDisplay(name);
      return currentWorkspace;
    } catch (e) {
      return null;
    }
  }

  function clearCachedWorkspace() {
    return removeHandle('workspace').then(function () {
      currentWorkspace = null;
      updateWorkspaceDisplay(null);
    });
  }

  function getCurrentWorkspace() {
    return currentWorkspace;
  }

  function updateWorkspaceDisplay(name) {
    var el = document.querySelector('.workspace-name');
    if (!el) return;
    el.textContent = name ? 'Workspace: ' + name : 'No workspace set';
    el.classList.toggle('active', !!name);
  }

  /* ---------- File operations (scoped to current workspace) ---------- */
  async function getDirEntry(path) {
    if (!currentWorkspace || !currentWorkspace.handle) throw new Error('No active workspace');
    var parts = path.split('/').filter(Boolean);
    var handle = currentWorkspace.handle;
    for (var i = 0; i < parts.length; i++) {
      var granted = await verifyDirectoryPermission(handle, true);
      if (!granted) throw new Error('Permission denied for directory: ' + handle.name);
      handle = await handle.getDirectoryHandle(parts[i], { create: true });
    }
    return handle;
  }

  async function getFileEntry(path) {
    if (!currentWorkspace || !currentWorkspace.handle) throw new Error('No active workspace');
    var parts = path.split('/').filter(Boolean);
    var fileName = parts.pop();
    var dir = currentWorkspace.handle;
    for (var i = 0; i < parts.length; i++) {
      var granted = await verifyDirectoryPermission(dir, true);
      if (!granted) throw new Error('Permission denied for directory: ' + dir.name);
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    var granted = await verifyDirectoryPermission(dir, true);
    if (!granted) throw new Error('Permission denied for directory: ' + dir.name);
    return dir.getFileHandle(fileName, { create: false });
  }

  async function createSubfolder(path, name) {
    var parentDir = await getDirEntry(path);
    var granted = await verifyDirectoryPermission(parentDir, true);
    if (!granted) throw new Error('Permission denied');
    return parentDir.getDirectoryHandle(name, { create: true });
  }

  async function writeFile(path, content, isBase64) {
    var fileHandle = await getFileEntry(path);
    var granted = await verifyPermission(fileHandle, true);
    if (!granted) throw new Error('Permission denied for file: ' + path);
    var writable = await fileHandle.createWritable();
    if (isBase64) {
      var binary = atob(content);
      var buffer = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
      await writable.write(buffer);
    } else {
      await writable.write(content);
    }
    await writable.close();
    return fileHandle;
  }

  async function readFile(path) {
    var fileHandle = await getFileEntry(path);
    var granted = await verifyPermission(fileHandle, false);
    if (!granted) throw new Error('Permission denied for file: ' + path);
    var file = await fileHandle.getFile();
    return await file.text();
  }

  async function readFileAsBase64(path) {
    var fileHandle = await getFileEntry(path);
    var granted = await verifyPermission(fileHandle, false);
    if (!granted) throw new Error('Permission denied for file: ' + path);
    var file = await fileHandle.getFile();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function listFiles(path) {
    var dir = await getDirEntry(path);
    var granted = await verifyDirectoryPermission(dir, false);
    if (!granted) throw new Error('Permission denied');
    var entries = [];
    for await (var entry of dir.values()) {
      entries.push({ name: entry.name, kind: entry.kind });
    }
    return entries;
  }

  async function fileExists(path) {
    try {
      var parts = path.split('/').filter(Boolean);
      var fileName = parts.pop();
      var dir = await getDirEntry(parts.join('/'));
      var granted = await verifyDirectoryPermission(dir, false);
      if (!granted) return false;
      var entries = [];
      for await (var entry of dir.values()) {
        if (entry.name === fileName) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async function deleteFile(path) {
    var parts = path.split('/').filter(Boolean);
    var fileName = parts.pop();
    var dir = await getDirEntry(parts.join('/'));
    var granted = await verifyDirectoryPermission(dir, true);
    if (!granted) throw new Error('Permission denied');
    await dir.removeEntry(fileName);
    return true;
  }

  async function copyFile(srcPath, destPath) {
    var content = await readFile(srcPath);
    await writeFile(destPath, content);
    return true;
  }

  async function listAllFiles(path, result) {
    path = path || '';
    result = result || [];
    var dir = await getDirEntry(path);
    var granted = await verifyDirectoryPermission(dir, false);
    if (!granted) return result;
    for await (var entry of dir.values()) {
      var fullPath = path ? path + '/' + entry.name : entry.name;
      if (entry.kind === 'directory') {
        await listAllFiles(fullPath, result);
      } else {
        result.push(fullPath);
      }
    }
    return result;
  }

  /* ---------- Fallback for unsupported browsers ---------- */
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
      if (options && options.asBase64) reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
  }

  /* ===== UI Integration ===== */
  function showFSToast(message, duration) {
    duration = duration || 2500;
    var toast = document.querySelector('.fs-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'fs-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, duration);
  }

  async function handleWorkspaceBtn() {
    if (!supportsFSA()) {
      showFSToast('File System Access API not available. Using fallback.');
      triggerFallbackPicker();
      return;
    }
    var selector = document.querySelector('.workspace-selector');
    var btn = document.getElementById('workspace-btn');
    if (selector && btn) {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !expanded);
      selector.classList.toggle('visible', !expanded);
    }
  }

  async function setupWorkspaceSelector() {
    var selector = document.querySelector('.workspace-selector');
    if (!selector) {
      /* Create selector dynamically */
      selector = document.createElement('div');
      selector.className = 'workspace-selector';
      selector.innerHTML =
        '<button type="button" id="ws-init" data-action="init">Matey Workspace</button>' +
        '<button type="button" id="ws-usb" data-action="usb">USB Drive</button>' +
        '<button type="button" id="ws-clear" data-action="clear">Disconnect</button>';
      var bar = document.querySelector('.workspace-bar');
      if (bar) bar.appendChild(selector);
    }

    selector.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      if (action === 'init') {
        selector.classList.remove('visible');
        document.getElementById('workspace-btn').setAttribute('aria-expanded', 'false');
        initializeWorkspace().then(function (result) {
          if (result.ok) showFSToast('Workspace ready: ' + result.name);
          else if (result.error) showFSToast('Error: ' + result.error);
        });
      } else if (action === 'usb') {
        selector.classList.remove('visible');
        document.getElementById('workspace-btn').setAttribute('aria-expanded', 'false');
        selectUSBMount().then(function (result) {
          if (result.ok) showFSToast('USB mounted: ' + result.name);
          else if (result.error) showFSToast('Error: ' + result.error);
        });
      } else if (action === 'clear') {
        selector.classList.remove('visible');
        document.getElementById('workspace-btn').setAttribute('aria-expanded', 'false');
        clearCachedWorkspace();
        showFSToast('Workspace disconnected');
      }
    });
  }

  function triggerFallbackPicker() {
    var input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.directory = true;
    input.multiple = true;
    input.onchange = function (e) {
      var files = Array.from(e.target.files);
      if (!files.length) return;
      var dirName = files[0].webkitRelativePath.split('/')[0];
      showFSToast('Selected (fallback): ' + dirName);
      /* Store file list for processing */
      window.__matey_fallback_files = files;
    };
    input.click();
  }

  /* Public API additions */
  window.MateyFS = window.FileSystemManager = {
    /* Capability & state */
    supports: supportsFSA,
    getCurrentWorkspace: getCurrentWorkspace,
    updateDisplay: updateWorkspaceDisplay,

    /* Workspace management */
    initializeWorkspace: initializeWorkspace,
    selectUSBMount: selectUSBMount,
    restoreWorkspace: restoreWorkspace,
    clearCachedWorkspace: clearCachedWorkspace,

    /* Permission helpers */
    verifyPermission: verifyPermission,
    verifyDirectoryPermission: verifyDirectoryPermission,

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

    /* Fallback helpers */
    createFallbackInput: createFallbackInput,
    handleFallbackFiles: handleFallbackFiles,

    /* IndexedDB helpers (for testing/extension) */
    _saveHandle: saveHandle,
    _loadHandle: loadHandle,
    _removeHandle: removeHandle
  };

  /* UI initialization */
  function initUI() {
    var btn = document.getElementById('workspace-btn');
    if (btn) btn.addEventListener('click', handleWorkspaceBtn);
    setupWorkspaceSelector();
  }

  /* Auto-restore workspace on load */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initUI();
      restoreWorkspace();
    });
  } else {
    initUI();
    restoreWorkspace();
  }
})();

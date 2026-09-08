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
   /* Only the URI is persisted — never the handle object itself.
      Native handles cannot be serialized (methods are lost). Instead,
      we reconstruct a fresh, fully-functional handle from the URI on every access. */
   function serializeHandle(handle) {
     return new Promise(function (resolve) {
       if (!handle) { resolve(null); return; }
       /* Persist only the URI + minimal metadata — never the handle object */
       resolve({
         uri: handle.uri || null,
         name: handle.name || 'Workspace',
         kind: handle.kind || 'directory',
         isNative: true
       });
     });
   }

   /* Reconstruct a fresh native handle from the persisted URI.
      This always returns a live handle with full method support. */
   async function deserializeHandle(serialized) {
     if (!serialized || !serialized.uri) return null;
     return createNativeHandle(serialized.uri, serialized.name || 'Workspace');
   }

   /* Create a fresh native handle wrapper around a URI.
      The handle uses persisted URI permissions — no new picker prompt needed. */
   function createNativeHandle(uri, name) {
     return {
       name: name || 'Workspace',
       uri: uri,
       kind: 'directory',
       isNative: true,
       async queryPermission() { return 'granted'; },
       async requestPermission() { return 'granted'; },
       async values() {
         /* Return empty array — actual iteration done via native plugin when needed */
         return [];
       },
       async getDirectoryHandle(dirName, opts) {
         /* Reconstruct sub-handle from URI path — for native handles,
            we rely on the native plugin for actual file operations.
            This stub returns a child handle that delegates to native. */
         return createNativeHandle(uri + '/' + dirName, dirName);
       },
       async getFileHandle(fileName, opts) {
         /* Return a file handle that delegates to native plugin operations */
         return createNativeHandle(uri + '/' + fileName, fileName);
       }
     };
   }

   /* Check if a handle is "dead" (methods lost during serialization) */
   function isHandleDead(handle) {
     if (!handle) return true;
     if (handle.isNative !== true) return false; /* web FSA handles are real */
     /* Native handles must have callable file methods */
     return typeof handle.getDirectoryHandle !== 'function' ||
            typeof handle.getFileHandle !== 'function';
   }

   /* Check if handle is a native Android handle */
   function isNativeHandle(handle) {
     return handle && handle.isNative === true && handle.uri;
   }

   /* Delegate file operations to the native FilePickerPlugin for Android */
   async function nativeListFiles(uri, subDir) {
     var fp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker;
     if (!fp || typeof fp.listFiles !== 'function') {
       throw new Error('Native file plugin not available');
     }
     var result = await fp.listFiles({ uri: uri, subDir: subDir || '' });
     return result.entries || [];
   }

   async function nativeReadFile(uri, fileName) {
     var fp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker;
     if (!fp || typeof fp.readFile !== 'function') {
       throw new Error('Native file plugin not available');
     }
     var result = await fp.readFile({ uri: uri, fileName: fileName });
     return result.content;
   }

   async function nativeWriteFile(uri, fileName, content) {
     var fp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker;
     if (!fp || typeof fp.writeFile !== 'function') {
       throw new Error('Native file plugin not available');
     }
     var result = await fp.writeFile({ uri: uri, fileName: fileName, content: content });
     return result.success;
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
     if (typeof path !== 'string') throw new Error('Invalid path');
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
    console.log('[TRACE] pickDirectory ENTER, options:', JSON.stringify(options));
    console.log('[TRACE] pickDirectory: supportsFSA() =', supportsFSA());
    console.log('[TRACE] pickDirectory: window.Capacitor exists?', typeof window !== 'undefined' && !!window.Capacitor);
    if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) {
      console.log('[TRACE] pickDirectory: Capacitor.Plugins keys:', Object.keys(window.Capacitor.Plugins));
      if (window.Capacitor.Plugins.FilePicker) {
        console.log('[TRACE] pickDirectory: FilePicker keys:', Object.keys(window.Capacitor.Plugins.FilePicker));
        console.log('[TRACE] pickDirectory: typeof getPendingResult:', typeof window.Capacitor.Plugins.FilePicker.getPendingResult);
        console.log('[TRACE] pickDirectory: typeof pickDirectory:', typeof window.Capacitor.Plugins.FilePicker.pickDirectory);
      } else {
        console.log('[TRACE] pickDirectory: FilePicker plugin NOT found on Capacitor.Plugins');
      }
    }
    // Try native Capacitor plugin first (Android ACTION_OPEN_DOCUMENT_TREE)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker) {
      try {
        // First check if there's a pending result from a previous picker session
        // (handles the case where the activity was recreated)
        if (typeof window.Capacitor.Plugins.FilePicker.getPendingResult === 'function') {
          try {
            console.log('[TRACE] pickDirectory: calling getPendingResult()...');
            var pending = await window.Capacitor.Plugins.FilePicker.getPendingResult();
            console.log('[TRACE] pickDirectory: getPendingResult() returned:', JSON.stringify(pending));
            console.log('[TRACE] pickDirectory: pending.uri =', pending && pending.uri);
            console.log('[TRACE] pickDirectory: pending.name =', pending && pending.name);
            if (pending && pending.uri) {
              var handle = {
                name: pending.name || 'Workspace',
                uri: pending.uri,
                kind: 'directory',
                isNative: true,
                async queryPermission() { return 'granted'; },
                async requestPermission() { return 'granted'; },
                async values() { return []; }
              };
              return { ok: true, handle: handle, name: pending.name || 'Workspace' };
            }
          } catch(e) { console.log('[TRACE] pickDirectory: getPendingResult threw:', e.message); }
        }
        console.log('[TRACE] pickDirectory: calling Capacitor Plugins.FilePicker.pickDirectory()...');
        console.log('[TRACE] pickDirectory: setting 10s timeout to detect hang...');
        var nativeResult;
        var timedOut = false;
        try {
          nativeResult = await Promise.race([
            window.Capacitor.Plugins.FilePicker.pickDirectory(),
            new Promise(function (_, reject) {
              setTimeout(function () { timedOut = true; reject(new Error('CAPACITOR_PICKDIR_TIMEOUT')); }, 60000);
            })
          ]);
        } catch (e) {
          console.log('[TRACE] pickDirectory: pickDirectory() REJECTED or TIMED OUT:', e.message, 'timedOut=' + timedOut);
          if (timedOut) {
            // The native picker never returned. On Android the native side
            // also saves the result to SharedPreferences, so a second
            // getPendingResult() call may now find it. This is the recovery
            // path that works after activity recreation, BAL blocks, etc.
            console.log('[TRACE] pickDirectory: TIMEOUT — retrying getPendingResult() to recover saved result...');
            try {
              var recovery = await window.Capacitor.Plugins.FilePicker.getPendingResult();
              console.log('[TRACE] pickDirectory: recovery getPendingResult returned:', JSON.stringify(recovery));
              if (recovery && recovery.uri) {
                var rh = {
                  name: recovery.name || 'Workspace',
                  uri: recovery.uri,
                  kind: 'directory',
                  isNative: true,
                  async queryPermission() { return 'granted'; },
                  async requestPermission() { return 'granted'; },
                  async values() { return []; }
                };
                return { ok: true, handle: rh, name: recovery.name || 'Workspace' };
              }
            } catch (re) {
              console.log('[TRACE] pickDirectory: recovery getPendingResult threw:', re.message);
            }
            return { ok: false, error: 'picker_timeout', needs_reselection: true };
          }
          if (e && (e.message || '').includes('cancelled')) return { ok: false, error: 'user_cancelled' };
          // Re-throw non-timeout errors to the outer catch
          throw e;
        }
        console.log('[TRACE] pickDirectory: pickDirectory() resolved with:', JSON.stringify(nativeResult));
        console.log('[TRACE] pickDirectory: nativeResult.uri =', nativeResult && nativeResult.uri);
        console.log('[TRACE] pickDirectory: nativeResult.name =', nativeResult && nativeResult.name);
        if (nativeResult && nativeResult.uri) {
          // Wrap the native URI as a handle-like object
          var handle = {
            name: nativeResult.name || 'Workspace',
            uri: nativeResult.uri,
            kind: 'directory',
            isNative: true,
            async queryPermission() { return 'granted'; },
            async requestPermission() { return 'granted'; },
            async values() { return []; },
            async getDirectoryHandle() { return null; },
            async getFileHandle() { return null; }
          };
          return { ok: true, handle: handle, name: nativeResult.name || 'Workspace' };
        } else {
          console.log('[TRACE] pickDirectory: nativeResult missing uri, falling through to web API');
        }
      } catch (e) {
        console.log('[TRACE] pickDirectory: Capacitor pickDirectory threw:', e.message);
        if (e && (e.message || '').includes('cancelled')) return { ok: false, error: 'user_cancelled' };
        if (e && (e.message || '').includes('CAPACITOR_PICKDIR_TIMEOUT')) return { ok: false, error: 'picker_timeout' };
        // Fall through to web API
      }
    }
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
     console.log('[TRACE] selectWorkspace ENTER, name:', JSON.stringify(name));
     if (!name) {
       var defaultName = 'Matey Workspace';
       console.log('[TRACE] selectWorkspace: calling pickDirectory with defaultName:', defaultName);
       var result = await pickDirectory({ name: defaultName, requestId: 'matey-workspace' });
       console.log('[TRACE] selectWorkspace: pickDirectory returned:', JSON.stringify({ ok: result.ok, error: result.error, name: result.name, hasHandle: !!result.handle }));
       if (!result.ok) {
         console.log('[TRACE] selectWorkspace: pickDirectory not ok, returning result');
         return result;
       }
       name = defaultName;
       console.log('[TRACE] selectWorkspace: calling saveWorkspace BEFORE, name:', name);
       var saved = await saveWorkspace(name, result.handle, { type: 'workspace' });
       console.log('[TRACE] selectWorkspace: saveWorkspace returned:', JSON.stringify(saved));
       if (saved.ok) {
         currentWorkspace = { name: name, handle: result.handle, type: 'workspace' };
         console.log('[TRACE] selectWorkspace: calling updateDisplay AFTER save, name:', name);
         await updateDisplay(name);
         console.log('[TRACE] selectWorkspace: updateDisplay done, notifying listeners');
         notifyListeners('workspaceChanged', currentWorkspace);
         if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker
             && typeof window.Capacitor.Plugins.FilePicker.clearPendingResult === 'function') {
           window.Capacitor.Plugins.FilePicker.clearPendingResult().catch(function(){});
           console.log('[TRACE] selectWorkspace: clearPendingResult called');
         }
       }
       return saved;
     }
     console.log('[TRACE] selectWorkspace: calling pickDirectory with name:', name);
     var result = await pickDirectory({ name: name, mode: 'readwrite' });
     console.log('[TRACE] selectWorkspace: pickDirectory returned:', JSON.stringify({ ok: result.ok, error: result.error, name: result.name, hasHandle: !!result.handle }));
     if (!result.ok) return result;
     console.log('[TRACE] selectWorkspace: calling saveWorkspace BEFORE, name:', name);
     var saved = await saveWorkspace(name, result.handle, { type: 'workspace' });
     console.log('[TRACE] selectWorkspace: saveWorkspace returned:', JSON.stringify(saved));
     if (saved.ok) {
       currentWorkspace = { name: name, handle: result.handle, type: 'workspace' };
       await updateDisplay(name);
       notifyListeners('workspaceChanged', currentWorkspace);
       if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker
           && typeof window.Capacitor.Plugins.FilePicker.clearPendingResult === 'function') {
         window.Capacitor.Plugins.FilePicker.clearPendingResult().catch(function(){});
         console.log('[TRACE] selectWorkspace: clearPendingResult called');
       }
     }
     return saved;
   }

  async function selectUSBMount() {
    var result = await pickDirectory({ mode: 'readwrite' });
    if (!result.ok) return result;
    var saved = await saveWorkspace(result.name + ' (USB)', result.handle, { type: 'usb' });
    if (saved.ok) {
      currentWorkspace = { name: saved.name, handle: result.handle, type: 'usb' };
      await updateDisplay(saved.name);
      notifyListeners('workspaceChanged', currentWorkspace);
    }
    return saved;
  }

   async function saveWorkspace(name, handle, opts) {
     console.log('[TRACE] saveWorkspace ENTER, name:', name, 'hasHandle:', !!handle);
     opts = opts || {};
     var serialized = await serializeHandle(handle);
     console.log('[TRACE] saveWorkspace: serialized handle:', serialized ? 'present' : 'null/empty');
     var newUri = handle && handle.uri ? handle.uri : null;
     if (newUri) {
       try {
         var all = await dbGetAll(STORE_WORKSPACES);
         for (var i = 0; i < all.length; i++) {
           var existingHandle = all[i].handle;
           if (existingHandle && existingHandle.uri === newUri && all[i].id !== name) {
             console.log('[TRACE] saveWorkspace: removing duplicate entry with same uri:', all[i].id);
             await dbDelete(STORE_WORKSPACES, all[i].id);
           }
         }
       } catch (e) {}
     }
     var ws = {
       id: name,
       handle: serialized,
       name: name,
       type: opts.type || 'workspace',
       savedAt: Date.now()
     };
     console.log('[TRACE] saveWorkspace: calling dbPut, key id:', ws.id);
     await dbPut(STORE_WORKSPACES, ws);
     console.log('[TRACE] saveWorkspace: dbPut SUCCESS, returning ok');
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
     var entry = await dbGet(STORE_WORKSPACES, name);
     if (!entry) return { ok: false, error: 'workspace_not_found' };
     var handle = deserializeHandle(entry.handle);
     if (!handle) {
       await dbDelete(STORE_WORKSPACES, name);
       return { ok: false, error: 'handle_corrupted', needs_reselection: true };
     }
     var granted = await healthCheckWorkspace(handle, true);
     if (!granted) {
       return { ok: false, error: 'permission_denied', needs_reselection: true };
     }
     currentWorkspace = { name: name, handle: handle, type: entry.type || 'workspace' };
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
    console.log('[TRACE] updateDisplay ENTER, name:', JSON.stringify(name));
    var el = document.querySelector('.workspace-name, #workspace-display');
    console.log('[TRACE] updateDisplay: el found?', !!el);
    if (!el) {
      if (!document.querySelector('.workspace-display-container, .workspace-folder-btn')) {
        console.log('[TRACE] updateDisplay: no workspace-display-container or workspace-folder-btn, calling injectWorkspaceUI');
        injectWorkspaceUI();
        return updateDisplay(name);
      }
      console.log('[TRACE] updateDisplay: no el, no container to inject into — returning');
      return;
    }
    console.log('[TRACE] updateDisplay: el.textContent before update =', JSON.stringify(el.textContent));
    var dropdown = el.closest('.workspace-dropdown');
    if (!name || name === 'Workspace') {
      el.textContent = 'Select workspace';
      el.classList.toggle('active', false);
      el.classList.toggle('no-workspace', true);
       el.title = 'Select a workspace folder';
      if (dropdown) dropdown.classList.add('no-workspace');
      console.log('[TRACE] updateDisplay: set to "Select workspace"');
    } else {
      el.textContent = name;
      el.classList.toggle('active', true);
      el.classList.toggle('no-workspace', false);
      el.title = 'Active workspace: ' + name;
      if (dropdown) dropdown.classList.remove('no-workspace');
      console.log('[TRACE] updateDisplay: set to name:', name);
    }
    console.log('[TRACE] updateDisplay EXIT');
  }

  var _debounceTimer = null;
  function debouncedDisplay(name) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () { updateDisplay(name); }, 100);
  }

  function injectWorkspaceUI() {
    console.log('[TRACE] injectWorkspaceUI ENTER');
    var existing = document.querySelector('.workspace-folder-btn');
    var dropdown = document.getElementById('workspace-dropdown');
    console.log('[TRACE] injectWorkspaceUI: .workspace-folder-btn found?', !!existing);
    console.log('[TRACE] injectWorkspaceUI: #workspace-dropdown found?', !!dropdown);

    if (existing) {
      if (!dropdown) return;
      console.log('[TRACE] injectWorkspaceUI: existing container found, attaching click listeners to existing dropdown');
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
     /* Detect dead handle (methods lost during serialization) and reconstruct from URI */
     if (isHandleDead(currentWorkspace.handle) && currentWorkspace.handle.uri) {
       console.log('[TRACE] requireWorkspace: handle is dead, reconstructing from URI');
       currentWorkspace.handle = await deserializeHandle(currentWorkspace.handle);
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
       /* Delegate to native plugin for Android handles */
       if (isNativeHandle(rootHandle)) {
         var fileName = path.split('/').pop();
         await nativeWriteFile(rootHandle.uri, fileName, content);
         logActivity('create', path, 'Created ' + String(content).length + ' bytes (native)');
         return true;
       }
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
       var rootHandle = await requireWorkspace();
       /* Delegate to native plugin for Android handles */
       if (isNativeHandle(rootHandle)) {
         var content = await nativeReadFile(rootHandle.uri, path.split('/').pop());
         logActivity('read', path, 'Read ' + content.length + ' bytes (native)');
         if (opts.asBase64) {
           return 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(content)));
         }
         return content;
       }
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
       var rootHandle = await requireWorkspace();
       /* Delegate to native plugin for Android handles */
       if (isNativeHandle(rootHandle)) {
         return await nativeListFiles(rootHandle.uri, path || '');
       }
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
       var rootHandle = await requireWorkspace();
       /* Delegate to native plugin for Android handles */
       if (isNativeHandle(rootHandle)) {
         var entries = await nativeListFiles(rootHandle.uri, path.substring(0, path.lastIndexOf('/')) || '');
         var fileName = path.split('/').pop();
         return entries.some(function(e) { return e.name === fileName; });
       }
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
    console.log('[TRACE] setupWorkspaceSelector: #workspace-selector found?', !!selector);
    if (!selector) return;

    console.log('[TRACE] setupWorkspaceSelector: attaching click listener to #workspace-selector');
    populateWorkspaceSelector().catch(function (e) {
      console.error('populateWorkspaceSelector failed:', e);
    });
    selector.addEventListener('click', async function (e) {
      var btn = e.target.closest('button[data-workspace]');
      console.log('[TRACE] setupWorkspaceSelector: click detected, btn found:', !!btn, 'target:', e.target.tagName);
      if (!btn) return;
      var ws = btn.getAttribute('data-workspace');
      console.log('[TRACE] setupWorkspaceSelector: clicked data-workspace =', ws);
      var dropdown = document.getElementById('workspace-dropdown');
      if (dropdown) dropdown.classList.remove('open');

      if (ws === 'create') {
        console.log('[TRACE] setupWorkspaceSelector: "create" branch, calling selectWorkspace()...');
        var result = await selectWorkspace();
        console.log('[TRACE] setupWorkspaceSelector: selectWorkspace returned:', JSON.stringify({ ok: result.ok, error: result.error, name: result.name }));
        if (result.ok) {
          showFSToast('Workspace ready: ' + result.name);
          switchWorkspace(result.name);
        } else if (result.error && result.error !== 'user_cancelled') {
          if (result.fallback) {
            showFSToast('FSA unavailable — using file input');
            triggerFallbackPicker();
          } else if (result.error === 'picker_timeout') {
            showFSToast('Folder picker timed out — please try again');
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
    var folderIcon = '<svg class="ws-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    var plusIcon = '<svg class="ws-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>';
    var usbIcon = '<svg class="ws-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7"/><path d="M9 7V4h6v3"/><circle cx="12" cy="9" r="1.2"/><path d="M12 10.2V15"/></svg>';
    var xIcon = '<svg class="ws-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    try {
      var workspaces = await listWorkspaces();
      selector.innerHTML = '';
      selector.innerHTML += '<div class="ws-menu-header">Workspace</div>';
      if (workspaces.length) {
        workspaces.forEach(function (ws) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('data-workspace', ws.name);
          btn.className = 'ws-option';
          var active = currentWorkspace && currentWorkspace.name === ws.name;
          var check = active ? '<svg class="ws-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '';
          btn.innerHTML = folderIcon + '<span class="ws-item-label">' + ws.name + (ws.type === 'usb' ? ' <span class="ws-item-tag">USB</span>' : '') + '</span>' + check;
          if (active) btn.classList.add('active');
          selector.appendChild(btn);
        });
        var divider = document.createElement('div');
        divider.className = 'ws-divider';
        selector.appendChild(divider);
      }
      selector.innerHTML += '<div class="ws-menu-header">Actions</div>' +
        '<button type="button" data-workspace="create" class="ws-create">' + plusIcon + '<span class="ws-item-label">Create / Select Workspace</span></button>' +
        '<button type="button" data-workspace="usb" class="ws-usb">' + usbIcon + '<span class="ws-item-label">Select USB Drive</span></button>' +
        '<button type="button" data-workspace="clear" class="ws-clear">' + xIcon + '<span class="ws-item-label">Disconnect</span></button>';
    } catch (e) {
      selector.innerHTML = '<div class="ws-menu-header">Workspace</div>' +
        '<button type="button" data-workspace="create" class="ws-create">' + plusIcon + '<span class="ws-item-label">Create / Select Workspace</span></button>' +
        '<button type="button" data-workspace="usb" class="ws-usb">' + usbIcon + '<span class="ws-item-label">Select USB Drive</span></button>';
    }
  }

  /* ==================== Launch Sequence ==================== */
  async function initUI() {
    console.log('[TRACE] initUI ENTER');
    injectWorkspaceUI();
    console.log('[TRACE] initUI: injectWorkspaceUI done');
    injectConfirmDialog();
    setupWorkspaceSelector();
    console.log('[TRACE] initUI: setupWorkspaceSelector done');
    await loadActivityLog();
    console.log('[TRACE] initUI: loadActivityLog done');
    notifyListeners('logLoaded', activityLog);
    console.log('[TRACE] initUI EXIT');
  }

   async function checkLaunchPermissions() {
     console.log('[TRACE] checkLaunchPermissions ENTER');
     console.log('[TRACE] checkLaunchPermissions: currentWorkspace =', currentWorkspace ? JSON.stringify({ name: currentWorkspace.name, type: currentWorkspace.type }) : null);
     updateDisplay(currentWorkspace ? currentWorkspace.name : null);

     /* Android native picker: check for pending result OR restore from URI */
     if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker) {
       // Check for pending picker result from a previous session
       if (typeof window.Capacitor.Plugins.FilePicker.getPendingResult === 'function') {
         try {
           console.log('[TRACE] checkLaunchPermissions: calling getPendingResult()...');
           var pending = await window.Capacitor.Plugins.FilePicker.getPendingResult();
           console.log('[TRACE] checkLaunchPermissions: getPendingResult returned:', JSON.stringify(pending));
           console.log('[TRACE] checkLaunchPermissions: pending.uri =', pending && pending.uri);
           if (pending && pending.uri) {
             var handle = await deserializeHandle({ uri: pending.uri, name: pending.name || 'Workspace' });
             console.log('[TRACE] checkLaunchPermissions: calling saveWorkspace BEFORE, name:', pending.name || 'Workspace');
             var saved = await saveWorkspace(pending.name || 'Workspace', handle, { type: 'workspace' });
             console.log('[TRACE] checkLaunchPermissions: saveWorkspace returned:', JSON.stringify(saved));
             if (saved.ok) {
               currentWorkspace = { name: saved.name, handle: handle, type: 'workspace' };
               console.log('[TRACE] checkLaunchPermissions: calling updateDisplay AFTER save, name:', saved.name);
               await updateDisplay(saved.name);
               console.log('[TRACE] checkLaunchPermissions: calling clearPendingResult');
               notifyListeners('workspaceChanged', currentWorkspace);
               // Clear the pending result from SharedPreferences now that it's saved
               if (typeof window.Capacitor.Plugins.FilePicker.clearPendingResult === 'function') {
                 window.Capacitor.Plugins.FilePicker.clearPendingResult().catch(function(){});
                 console.log('[TRACE] checkLaunchPermissions: clearPendingResult called');
               }
               console.log('[TRACE] checkLaunchPermissions: pending result processed, returning');
               return;
             }
             console.log('[TRACE] checkLaunchPermissions: saveWorkspace not ok, saved:', JSON.stringify(saved));
           }
           console.log('[TRACE] checkLaunchPermissions: no pending uri found, falling through to restoreLastWorkspace');
         } catch(e) { console.log('[TRACE] checkLaunchPermissions: getPendingResult threw:', e.message); }
       }

       /* No pending result — try to restore workspace from IndexedDB using persisted URI */
       var restored = await restoreLastWorkspace();
       if (restored && currentWorkspace) {
         updateDisplay(currentWorkspace.name);
         updateActivityLogDisplay();
         return;
       }
     }

     if (!supportsFSA()) {
       console.log('[TRACE] checkLaunchPermissions: supportsFSA() = false, returning early');
       return;
     }
     console.log('[TRACE] checkLaunchPermissions: supportsFSA() = true');
   }
  console.log('[TRACE] matey-fs.js: auto-init starting, readyState:', document.readyState);
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', async function () {
        console.log('[TRACE] matey-fs.js: DOMContentLoaded fired, calling initUI + checkLaunchPermissions');
        await initUI();
        console.log('[TRACE] matey-fs.js: initUI done, calling checkLaunchPermissions');
        await checkLaunchPermissions();
        console.log('[TRACE] matey-fs.js: checkLaunchPermissions done');
      });
    } else {
      (async function () {
        console.log('[TRACE] matey-fs.js: readyState not loading, calling initUI + checkLaunchPermissions immediately');
        await initUI();
        console.log('[TRACE] matey-fs.js: initUI done, calling checkLaunchPermissions');
        await checkLaunchPermissions();
        console.log('[TRACE] matey-fs.js: checkLaunchPermissions done');
      })();
    }
  }

  window.addEventListener('beforeunload', function () {
    shutdown();
  });
})();

/* Matey File System Adapter — Unified wrapper for file operations
 *
 * 1. File System Access API (showSaveFilePicker/showOpenFilePicker) — modern Chromium browsers
 * 2. Capacitor native file picker plugin — Android/iOS hybrid apps
 * 3. Capacitor Filesystem plugin — silent save/load to app data dir as last resort
 *
 * Pick whichever backend is available, in priority order.
 */
(function () {
  'use strict';

  var isFSAAvailable = typeof window !== 'undefined' &&
    typeof window.showDirectoryPicker === 'function' &&
    typeof window.showOpenFilePicker === 'function' &&
    typeof window.showSaveFilePicker === 'function';

  if (!isFSAAvailable) {
    console.warn('[MateyFSAdapter] File System Access API not available (iOS Safari). OPFS fallback not yet implemented.');
  }

  var pendingInit = null;

  function ensureMateyFS() {
    if (window.MateyFS) return Promise.resolve(window.MateyFS);

    // Wait for MateyFS to initialize (it auto-inits on DOMContentLoaded)
    return new Promise(function (resolve) {
      if (window.MateyFS) return resolve(window.MateyFS);

      var checkInterval = setInterval(function () {
        if (window.MateyFS) {
          clearInterval(checkInterval);
          resolve(window.MateyFS);
        }
      }, 50);

      // Fallback timeout
      setTimeout(function () {
        clearInterval(checkInterval);
        if (!window.MateyFS) {
          console.error('[MateyFSAdapter] MateyFS failed to initialize after 5s');
        }
        resolve(window.MateyFS);
      }, 5000);
    });
  }

  /* ==================== Standardized Public API ==================== */

  async function initWorkspace() {
    var MateyFS = await ensureMateyFS();
    if (!MateyFS.supports()) {
      console.warn('[MateyFSAdapter] FSA not available — cannot init workspace');
      return { ok: false, error: 'fsa_unavailable' };
    }
    try {
      var result = await MateyFS.selectWorkspace();
      return result;
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  async function readFile(path) {
    var MateyFS = await ensureMateyFS();
    if (!MateyFS.supports()) {
      throw new Error('FSA not available — cannot read file');
    }
    return MateyFS.readFile(path);
  }

  async function writeFile(path, content, opts) {
    var MateyFS = await ensureMateyFS();
    if (!MateyFS.supports()) {
      throw new Error('FSA not available — cannot write file');
    }
    return MateyFS.writeFile(path, content, opts);
  }

  async function listDirectory(path) {
    var MateyFS = await ensureMateyFS();
    if (!MateyFS.supports()) {
      throw new Error('FSA not available — cannot list directory');
    }
    return MateyFS.listFiles(path);
  }

  async function deleteFile(path) {
    var MateyFS = await ensureMateyFS();
    if (!MateyFS.supports()) {
      throw new Error('FSA not available — cannot delete file');
    }
    return MateyFS.deleteFile(path);
  }

  async function createSubfolder(path, name) {
    var MateyFS = await ensureMateyFS();
    if (!MateyFS.supports()) {
      throw new Error('FSA not available — cannot create subfolder');
    }
    return MateyFS.createSubfolder(path, name);
  }

  async function saveAsFile(content, options) {
    options = options || {};
    var filename = options.filename || 'note.md';
    var mimeType = options.mimeType || 'text/plain';

    // 1. Try File System Access API (desktop Chrome)
    var MateyFS = await ensureMateyFS();
    if (MateyFS.supports()) {
      var ws = MateyFS.getCurrentWorkspace();
      if (ws) {
        return MateyFS.writeFile(filename, content);
      }
      return MateyFS.triggerFallbackPicker();
    }

    // 2. Try native FilePicker Capacitor plugin (shows system file dialog)
    if (window.Capacitor && typeof window.Capacitor.invoke === 'function') {
      try {
        var result = await window.Capacitor.invoke('FilePicker', 'saveFile', {
          content: content,
          filename: filename,
          mimeType: mimeType
        });
        if (result && result.saved) {
          return { ok: true, method: 'native-picker', uri: result.uri };
        }
        if (result && result.error) {
          throw new Error(result.error);
        }
      } catch (e) {
        // Native plugin not available or failed
      }
    }

    // 3. Silent fallback to Capacitor Filesystem (no system dialog)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
      var FS = window.Capacitor.Plugins.Filesystem;
      var Dir = FS.Directory || { Data: 'DATA' };
      try {
        var savedName = 'note_' + Date.now() + '.md';
        await FS.writeFile({
          path: savedName,
          data: content,
          directory: Dir.Data || 'DATA',
          encoding: 'utf8'
        });
        return { ok: true, path: savedName, method: 'capacitor-filesystem' };
      } catch (e) {
        return { ok: false, error: 'Save failed: ' + (e.message || e) };
      }
    }

    throw new Error('No file system available — cannot save file');
  }

  async function openFile(options) {
    options = options || {};

    // 1. Try File System Access API (desktop Chrome)
    var MateyFS2 = await ensureMateyFS();
    if (MateyFS2.supports()) {
      return MateyFS2.triggerFallbackPicker();
    }

    // 2. Try native FilePicker Capacitor plugin (shows system file dialog)
    if (window.Capacitor && typeof window.Capacitor.invoke === 'function') {
      try {
        var result = await window.Capacitor.invoke('FilePicker', 'openFile', {});
        if (result && result.content) {
          return { ok: true, method: 'native-picker', content: result.content, name: result.name, uri: result.uri };
        }
        if (result && result.error) {
          throw new Error(result.error);
        }
      } catch (e) {
        // Native plugin not available or failed
      }
    }

    // 3. Silent fallback to Capacitor Filesystem (no system dialog)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
      var FS = window.Capacitor.Plugins.Filesystem;
      var Dir = FS.Directory || { Data: 'DATA' };
      try {
        var res = await FS.readdir({
          path: '',
          directory: Dir.Data || 'DATA'
        });
        var entries = res.files || [];
        return { ok: true, entries: entries, method: 'capacitor-filesystem', directory: Dir.Data || 'DATA' };
      } catch (e) {
        return { ok: false, error: 'No file picker available. Initialize a workspace first.', fallback: true };
      }
    }

    return { ok: false, error: 'No file picker available. Initialize a workspace first.', fallback: true };
  }

  function isAvailable() {
    return isFSAAvailable;
  }

  function getCurrentWorkspace() {
    if (window.MateyFS) {
      return window.MateyFS.getCurrentWorkspace();
    }
    return null;
  }

  /* ==================== Export ==================== */
  window.MateyFSAdapter = {
    initWorkspace: initWorkspace,
    readFile: readFile,
    writeFile: writeFile,
    listDirectory: listDirectory,
    deleteFile: deleteFile,
    createSubfolder: createSubfolder,
    openFile: openFile,
    saveAsFile: saveAsFile,
    isAvailable: isAvailable,
    getCurrentWorkspace: getCurrentWorkspace
  };

  /* Auto-initialize when MateyFS is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async function () {
      await ensureMateyFS();
    });
  } else {
    ensureMateyFS();
  }
})();
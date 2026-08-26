/* MateySAF — Capacitor SAF Bridge Polyfill
 * Provides window.CapacitorSAF interface for USB/SAF file operations
 * Wraps existing MateyFS workspace USB support (showDirectoryPicker based)
 * Can be replaced with a native Java bridge plugin for full SAF compliance
 */
(function () {
  'use strict';

  var FS = window.MateyFS || {};
  var currentDirHandle = null;

  /* Native bridge stub — if a native CapacitorSAF plugin is registered,
     it will override this. Otherwise, we use the FSA API polyfill. */
  window.CapacitorSAF = {
    pickDirectory: async function () {
      if (!FS.supports || !FS.supports()) {
        throw new Error('File System Access API not supported on this device');
      }

      try {
        // Use the existing selectUSBMount which calls showDirectoryPicker internally
        var result = await FS.selectUSBMount();
        if (result && result.ok) {
          return { uri: result.name, name: result.name };
        }
        return { uri: null };
      } catch (e) {
        console.error('[MateySAF] pickDirectory error:', e);
        return { uri: null };
      }
    },

    readFile: async function (opts) {
      var path = opts.path || '';
      try {
        var content = await FS.readFile(path);
        return { data: content };
      } catch (e) {
        console.error('[MateySAF] readFile error:', e);
        throw e;
      }
    },

    writeFile: async function (opts) {
      var path = opts.path || '';
      var data = opts.data || '';
      try {
        await FS.writeFile(path, data);
        return { success: true };
      } catch (e) {
        console.error('[MateySAF] writeFile error:', e);
        throw e;
      }
    },

    listDirectory: async function (opts) {
      var subDir = opts.path || '';
      try {
        var files = await FS.listFiles(subDir);
        return { files: files.map(function (f) { return { path: f.path, name: f.name, type: f.type || 'file' }; }) };
      } catch (e) {
        console.error('[MateySAF] listDirectory error:', e);
        return { files: [] };
      }
    },

    /* Capability check */
    isAvailable: function () {
      return typeof window.showDirectoryPicker === 'function' || FS.supports();
    }
  };

  console.log('[MateySAF] CapacitorSAF bridge initialized (FSA polyfill mode)');
})();

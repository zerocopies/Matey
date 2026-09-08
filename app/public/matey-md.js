/* Matey Editor — File System Access API backed text editor
 *
 * Features:
 *   - Real file persistence via MateyFSAdapter (File System Access API)
 *   - File handle persisted in IndexedDB for subsequent saves
 *   - Markdown/syntax-aware note vault (permanent, scratchpad, silent, priority, math)
 *   - File attachment handling with preview rendering
 *   - Toolbar with New, Open, Save, Save As actions
 *
 * Usage:
 *   - Auto-initialized on page load via <script src="matey-md.js">
 *   - MateySyntax.parse() integrates with the syntax engine
 */
(function () {
  'use strict';

  var editor;
  var resultEl;
  var attachmentList;
  var currentAttachments = [];
  var SAVE_DELAY = 600;
  var saveTimer = null;

  /* File handle state (kept for backward compat with localStorage backup) */
  var fileHandle = null;
  var isNewFile = true;

  /* ==================== IndexedDB for file handle persistence ==================== */
  var DB_NAME = 'MateyEditor';
  var DB_VERSION = 1;
  var STORE_HANDLES = 'fileHandles';
  var db = null;

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_HANDLES)) {
          db.createObjectStore(STORE_HANDLES, { keyPath: 'id' });
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

  /* ==================== File Handle Serialization (legacy backup) ==================== */
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
    return window.MateyFSAdapter && window.MateyFSAdapter.isAvailable();
  }

  /* ==================== File Operations (via MateyFSAdapter) ==================== */
  async function getPersistedFileHandle() {
    try {
      var entry = await dbGet(STORE_HANDLES, 'editor-file');
      if (entry && entry.handle) {
        var handle = deserializeHandle(entry.handle);
        if (handle) {
          var permission = await handle.queryPermission({ mode: 'readwrite' });
          if (permission === 'granted') {
            return handle;
          }
        }
      }
    } catch (e) {
      console.warn('[MateyEditor] Failed to load persisted handle:', e);
    }
    return null;
  }

  async function persistFileHandle(handle) {
    try {
      var serialized = await serializeHandle(handle);
      await dbPut(STORE_HANDLES, { id: 'editor-file', handle: serialized, updated: Date.now() });
    } catch (e) {
      console.warn('[MateyEditor] Failed to persist handle:', e);
    }
  }

  async function clearPersistedHandle() {
    try {
      await dbDelete(STORE_HANDLES, 'editor-file');
    } catch (e) {}
  }

   async function saveFile() {
    if (!editor) return false;

    var content = editor.value;

    try {
      if (!fileHandle || isNewFile) {
        // Use MateyFSAdapter to save file (FSA, native picker, or Capacitor fallback)
        var result = await window.MateyFSAdapter.saveAsFile(content, {
          filename: currentFilename || 'note.md',
          mimeType: 'text/plain'
        });
        if (result && result.ok) {
          if (result.handle) {
           fileHandle = result.handle;
            isNewFile = false;
            await persistFileHandle(fileHandle);
          }
          if (result.path) {
            currentFilename = result.path;
          }
          showNotification(result.method === 'native-picker' ? 'Saved to file' : 'Saved to app storage');
          return true;
        } else {
          showNotification('Save failed: ' + (result.error || 'unknown error'));
          return false;
        }
      }

      // Save to existing file handle
      await saveToFile(fileHandle, editor.value);
      showNotification('Saved to file');
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') {
        showNotification('Save cancelled');
        return false;
      }
      console.error('[MateyEditor] Save failed:', e);
      showNotification('Save failed: ' + (e.message || e));
      return false;
    }
  }

  async function saveAsFile() {
    if (!editor) return false;

    try {
      var result = await window.MateyFSAdapter.saveAsFile(editor.value, {
        filename: currentFilename || 'note.md',
        mimeType: 'text/plain'
      });
      if (result && result.ok) {
        if (result.handle) {
          fileHandle = result.handle;
          isNewFile = false;
          await persistFileHandle(fileHandle);
        }
        if (result.path) {
          currentFilename = result.path;
        }
        showNotification(result.method === 'native-picker' ? 'Saved to file' : 'Saved to app storage');
        return true;
      } else {
        showNotification('Save failed: ' + (result.error || 'unknown error'));
        return false;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        showNotification('Save As cancelled');
        return false;
      }
      console.error('[MateyEditor] Save As failed:', e);
      showNotification('Save As failed: ' + (e.message || e));
      return false;
    }
  }

  async function openFile() {
    try {
      var result = await window.MateyFSAdapter.openFile();
      if (result && result.ok && result.content) {
        // Native picker returned file content directly
        editor.value = result.content;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        if (result.name) currentFilename = result.name;
        showNotification('File opened');
        return true;
      } else if (result && result.handle) {
        // FSA handle returned
        fileHandle = result.handle;
        isNewFile = false;
        await persistFileHandle(fileHandle);
        var content = await readFromFile(fileHandle);
        editor.value = content;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        showNotification('File opened');
        return true;
      } else if (result && result.entries) {
        // Capacitor Filesystem returned a list
        showNotification('Select a file from app storage');
        return false;
      }
      return false;
    } catch (e) {
      if (e && e.name === 'AbortError') {
        showNotification('Open cancelled');
        return false;
      }
      console.error('[MateyEditor] Open failed:', e);
      showNotification('Open failed: ' + (e.message || e));
      return false;
    }
  }

  async function newFile() {
    if (editor.value && editor.value.trim()) {
      var shouldSave = confirm('Current file has unsaved changes. Save before creating new file?');
      if (shouldSave) {
        var saved = await saveFile();
        if (!saved) return false;
      }
    }

    fileHandle = null;
    isNewFile = true;
    editor.value = '';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    showNotification('New file created');
  }

  async function saveToFile(handle, content) {
    var writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async function readFromFile(handle) {
    var file = await handle.getFile();
    return await file.text();
  }

  /* ==================== Utility helpers ==================== */
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (c) {
      return { '&': '&', '<': '<', '>': '>', '"': '"', "'": "'" }[c];
    });
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var k = 1024, units = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
  }

  function getFileTypeIcon(type, name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    if (!type && ext) type = extToMime(ext);
    if (type && type.startsWith('image/')) return '🖼️';
    if (type && type.includes('pdf')) return '📄';
    if (type && (type.includes('word') || type.includes('doc') || ext === 'docx' || ext === 'doc' || ext === 'odt')) return '📝';
    if (type && type.startsWith('text/') || ext === 'txt' || ext === 'csv' || ext === 'json' || ext === 'xml' || ext === 'html' || ext === 'md') return '📝';
    if (type && type.startsWith('video/')) return '🎥';
    if (type && type.startsWith('audio/')) return '🎵';
    if (type && (type.includes('zip') || type.includes('archive') || ext === 'zip' || ext === 'rar' || ext === '7z' || ext === 'tar')) return '📦';
    if (type && type.includes('spreadsheet') || ext === 'xlsx' || ext === 'xls' || ext === 'ods') return '📊';
    if (type && type.includes('presentation') || ext === 'pptx' || ext === 'ppt' || ext === 'odp') return '📊';
    if (ext === 'js' || ext === 'ts' || ext === 'py' || ext === 'java' || ext === 'cpp' || ext === 'c' || ext === 'h' || ext === 'css' || ext === 'scss' || ext === 'sh' || ext === 'rb' || ext === 'go' || ext === 'rs') return '💻';
    if (ext === 'mp3' || ext === 'wav' || ext === 'flac' || ext === 'ogg') return '🎵';
    if (ext === 'mp4' || ext === 'webm' || ext === 'avi' || ext === 'mov') return '🎥';
    return '📎';
  }

  function extToMime(ext) {
    var map = {
      txt: 'text/plain', md: 'text/markdown', json: 'application/json',
      csv: 'text/csv', xml: 'application/xml', html: 'text/html', htm: 'text/html',
      css: 'text/css', js: 'application/javascript', ts: 'text/typescript',
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      zip: 'application/zip', rar: 'application/x-rar-compressed',
      mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm; codecs=opus',
      mp4: 'video/mp4', webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg',
      jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp'
    };
    return map[ext] || '';
  }

  function getFileCategory(file) {
    var type = (file.type || '').toLowerCase();
    var ext = (file.name || '').split('.').pop().toLowerCase();
    if (type.startsWith('image/')) return 'image';
    if (type === 'application/pdf') return 'pdf';
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx' || ext === 'doc') return 'docx';
    if (type.startsWith('text/') || ['txt','csv','json','xml','html','htm','md','js','ts','py','java','cpp','c','h','css','scss','sh','rb','go','rs'].indexOf(ext) !== -1) return 'text';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'audio';
    if (type === 'application/zip' || ext === 'zip' || ext === 'rar' || ext === '7z' || ext === 'tar') return 'archive';
    if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === 'xlsx' || ext === 'xls') return 'spreadsheet';
    if (type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || ext === 'pptx' || ext === 'ppt') return 'presentation';
    return 'other';
  }

  /* ==================== Attachment handling (kept from legacy) ==================== */
  function loadAttachments() {
    try {
      var raw = localStorage.getItem('matey-markdown-attachments');
      if (raw) {
        var items = JSON.parse(raw);
        currentAttachments = items.map(function (item) {
          var file = {
            id: item.id,
            name: item.name,
            size: item.size,
            type: item.type,
            category: item.category || getFileCategory({ type: item.type, name: item.name }),
            preview: item.preview || null
          };
          return file;
        });
      }
    } catch (e) {
      console.warn('[MateyEditor] Failed to load attachments:', e);
      currentAttachments = [];
    }
  }

  function renderAttachments() {
    if (!attachmentList) {
      attachmentList = document.getElementById('md-attachment-list');
      if (!attachmentList) return;
    }

    if (!currentAttachments.length) {
      attachmentList.style.display = 'none';
      return;
    }

    attachmentList.style.display = 'block';
    attachmentList.innerHTML = '';

    currentAttachments.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'md-attachment-item';
      div.setAttribute('data-id', item.id);

      var contentHtml = '';

      if (item.category === 'image' && item.preview) {
        contentHtml = '<img src="' + item.preview + '" class="md-attachment-thumb" alt="' + escapeHtml(item.name) + '" />';
      } else if (item.category === 'text' && item.preview) {
        contentHtml = '<pre class="md-attachment-text">' + escapeHtml(item.preview.substring(0, 200)) + (item.preview.length > 200 ? '…' : '') + '</pre>';
      } else if (item.category === 'pdf' && item.preview) {
        contentHtml = '<pre class="md-attachment-text">' + escapeHtml(item.preview.substring(0, 200)) + (item.preview.length > 200 ? '…' : '') + '</pre>';
      } else if (item.category === 'docx' && item.preview) {
        contentHtml = '<pre class="md-attachment-text">' + escapeHtml(item.preview.substring(0, 200)) + (item.preview.length > 200 ? '…' : '') + '</pre>';
      } else if (item.category === 'audio' && item.preview) {
        contentHtml = '<audio controls class="md-attachment-media"><source src="' + item.preview + '" type="' + (item.type || 'audio/mpeg') + '">Your browser does not support audio</audio>';
      } else if (item.category === 'video' && item.preview) {
        contentHtml = '<video controls class="md-attachment-media"><source src="' + item.preview + '" type="' + (item.type || 'video/mp4') + '">Your browser does not support video</video>';
      } else {
        var icon = getFileTypeIcon(item.type, item.name);
        contentHtml = '<div class="md-attachment-icon">' + icon + '</div>';
      }

      div.innerHTML = contentHtml;

      var info = document.createElement('div');
      info.className = 'md-attachment-info';
      info.innerHTML = '<div class="md-attachment-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</div>' +
        '<div class="md-attachment-size">' + formatFileSize(item.size) + '</div>';
      div.appendChild(info);

      var removeBtn = document.createElement('button');
      removeBtn.className = 'md-attachment-remove';
      removeBtn.type = 'button';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Remove';
      (function (itemId) {
        removeBtn.addEventListener('click', function () {
          removeAttachment(itemId);
        });
      })(item.id);
      div.appendChild(removeBtn);

      attachmentList.appendChild(div);
    });
  }

  function removeAttachment(id) {
    currentAttachments = currentAttachments.filter(function (a) { return a.id !== id; });
    saveAttachments();
    renderAttachments();
  }

  function saveAttachments() {
    var meta = currentAttachments.map(function (a) {
      return {
        id: a.id,
        name: a.name,
        size: a.size,
        type: a.type,
        category: a.category,
        preview: a.preview || null
      };
    });
    try { localStorage.setItem('matey-markdown-attachments', JSON.stringify(meta)); } catch (e) {}
  }

  function extractFileContent(file, callback) {
    var category = getFileCategory(file);

    if (category === 'image') {
      var reader = new FileReader();
      reader.onload = function (e) { callback({ preview: e.target.result, category: category }); };
      reader.readAsDataURL(file);
    } else if (category === 'text') {
      var reader2 = new FileReader();
      reader2.onload = function (e) { callback({ preview: e.target.result, category: category }); };
      reader2.onerror = function () { callback({ preview: null, category: category }); };
      reader2.readAsText(file);
    } else if (category === 'pdf') {
      var reader3 = new FileReader();
      reader3.onload = function (e) {
        var arrayBuffer = e.target.result;
        if (typeof pdfjsLib !== 'undefined') {
          var loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          loadingTask.promise.then(function (pdf) {
            var text = '';
            var pages = [];
            for (var i = 1; i <= pdf.numPages; i++) { pages.push(pdf.getPage(i)); }
            Promise.all(pages).then(function (pageResults) {
              var getText = function (page) {
                return page.getTextContent().then(function (tc) {
                  return tc.items.map(function (item) { return item.str; }).join('');
                });
              };
              Promise.all(pageResults.map(getText)).then(function (texts) {
                callback({ preview: texts.join('\n\n'), category: category });
              }).catch(function () { callback({ preview: null, category: category }); });
            }).catch(function () { callback({ preview: '[Could not extract text from PDF]', category: category }); });
          }).catch(function () { callback({ preview: null, category: category }); });
        } else {
          callback({ preview: null, category: category });
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (category === 'docx') {
      var reader4 = new FileReader();
      reader4.onload = function (e) {
        if (typeof mammoth !== 'undefined') {
          var data = new Uint8Array(e.target.result);
          mammoth.extract_raw_text({ data: data }).then(function (r) {
            callback({ preview: r.value, category: category });
          }).catch(function () { callback({ preview: null, category: category }); });
        } else {
          callback({ preview: null, category: category });
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (category === 'audio' || category === 'video') {
      var reader5 = new FileReader();
      reader5.onload = function (e) { callback({ preview: e.target.result, category: category }); };
      reader5.onerror = function () { callback({ preview: null, category: category }); };
      reader5.readAsDataURL(file);
    } else {
      callback({ preview: null, category: category });
    }
  }

  function initAttachments() {
     var btn = document.getElementById('md-attach-btn');
     if (!btn) return;

     attachmentList = document.getElementById('md-attachment-list');

     btn.addEventListener('click', function () {
       var input = document.createElement('input');
       input.type = 'file';
       input.multiple = true;
       input.accept = '*/*';
       /* Must be in DOM for click() to work on Android WebView */
       input.style.position = 'fixed';
       input.style.opacity = '0';
       input.style.width = '0';
       input.style.height = '0';
       input.style.overflow = 'hidden';
       input.style.pointerEvents = 'none';
       document.body.appendChild(input);
       input.onchange = function (e) {
         var files = Array.from(e.target.files || []);
         if (!files.length) return;
         files.forEach(function (file) {
           var item = {
             id: Date.now().toString() + '_' + Math.random().toString(36).slice(2),
             name: file.name,
             size: file.size,
             type: file.type || extToMime(file.name.split('.').pop().toLowerCase()) || 'application/octet-stream',
             category: getFileCategory(file),
             preview: null
           };
           currentAttachments.push(item);

           extractFileContent(file, function (result) {
             item.preview = result.preview;
             item.category = result.category || item.category;
             saveAttachments();
             renderAttachments();
           });
         });
         e.target.value = '';
         if (input.parentNode) input.parentNode.removeChild(input);
       };
       input.click();
     });

    var existingRemove = attachmentList;
    if (existingRemove) {
      existingRemove.addEventListener('click', function (e) {
        var btn2 = e.target.closest('.md-attachment-remove');
        if (!btn2) return;
        e.preventDefault();
        var id = btn2.closest('.md-attachment-item').getAttribute('data-id');
        if (id) removeAttachment(id);
      });
    }
  }

  function removeAttachment(id) {
    currentAttachments = currentAttachments.filter(function (a) { return a.id !== id; });
    saveAttachments();
    renderAttachments();
  }

  function saveAttachments() {
    var meta = currentAttachments.map(function (a) {
      return {
        id: a.id,
        name: a.name,
        size: a.size,
        type: a.type,
        category: a.category,
        preview: a.preview || null
      };
    });
    try { localStorage.setItem('matey-markdown-attachments', JSON.stringify(meta)); } catch (e) {}
  }

  /* ==================== UI helpers ==================== */
  function showNotification(message) {
    var notification = document.createElement('div');
    notification.className = 'editor-notification';
    notification.textContent = message;

    var container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      document.body.appendChild(container);
    }

    container.appendChild(notification);

    setTimeout(function () { notification.classList.add('show'); }, 10);

    setTimeout(function () {
      notification.classList.remove('show');
      setTimeout(function () {
        if (container && notification.parentNode === container) {
          container.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  /* ==================== Init ==================== */
  function init() {
    editor = document.getElementById('md-editor');
    if (!editor) return;

    var KEY = 'matey-markdown';
    try { editor.value = localStorage.getItem(KEY) || ''; } catch (e) {}

    if (!resultEl) {
      var wrap = editor.parentElement;
      if (wrap) {
        resultEl = document.createElement('div');
        resultEl.id = 'md-result';
        resultEl.className = 'md-result';
        wrap.appendChild(resultEl);
      }
    }

    attachmentList = document.getElementById('md-attachment-list');

    editor.addEventListener('input', function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveToVault, SAVE_DELAY);
    });
    editor.addEventListener('blur', function () {
      clearTimeout(saveTimer);
      saveToVault();
    });

    /* Load and render attachments */
    loadAttachments();
    renderAttachments();

    /* Init attachment UI */
    initAttachments();

    /* Restore file handle if available */
    getPersistedFileHandle().then(function (handle) {
      if (handle) {
        fileHandle = handle;
        isNewFile = false;
        readFromFile(handle).then(function (content) {
          editor.value = content;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }).catch(function (e) {
          console.warn('[MateyEditor] Failed to load persisted file:', e);
          clearPersistedHandle();
        });
      }
    });

    /* Toolbar buttons */
    var newBtn = document.getElementById('md-new-btn');
    var openBtn = document.getElementById('md-open-btn');
    var saveBtn = document.getElementById('md-save-btn');
    var saveAsBtn = document.getElementById('md-saveas-btn');

    if (newBtn) newBtn.addEventListener('click', newFile);
    if (openBtn) openBtn.addEventListener('click', openFile);
    if (saveBtn) saveBtn.addEventListener('click', saveFile);
    if (saveAsBtn) saveAsBtn.addEventListener('click', saveAsFile);

    /* Debounced localStorage backup for syntax parsing */
    function saveToVault() {
      if (!editor) return;
      var text = editor.value;
      try { localStorage.setItem('matey-markdown', text); } catch (e) {}
      var lines = text.split('\n');
      lines.forEach(function (line) {
        var trimmed = line.trim();
        if (!trimmed) return;
        if (window.MateySyntax && typeof MateySyntax.parse === 'function') {
          var p = MateySyntax.parse(trimmed);
          if (p && p.type === 'math' && resultEl) {
             resultEl.innerHTML = '<div class="md-math-result">= ' + escapeHtml(p.result !== null && p.result !== undefined ? p.result : 'Error') + '</div>';
          }
        }
      });
    }

    editor.addEventListener('input', function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveToVault, SAVE_DELAY);
    });
    editor.addEventListener('blur', function () {
      clearTimeout(saveTimer);
      saveToVault();
    });

    saveToVault();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MateyEditor = {
    init: init,
    saveFile: saveFile,
    saveAsFile: saveAsFile,
    openFile: openFile,
    newFile: newFile
  };
})();
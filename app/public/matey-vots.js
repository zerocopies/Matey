/* Matey VOTS — My-VOTS: link-gated private journaling with media embedding, incognito mode
 * 
 * Shares encryption/lock/search/tags infrastructure with Journal module.
 * Storage key prefixed with 'matey-vots' to keep data separate from Journal.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'matey-vots-encrypted';
  var LOCK_KEY = 'matey-vots-lock';
  var LINK_DRAFT_KEY = 'matey-vots-link-draft';
  var TITLE_DRAFT_KEY = 'matey-vots-title-draft';
  var TEXT_DRAFT_KEY = 'matey-vots-text-draft';
  var VIEWS_KEY = 'matey-vots-view';

  var currentLink = null;
  var currentLinkType = null;
  var currentAttachments = [];
  var currentTags = [];
  var currentEncryptionKey = null;
  var isUnlocked = false;
  var currentView = 'list';

  /* ==================== Encryption (mirrors Journal) ==================== */
  var _enc = new TextEncoder();
  var _dec = new TextDecoder();

  function strToBytes(str) { return _enc.encode(str); }
  function bytesToStr(bytes) { return _dec.decode(bytes); }

  function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  async function deriveKey(pin, salt) {
    var keyMaterial = await crypto.subtle.importKey(
      'raw', _enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptData(data, pin) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var key = await deriveKey(pin, salt);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      strToBytes(JSON.stringify(data))
    );
    return {
      salt: bytesToHex(salt),
      iv: bytesToHex(iv),
      data: bytesToHex(new Uint8Array(encrypted))
    };
  }

  async function decryptData(encObj, pin) {
    var key = await deriveKey(pin, hexToBytes(encObj.salt));
    var decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBytes(encObj.iv) },
      key,
      hexToBytes(encObj.data)
    );
    return JSON.parse(bytesToStr(new Uint8Array(decrypted)));
  }

  /* ==================== Lock State (mirrors Journal) ==================== */
  function getLockConfig() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function setLockConfig(config) {
    localStorage.setItem(LOCK_KEY, JSON.stringify(config));
  }

  function isLockEnabled() {
    var cfg = getLockConfig();
    return cfg && cfg.enabled && cfg.pin;
  }

  async function verifyPin(pin) {
    var cfg = getLockConfig();
    if (!cfg || !cfg.enabled) return true;
    return pin === cfg.pin;
  }

  async function unlock(pin) {
    var ok = await verifyPin(pin);
    if (!ok) return false;
    isUnlocked = true;
    currentEncryptionKey = pin;
    return true;
  }

  function lock() {
    isUnlocked = false;
    currentEncryptionKey = null;
  }

  function isLocked() {
    return isLockEnabled() && !isUnlocked;
  }

  async function setLock(pin) {
    setLockConfig({ enabled: true, pin: pin, createdAt: Date.now() });
  }

  function removeLock() {
    localStorage.removeItem(LOCK_KEY);
  }

  /* ==================== Encrypted Data Storage ==================== */
  async function saveData(data) {
    if (currentEncryptionKey) {
      try {
        var enc = await encryptData(data, currentEncryptionKey);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(enc));
      } catch (e) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }

  async function getData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { entries: [], tags: {} };
      var parsed = JSON.parse(raw);
      if (parsed && parsed.salt && parsed.iv && parsed.data && currentEncryptionKey) {
        return await decryptData(parsed, currentEncryptionKey);
      }
      return parsed;
    } catch (e) {
      return { entries: [], tags: {} };
    }
  }

  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function activateIncognito() {
    var body = document.body;
    body.classList.add('incognito-active');
    body.classList.add('vots-mode');
    try {
      sessionStorage.setItem('matey-vots-incognito', 'true');
      window.__votsIncognito = true;
    } catch (e) {}
    var incBtn = document.querySelector('.incognito-trigger');
    if (incBtn) {
      incBtn.classList.add('active');
      incBtn.setAttribute('title', 'Incognito mode is ON');
    }
  }

   function isValidUrl(str) {
     try {
       var url = new URL(str);
       return url.protocol === 'http:' || url.protocol === 'https:';
     } catch (e) { return false; }
   }

   function getDomain(url) {
     try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
   }

   /* ---- Rule-based link-type detection ---- */
   function detectLinkType(url) {
     var lower = url.toLowerCase();
     if (lower.indexOf('twitter.com/') !== -1 || lower.indexOf('x.com/') !== -1) {
       if (lower.indexOf('/status/') !== -1) return { type: 'tweet', label: 'Tweet', icon: '🐦' };
       return { type: 'tweet', label: 'Tweet', icon: '🐦' };
     }
     if (lower.indexOf('youtube.com/watch') !== -1 || lower.indexOf('youtu.be/') !== -1) {
       return { type: 'video', label: 'Video', icon: '🎥' };
     }
     if (lower.indexOf('instagram.com/p/') !== -1 || lower.indexOf('instagram.com/reel/') !== -1) {
       return { type: 'instagram', label: 'Instagram Post', icon: '📷' };
     }
     return { type: 'article', label: 'Article/Website', icon: '📄' };
   }

   function isSocialPost(linkType) {
     return linkType === 'tweet' || linkType === 'instagram';
   }

  function formatTimestamp(ts) {
    return new Date(ts).toLocaleString(navigator.language || 'en-US', {
      dateStyle: 'medium', timeStyle: 'short'
    });
  }

  function formatRelativeTime(ts) {
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    var hours = Math.floor(mins / 60);
    var days = Math.floor(hours / 24);
    if (days > 0) return days + 'd ago';
    if (hours > 0) return hours + 'h ago';
    if (mins > 0) return mins + 'm ago';
    return 'just now';
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showMessage(text) {
    var existing = document.querySelector('.vots-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'vots-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add('show'); }, 10);
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 200);
    }, 2000);
  }

  function showConfirm(title, desc, onProceed) {
    var overlay = document.getElementById('vots-confirm-overlay');
    var titleEl = document.getElementById('vots-confirm-title');
    var descEl = document.getElementById('vots-confirm-desc');
    if (!overlay) return onProceed();
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    overlay.classList.add('show');
    var onCancel = function () { cleanup(); };
    var onDone = function () { cleanup(); onProceed(); };
    function cleanup() {
      overlay.classList.remove('show');
      var c = document.getElementById('vots-confirm-cancel');
      var p = document.getElementById('vots-confirm-proceed');
      if (c) c.removeEventListener('click', onCancel);
      if (p) p.removeEventListener('click', onDone);
    }
    var cancelBtn = document.getElementById('vots-confirm-cancel');
    var proceedBtn = document.getElementById('vots-confirm-proceed');
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel, { once: true });
    if (proceedBtn) proceedBtn.addEventListener('click', onDone, { once: true });
  }

  function extractMediaUrl(url) {
    if (url.indexOf('youtube.com/watch') !== -1 || url.indexOf('youtu.be/') !== -1) {
      var id = '';
      var m = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
      if (m) id = m[1];
      if (id) return { type: 'youtube', id: id, url: 'https://www.youtube.com/embed/' + id };
    }
    if (url.indexOf('twitter.com/') !== -1 || url.indexOf('x.com/') !== -1) {
      var tw = url.match(/\/status\/(\d+)/);
      if (tw) return { type: 'twitter', url: 'https://twitter.com/i/web/status/' + tw[1] };
      return { type: 'twitter', url: url };
    }
    return { type: 'article', url: url };
  }

  function renderMediaPreview(media) {
    var wrap = document.createElement('div');
    wrap.className = 'vots-media-preview';
    wrap.dataset.mediaUrl = media.url;
    if (media.type === 'youtube') {
      wrap.innerHTML = '<iframe width="100%" height="180" src="' + media.url + '" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-injection" allowfullscreen></iframe>';
    } else if (media.type === 'twitter') {
      wrap.innerHTML = '<blockquote class="twitter-tweet"><a href="' + media.url + '">View on X/Twitter</a></blockquote>';
    } else {
      var link = document.createElement('a');
      link.href = media.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = media.url;
      link.className = 'vots-media-link';
      wrap.appendChild(link);
    }
    return wrap;
  }

  /* ---- Link Gate ---- */
  function initLinkGate() {
    var gate = document.getElementById('vots-link-gate');
    var input = document.getElementById('vots-link-input');
    var btn = document.getElementById('vots-link-submit');
    var editorSection = document.getElementById('vots-editor-section');

    if (!gate || !input || !btn || !editorSection) return;

    var draft = '';
    try { draft = localStorage.getItem(LINK_DRAFT_KEY) || ''; } catch (e) {}
    input.value = draft;

    input.addEventListener('input', function () {
      try { localStorage.setItem(LINK_DRAFT_KEY, input.value); } catch (e) {}
    });

    var submitHandler = function () {
      var url = input.value.trim();
      if (!url) {
        showMessage('My-VOTS is for responding to something public — paste that link to get started.');
        return;
      }
      if (!isValidUrl(url)) {
        showMessage('Please enter a valid URL (e.g. https://twitter.com/...)');
        return;
      }
      currentLink = url;
      currentLinkType = detectLinkType(url);
      try { localStorage.removeItem(LINK_DRAFT_KEY); } catch (e) {}

      /* Show/hide Source card based on link type */
      var sourceCard = document.getElementById('vots-source-card');
      var sourceLabel = document.getElementById('vots-source-label');
      var sourceBadge = document.getElementById('vots-source-badge');
      var editorSection = document.getElementById('vots-editor-section');

      if (sourceCard && sourceLabel && sourceBadge) {
        sourceLabel.textContent = getDomain(currentLink);
        sourceLabel.href = currentLink;
        sourceBadge.textContent = currentLinkType.icon + ' ' + currentLinkType.label;
        sourceBadge.className = 'vots-source-badge vots-badge-' + currentLinkType.type;
        sourceCard.style.display = isSocialPost(currentLinkType.type) ? 'flex' : 'none';
      }

      /* Toggle "Your Version" header for social posts */
      var yourVersionHeader = document.getElementById('vots-your-version-header');
      if (yourVersionHeader) {
        yourVersionHeader.style.display = isSocialPost(currentLinkType.type) ? 'flex' : 'none';
      }

      /* Toggle link reference line for articles */
      var linkRef = document.getElementById('vots-link-ref');
      if (linkRef) {
        linkRef.style.display = isSocialPost(currentLinkType.type) ? 'none' : 'flex';
        if (linkRef) linkRef.textContent = 'Reference: ' + currentLink;
      }

      if (editorSection) editorSection.style.display = 'block';
    };

    btn.addEventListener('click', submitHandler);
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitHandler(); }
    });
  }

  function initBackLink() {
    var backBtn = document.getElementById('vots-back-link');
    var gate = document.getElementById('vots-link-gate');
    var editorSection = document.getElementById('vots-editor-section');
    if (!backBtn || !gate || !editorSection) return;

    backBtn.addEventListener('click', function (e) {
      e.preventDefault();
      showConfirm(
        'Discard entry?',
        'Your current entry will be discarded. You haven\'t saved yet.',
         function () {
          currentLink = null;
          currentLinkType = null;
          currentAttachments = [];
          gate.style.display = 'block';
          editorSection.style.display = 'none';
        }
      );
    });
  }

  function initAttachments() {
    var btn = document.getElementById('vots-attach-btn');
    var list = document.getElementById('vots-attachment-list');
    if (!btn || !list) return;

    btn.addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '*/*';
      input.onchange = function (e) {
        var files = Array.from(e.target.files || []);
        if (!files.length) return;
        files.forEach(function (file) {
          var item = {
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            id: Date.now().toString() + '_' + Math.random().toString(36).slice(2)
          };
          currentAttachments.push(item);
          try {
            var reader = new FileReader();
            reader.onload = function () {
              item.preview = reader.result;
              renderAttachment(item);
            };
            if (file.type.startsWith('image/')) {
              reader.readAsDataURL(file);
            } else {
              item.preview = null;
              renderAttachment(item);
            }
          } catch (e2) { renderAttachment(item); }
        });
      };
      input.click();
    });
  }

  function renderAttachment(item) {
    var list = document.getElementById('vots-attachment-list');
    if (!list) return;
    var div = document.createElement('div');
    div.className = 'vots-attachment';
    div.setAttribute('data-id', item.id);
    if (item.preview) {
      div.innerHTML = '<img src="' + item.preview + '" class="vots-attachment-thumb" alt="' + escapeHtml(item.name) + '">';
    } else {
      var icon = getFileTypeIcon(item.type);
      div.innerHTML = '<div class="vots-attachment-icon">' + icon + '</div>';
    }
    var info = document.createElement('div');
    info.className = 'vots-attachment-info';
    info.innerHTML = '<div class="vots-attachment-name">' + escapeHtml(item.name) + '</div>' +
      '<div class="vots-attachment-size">' + formatFileSize(item.size) + '</div>';
    div.appendChild(info);
    var removeBtn = document.createElement('button');
    removeBtn.className = 'vots-attachment-remove';
    removeBtn.type = 'button';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', function () {
      currentAttachments = currentAttachments.filter(function (a) { return a.id !== item.id; });
      div.remove();
    });
    div.appendChild(removeBtn);
    list.appendChild(div);
  }

  function getFileTypeIcon(type) {
    if (type && type.startsWith('image/')) return '🖼️';
    if (type && type.includes('pdf')) return '📄';
    if (type && type.startsWith('text/')) return '📝';
    if (type && type.startsWith('video/')) return '🎥';
    if (type && type.startsWith('audio/')) return '🔊';
    return '📎';
  }

  /* ---- Save Entry ---- */
  async function initSaveEntry() {
    var btn = document.getElementById('vots-save-btn');
    var cancelBtn = document.getElementById('vots-cancel-btn');
    if (!btn) return;

    var tagsInput = document.getElementById('vots-tags-input');
    if (tagsInput) {
      tagsInput.addEventListener('input', function () {
        var raw = tagsInput.value.trim();
        currentTags = raw ? raw.split(',').map(function (t) { return t.trim(); }).filter(function (t) { return t; }) : [];
      });
    }

    btn.addEventListener('click', async function () {
      var titleInput = document.getElementById('vots-title-input');
      var textArea = document.getElementById('vots-textarea');
      if (!titleInput || !textArea) return;

      var title = titleInput.value.trim();
      if (!title) { showMessage('Title is required'); titleInput.focus(); return; }
      if (!currentLink) { showMessage('A source link is required'); return; }

      var editor = document.getElementById('vots-editor');
      var content = textArea.value || (editor ? editor.value : '');

       var entry = {
         id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
        link: currentLink,
        domain: getDomain(currentLink),
        linkType: currentLinkType ? currentLinkType.type : 'article',
        title: title,
         content: content,
         tags: currentTags,
         attachments: currentAttachments.map(function (a) {
           return { name: a.name, size: a.size, type: a.type, id: a.id };
         }),
         timestamp: Date.now(),
         updatedAt: Date.now()
       };

       var data = await getData();
      data.entries.unshift(entry);
      if (!data.tags) data.tags = {};
      currentTags.forEach(function (t) { data.tags[t] = true; });
      await saveData(data);

      try { localStorage.removeItem(TITLE_DRAFT_KEY); } catch (e) {}
      try { localStorage.removeItem(TEXT_DRAFT_KEY); } catch (e) {}
      currentLink = null;
      currentAttachments = [];
      currentTags = [];

      gate = document.getElementById('vots-link-gate');
      editorSection = document.getElementById('vots-editor-section');
      if (gate) gate.style.display = 'block';
      if (editorSection) editorSection.style.display = 'none';
      if (titleInput) titleInput.value = '';
      if (textArea) textArea.value = '';
      if (editor) editor.value = '';
      var list = document.getElementById('vots-attachment-list');
      if (list) list.innerHTML = '';
      var tagsInput = document.getElementById('vots-tags-input');
      if (tagsInput) tagsInput.value = '';

      await renderEntryHistory();
      showMessage('Entry saved');
     });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        showConfirm(
          'Discard entry?',
          'Your current entry will be discarded. You haven\'t saved yet.',
          function () {
          currentLink = null;
          currentLinkType = null;
          currentAttachments = [];
          currentTags = [];
          var g = document.getElementById('vots-link-gate');
            var es = document.getElementById('vots-editor-section');
            if (g) g.style.display = 'block';
            if (es) es.style.display = 'none';
          }
        );
      });
    }
  }

  /* ---- Entry History ---- */
  async function renderEntryHistory(searchQuery, tagFilter) {
    var container = document.getElementById('vots-history');
    if (!container) return;
    var data = await getData();
    if (!data.entries.length) {
      container.innerHTML = '<div class="vots-history-empty">No entries yet. Create one above.</div>';
      return;
    }

    var entries = data.entries;
    if (searchQuery) {
      var q = searchQuery.toLowerCase().trim();
      entries = entries.filter(function (e) {
        return (e.title && e.title.toLowerCase().indexOf(q) !== -1) ||
               (e.content && e.content.toLowerCase().indexOf(q) !== -1) ||
               (e.tags && e.tags.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; })) ||
               (e.domain && e.domain.toLowerCase().indexOf(q) !== -1);
      });
    }
    if (tagFilter) {
      entries = entries.filter(function (e) {
        return e.tags && e.tags.indexOf(tagFilter) !== -1;
      });
    }

    var view = currentView;
    var isGrid = view === 'grid';
    var itemClass = isGrid ? 'journal-entry-card grid-card' : 'vots-history-item';

    container.innerHTML = entries.map(function (entry) {
      var tagsHtml = '';
      if (entry.tags && entry.tags.length) {
        tagsHtml = '<div class="journal-entry-tags">' +
          entry.tags.map(function (t) { return '<span class="journal-entry-tag">' + escapeHtml(t) + '</span>'; }).join('') +
          '</div>';
      }
      var lt = entry.linkType || 'article';
      var ltInfo = detectLinkType(entry.link || '');
      var badgeHtml = '<span class="vots-type-badge vots-badge-' + lt + '">' + (ltInfo.icon || '📄') + ' ' + (ltInfo.label || 'Article/Website') + '</span>';
      return '<div class="' + itemClass + '" data-id="' + entry.id + '">' +
        '<div class="vots-history-time">' + formatRelativeTime(entry.timestamp) + ' ' + badgeHtml + '</div>' +
        '<div class="vots-history-link"><a href="' + escapeHtml(entry.link) + '" target="_blank" rel="noopener">' + escapeHtml(entry.domain) + '</a></div>' +
        '<div class="vots-history-title">' + escapeHtml(entry.title) + '</div>' +
        '<div class="vots-history-preview">' + escapeHtml(entry.content.substring(0, 120)) + (entry.content.length > 120 ? '…' : '') + '</div>' +
        tagsHtml +
        (entry.attachments && entry.attachments.length ? '<div class="vots-history-attachments">' + entry.attachments.length + ' attachment' + (entry.attachments.length > 1 ? 's' : '') + '</div>' : '') +
        '</div>';
    }).join('');

    container.className = isGrid ? 'vots-history vots-history-grid' : 'vots-history';
  }

  /* ---- Google Drive Backup ---- */
  async function backupEntryToDrive(entry) {
    showMessage('Backing up...');
    var content = '# ' + entry.title + '\n\n';
    content += '**Source:** [' + entry.domain + '](' + entry.link + ')\n\n';
    content += '**Date:** ' + formatTimestamp(entry.timestamp) + '\n\n';
    content += entry.content;
    if (entry.attachments && entry.attachments.length) {
      content += '\n\n**Attachments:**';
      entry.attachments.forEach(function (a) {
        content += '\n- ' + a.name + ' (' + formatFileSize(a.size) + ')';
      });
    }
    var fileName = 'Story_' + formatTimestamp(entry.timestamp).replace(/[ ,]/g, '_') + '.md';

    try {
      if (window.gapi && gapi.client && gapi.client.drive) {
        var folderId = await getOrCreateDriveFolder();
        showMessage('Saved to Google Drive');
        entry.backedUp = true;
        entry.backupAt = Date.now();
        saveData(await getData());
      } else {
        if (window.MateyFS && MateyFS.supports() && MateyFS.getCurrentWorkspace()) {
          await MateyFS.writeFile('story/' + fileName, content, { force: true });
          MateyFS.logActivity('backup', 'story/' + fileName, 'Manual backup');
        }
        showMessage('Backed up');
      }
    } catch (e) {
      showMessage('Backup failed: ' + (e.message || String(e)));
    }
  }

  async function backupAllToDrive() {
    var data = await getData();
    if (!data.entries.length) {
      showMessage('No entries to back up');
      return;
    }
    showConfirm(
      'Back up all entries?',
      'Back up ' + data.entries.length + ' entries.',
      async function () {
        var ok = 0;
        for (var i = 0; i < data.entries.length; i++) {
          try { await backupEntryToDrive(data.entries[i]); ok++; } catch (e) {}
        }
        saveData(data);
        showMessage('Backed up ' + ok + ' / ' + data.entries.length + ' entries');
      }
    );
  }

  function getOrCreateDriveFolder() {
    return new Promise(function (resolve, reject) {
      if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.drive) {
        resolve(null);
        return;
      }
      gapi.client.drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false and name='Matey Stories'",
        fields: 'files(id,name)'
      }).then(function (response) {
        var folders = response.result.files;
        if (folders && folders.length > 0) {
          resolve(folders[0].id);
        } else {
          gapi.client.drive.files.create({
            resource: { name: 'Matey Stories', mimeType: 'application/vnd.google-apps.folder' },
            fields: 'id'
          }).then(function (createResp) {
            resolve(createResp.result.id);
          }).catch(reject);
        }
      }).catch(reject);
    });
  }

  /* ---- Init ---- */
  async function init() {
    activateIncognito();

    /* Load view preference */
    try {
      currentView = JSON.parse(localStorage.getItem(VIEWS_KEY) || '"list"');
    } catch (e) {}

     /* PIN lock check */
     if (isLockEnabled()) {
       await showLockScreen();
       if (isLocked()) {
         await renderEntryHistory();
         return;
       }
     }

    await initPinLockConfig();
    initLinkGate();
    initBackLink();
    initAttachments();
    await initSaveEntry();
    initSearch();
    initViewToggle();
    initSettingsModal();

    var backupAllBtn = document.getElementById('vots-backup-all');
    if (backupAllBtn) {
      backupAllBtn.addEventListener('click', backupAllToDrive);
    }

    /* Restore drafts */
    var draft = '';
    try { draft = localStorage.getItem(LINK_DRAFT_KEY) || ''; } catch (e) {}
    if (draft) {
      currentLink = draft;
      currentLinkType = detectLinkType(draft);
      var gate = document.getElementById('vots-link-gate');
      var editorSection = document.getElementById('vots-editor-section');
      if (gate && editorSection) {
        gate.style.display = 'none';
        editorSection.style.display = 'block';
      }
      /* Update source card state */
      var sourceCard = document.getElementById('vots-source-card');
      var sourceBadge = document.getElementById('vots-source-badge');
      var yourVersionHeader = document.getElementById('vots-your-version-header');
      var linkRef = document.getElementById('vots-link-ref');
      if (sourceCard && sourceBadge) {
        sourceBadge.textContent = currentLinkType.icon + ' ' + currentLinkType.label;
        sourceBadge.className = 'vots-source-badge vots-badge-' + currentLinkType.type;
        sourceCard.style.display = isSocialPost(currentLinkType.type) ? 'flex' : 'none';
      }
      if (yourVersionHeader) {
        yourVersionHeader.style.display = isSocialPost(currentLinkType.type) ? 'flex' : 'none';
      }
      if (linkRef) {
        linkRef.style.display = isSocialPost(currentLinkType.type) ? 'none' : 'flex';
        linkRef.textContent = 'Reference: ' + currentLink;
      }
      try { localStorage.removeItem(LINK_DRAFT_KEY); } catch (e) {}
      var titleInput = document.getElementById('vots-title-input');
      if (titleInput) {
        try { titleInput.value = localStorage.getItem(TITLE_DRAFT_KEY) || ''; } catch (e) {}
      }
      var textArea = document.getElementById('vots-textarea');
      if (textArea) {
        try { textArea.value = localStorage.getItem(TEXT_DRAFT_KEY) || ''; } catch (e) {}
      }
    }

    /* Save drafts on input */
    var titleInput = document.getElementById('vots-title-input');
    if (titleInput) {
      titleInput.addEventListener('input', function () {
        try { localStorage.setItem(TITLE_DRAFT_KEY, titleInput.value); } catch (e) {}
      });
    }
    var textArea = document.getElementById('vots-textarea');
    if (textArea) {
      textArea.addEventListener('input', function () {
        try { localStorage.setItem(TEXT_DRAFT_KEY, textArea.value); } catch (e) {}
      });
    }

    await renderEntryHistory();

    if (textArea) {
      window.addEventListener('beforeunload', function () {
        try { localStorage.setItem('matey-vots-temp', textArea.value); } catch (e) {}
      });
    }
  }

  /* ---- Pin Lock ---- */
  function showLockScreen() {
    return new Promise(function (resolve) {
      var screen = document.getElementById('vots-lock-screen');
      var input = document.getElementById('vots-pin-input');
      var submit = document.getElementById('vots-pin-submit');
      var historySection = document.getElementById('vots-history-section');
      if (historySection) historySection.style.display = 'none';
      if (screen) screen.style.display = 'flex';
      if (input) { input.value = ''; input.focus(); }
      var onUnlock = function () {
        var pin = input ? input.value : '';
        verifyPin(pin).then(function (ok) {
          if (ok) {
            unlock(pin).then(function () {
              if (screen) screen.style.display = 'none';
              if (historySection) historySection.style.display = 'block';
              resolve();
            });
          } else {
            showMessage('Incorrect PIN');
            if (input) input.focus();
          }
        });
      };
      if (input) input.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); onUnlock(); }
      });
      if (submit) submit.addEventListener('click', onUnlock, { once: true });
    });
  }

  /* ---- Pin Lock Config in Settings ---- */
  async function initPinLockConfig() {
    var toggleBtn = document.getElementById('vots-pin-toggle');
    var labelEl = document.querySelector('#sec-models .journal-setting-row[label]');
    var settingRow = toggleBtn ? toggleBtn.closest('.journal-setting-row') : null;
    if (!toggleBtn) return;
    var cfg = getLockConfig();
    if (cfg && cfg.enabled) {
      toggleBtn.textContent = 'Change PIN';
      if (settingRow) settingRow.setAttribute('data-locked', 'true');
      if (settingRow) {
        var lbl = settingRow.querySelector('label');
        if (lbl) lbl.textContent = 'PIN lock enabled';
      }
    } else {
      toggleBtn.textContent = 'Enable';
      if (settingRow) settingRow.setAttribute('data-locked', 'false');
      if (settingRow) {
        var lbl2 = settingRow.querySelector('label');
        if (lbl2) lbl2.textContent = 'PIN Lock';
      }
    }
    toggleBtn.onclick = function () {
      showConfirm(
        'Set PIN for My-VOTS?',
        'This will encrypt all entries and require a PIN to access them.',
        async function () {
          var newPin = prompt('Enter a 4-digit PIN');
          if (!newPin || newPin.length < 4) return;
          await setLock(newPin);
          /* Re-encrypt existing entries with new PIN */
          var data = await getData();
          await saveData(data);
          showMessage('PIN lock enabled');
          if (toggleBtn) toggleBtn.textContent = 'Change PIN';
          if (settingRow) {
            var lbl3 = settingRow.querySelector('label');
            if (lbl3) lbl3.textContent = 'PIN lock enabled';
            settingRow.setAttribute('data-locked', 'true');
          }
        }
      );
    };
  }

  /* ---- Search ---- */
  function initSearch() {
    var searchInput = document.getElementById('vots-search-input');
    if (!searchInput) return;
    var timer = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var q = searchInput.value.trim();
        renderEntryHistory(q);
      }, 300);
    });
  }

  /* ---- View Toggle ---- */
  function initViewToggle() {
    var btn = document.getElementById('vots-view-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      currentView = currentView === 'list' ? 'grid' : 'list';
      try { localStorage.setItem(VIEWS_KEY, JSON.stringify(currentView)); } catch (e) {}
      renderEntryHistory(document.getElementById('vots-search-input') ? document.getElementById('vots-search-input').value.trim() : '');
    });
  }

  /* ---- Settings Modal ---- */
  function initSettingsModal() {
    var settingsBtn = document.getElementById('vots-settings-btn');
    var overlay = document.getElementById('vots-settings-overlay');
    var closeBtn = document.getElementById('vots-settings-close');
    var exportBtn = document.getElementById('vots-export-btn');
    if (settingsBtn && overlay) {
      settingsBtn.addEventListener('click', function () {
        overlay.style.display = 'flex';
      });
    }
    if (closeBtn && overlay) {
      closeBtn.addEventListener('click', function () {
        overlay.style.display = 'none';
      });
    }
    if (exportBtn) {
      exportBtn.addEventListener('click', exportEntries);
    }
  }

  async function exportEntries() {
    var data = await getData();
    if (!data.entries.length) {
      showMessage('No entries to export');
      return;
    }
    var content = data.entries.map(function (e) {
      var tags = e.tags && e.tags.length ? '  tags: ' + e.tags.join(', ') : '';
      return '# ' + e.title + '\n**Source:** [' + e.domain + '](' + e.link + ')**Date:** ' + formatTimestamp(e.timestamp) + '\n\n' + (e.content || '') + tags + '\n\n---\n\n';
    }).join('\n');
    try {
      var blob = new Blob([content], { type: 'text/markdown' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'my-vots-' + new Date().toISOString().slice(0, 10) + '.md';
      a.click();
      URL.revokeObjectURL(url);
      showMessage('Exported ' + data.entries.length + ' entries');
    } catch (e) {
      showMessage('Export failed');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MateyVots = {
    getData: getData,
    saveData: saveData,
    isLocked: isLocked,
    isLockEnabled: isLockEnabled,
    unlock: unlock,
    lock: lock,
    setLock: setLock,
    removeLock: removeLock,
    verifyPin: verifyPin,
    getEntries: function () { return getData().then(function(d) { return d.entries; }); },
    getCurrentLink: function () { return currentLink; },
    formatTimestamp: formatTimestamp,
    renderEntryHistory: renderEntryHistory
  };
})();

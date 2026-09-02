/* Journal UI — three-tier controller for Matey Journal
 * Tier 1: Library → Tier 2: Entry List → Tier 3: Editor
 */
(function () {
  'use strict';

  var COVERS = ['--journal-cover-1', '--journal-cover-2', '--journal-cover-3', '--journal-cover-4', '--journal-cover-5'];
  var MOODS = [
    { emoji: '😊', label: 'Happy' },
    { emoji: '😌', label: 'Calm' },
    { emoji: '😔', label: 'Sad' },
    { emoji: '😤', label: 'Frustrated' },
    { emoji: '🤔', label: 'Thoughtful' },
    { emoji: '😴', label: 'Tired' },
    { emoji: '🥳', label: 'Excited' },
    { emoji: '😰', label: 'Anxious' },
    { emoji: '🙏', label: 'Grateful' },
    { emoji: '😡', label: 'Angry' },
    { emoji: '🥰', label: 'Loved' },
    { emoji: '😶', label: 'Neutral' }
  ];
  var FONTS = [
    { name: 'Inter', family: "'Inter', sans-serif" },
    { name: 'Space Grotesk', family: "'Space Grotesk', sans-serif" },
    { name: 'DM Sans', family: "'DM Sans', sans-serif" },
    { name: 'Outfit', family: "'Outfit', sans-serif" }
  ];

  var _currentJournalId = null;
  var _currentEntryId = null;
  var _currentTags = [];
  var _currentPhotos = [];
  var _currentVoiceNotes = [];
  var _activeFilterTag = null;
  var _isRecording = false;
  var _mediaRecorder = null;
  var _audioChunks = [];
  var _recordingStartTime = 0;
  var _autoSaveTimer = null;

  /* ==================== DOM refs ==================== */
  var $ = function (id) { return document.getElementById(id); };

  var lockEl = $('jnl-lock');
  var libraryEl = $('jnl-library');
  var entryListEl = $('jnl-entry-list');
  var editorEl = $('jnl-editor');

  /* ==================== Utilities ==================== */
  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatRelative(iso) {
    var ts = new Date(iso).getTime();
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd ago';
    var weeks = Math.floor(days / 7);
    if (weeks < 5) return weeks + 'w ago';
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function formatDate(iso) {
    var d = new Date(iso);
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ' \u00b7 ' +
      ((d.getHours() % 12) || 12) + ':' + String(d.getMinutes()).padStart(2, '0') + (d.getHours() >= 12 ? ' PM' : ' AM');
  }

  function showToast(msg) {
    var t = $('jnl-toast');
    if (!t) return;
    $('jnl-toast-text').textContent = msg;
    t.style.display = 'flex';
    t.classList.add('jnl-toast-visible');
    setTimeout(function () {
      t.classList.remove('jnl-toast-visible');
      setTimeout(function () { t.style.display = 'none'; }, 300);
    }, 2000);
  }

  function showOverlay(id, sheetId) {
    var o = $(id);
    if (o) { o.style.display = 'flex'; o.classList.add('jnl-overlay-visible'); }
  }

  function hideOverlay(id) {
    var o = $(id);
    if (o) { o.classList.remove('jnl-overlay-visible'); setTimeout(function () { o.style.display = 'none'; }, 250); }
  }

  function showConfirm(title, text, onOk) {
    $('jnl-confirm-title').textContent = title;
    $('jnl-confirm-text').textContent = text;
    showOverlay('jnl-confirm');
    $('jnl-confirm-ok').onclick = function () {
      hideOverlay('jnl-confirm');
      onOk();
    };
    $('jnl-confirm-cancel').onclick = function () { hideOverlay('jnl-confirm'); };
  }

  /* ==================== Navigation ==================== */
  function showScreen(screen) {
    [lockEl, libraryEl, entryListEl, editorEl].forEach(function (el) {
      if (el) el.style.display = 'none';
    });
    if (screen) screen.style.display = 'flex';
  }

  function goToLibrary() {
    _currentJournalId = null;
    _activeFilterTag = null;
    showScreen(libraryEl);
    renderLibrary();
    activateIncognitoIcon();
  }

  function goToEntryList(journalId) {
    _currentJournalId = journalId;
    _activeFilterTag = null;
    showScreen(entryListEl);
    MateyJournal.getJournal(journalId).then(function (j) {
      $('jnl-journal-name').textContent = j ? j.name : 'Journal';
    });
    renderEntries();
  }

  function goToEditor(entryId) {
    _currentEntryId = entryId || null;
    _currentTags = [];
    _currentPhotos = [];
    _currentVoiceNotes = [];
    showScreen(editorEl);
    if (entryId) {
      MateyJournal.getEntry(entryId).then(function (entry) {
        if (!entry) return;
        $('jnl-editor-body').value = entry.body || '';
        $('jnl-editor-date').textContent = formatDate(entry.createdAt);
        _currentTags = entry.tags ? entry.tags.slice() : [];
        _currentPhotos = entry.photos ? entry.photos.slice() : [];
        _currentVoiceNotes = entry.voiceNotes ? entry.voiceNotes.slice() : [];
        if (entry.fontChoice) {
          $('jnl-editor-body').style.fontFamily = entry.fontChoice;
        } else {
          $('jnl-editor-body').style.fontFamily = '';
        }
        renderMediaStack();
      });
    } else {
      $('jnl-editor-body').value = '';
      $('jnl-editor-body').style.fontFamily = '';
      $('jnl-editor-date').textContent = formatDate(new Date().toISOString());
      renderMediaStack();
      setTimeout(function () { $('jnl-editor-body').focus(); }, 50);
    }
  }

  /* ==================== Lock Screen ==================== */
  function showLock() {
    showScreen(lockEl);
    var hasPin = MateyJournal.isLockEnabled();
    $('jnl-setup-btn').style.display = hasPin ? 'none' : 'block';
    $('jnl-lock-desc').textContent = hasPin ? 'Enter your PIN to unlock' : 'Set a PIN to secure your journal';
    $('jnl-pin-input').value = '';
    $('jnl-lock-error').style.display = 'none';
  }

  function tryUnlock() {
    var pin = $('jnl-pin-input').value;
    if (!pin) return;
    MateyJournal.unlockJournal(pin).then(function (ok) {
      if (ok) {
        $('jnl-pin-input').value = '';
        $('jnl-lock-error').style.display = 'none';
        activateIncognitoIcon();
        goToLibrary();
      } else {
        $('jnl-lock-error').style.display = 'block';
        $('jnl-pin-input').value = '';
      }
    });
  }

  function trySetupPin() {
    var pin = $('jnl-pin-input').value;
    if (!pin || pin.length < 4) {
      showToast('PIN must be at least 4 characters');
      return;
    }
    MateyJournal.setPin(pin).then(function () {
      $('jnl-pin-input').value = '';
      $('jnl-setup-btn').style.display = 'none';
      $('jnl-lock-desc').textContent = 'Enter your PIN to unlock';
      showToast('PIN set successfully');
    });
  }

  /* ==================== Tier 1: Library ==================== */
  function renderLibrary() {
    MateyJournal.getAllJournals().then(function (journals) {
      var list = $('jnl-library-list');
      var empty = $('jnl-library-empty');
      if (!journals || !journals.length) {
        list.innerHTML = '';
        empty.style.display = 'flex';
        return;
      }
      empty.style.display = 'none';
      list.innerHTML = '';
      journals.sort(function (a, b) { return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt); });
      journals.forEach(function (j) {
        var card = document.createElement('div');
        card.className = 'jnl-journal-card';
        card.setAttribute('data-id', j.id);
        var coverVar = j.coverStyle || '--journal-cover-1';
        card.style.setProperty('--jnl-cover', 'var(' + coverVar + ')');
        card.innerHTML =
          '<div class="jnl-journal-card-cover"></div>' +
          '<div class="jnl-journal-card-info">' +
            '<div class="jnl-journal-card-name">' + escapeHtml(j.name) + '</div>' +
            '<div class="jnl-journal-card-meta"><span class="jnl-journal-card-count">0 entries</span><span class="jnl-journal-card-dot">\u00b7</span><span class="jnl-journal-card-date">' + formatRelative(j.updatedAt || j.createdAt) + '</span></div>' +
          '</div>' +
          '<button class="jnl-icon-btn jnl-journal-card-menu" type="button" aria-label="Journal options">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>' +
          '</button>';
        card.addEventListener('click', function (e) {
          if (e.target.closest('.jnl-journal-card-menu')) return;
          _currentJournalId = j.id;
          goToEditor(null);
        });
        card.querySelector('.jnl-journal-card-menu').addEventListener('click', function (e) {
          e.stopPropagation();
          showJournalActions(j);
        });
        list.appendChild(card);
        MateyJournal.getEntryCount(j.id).then(function (count) {
          var countEl = card.querySelector('.jnl-journal-card-count');
          if (countEl) countEl.textContent = count + (count === 1 ? ' entry' : ' entries');
        });
      });
    });
  }

  function showJournalActions(journal) {
    var actions = [
      { label: 'Rename', action: function () { renameJournal(journal.id); } },
      { label: 'Change Cover', action: function () { openCoverPicker(journal.id, 'journal'); } },
      { label: 'Delete', danger: true, action: function () {
        showConfirm('Delete Journal?', 'This will permanently delete "' + journal.name + '" and all its entries.', function () {
          MateyJournal.deleteJournal(journal.id).then(function () { renderLibrary(); });
        });
      }}
    ];
    showActionSheet('Journal Options', actions);
  }

  function renameJournal(journalId) {
    MateyJournal.getJournal(journalId).then(function (j) {
      var name = prompt('Rename journal:', j ? j.name : '');
      if (name && name.trim()) {
        MateyJournal.updateJournal(journalId, { name: name.trim() }).then(function () { renderLibrary(); });
      }
    });
  }

  function createNewJournal() {
    var name = prompt('Journal name:');
    if (!name || !name.trim()) return;
    MateyJournal.createJournal(name.trim(), COVERS[Math.floor(Math.random() * COVERS.length)]).then(function () {
      goToEditor(null);
    });
  }

  /* ==================== Tier 2: Entry List ==================== */
  function renderEntries() {
    if (!_currentJournalId) return;
    var query = $('jnl-search-input') ? $('jnl-search-input').value : '';
    MateyJournal.searchEntries(_currentJournalId, query).then(function (entries) {
      if (_activeFilterTag) {
        entries = entries.filter(function (e) { return e.tags && e.tags.indexOf(_activeFilterTag) !== -1; });
      }
      var container = $('jnl-entries');
      var empty = $('jnl-entries-empty');
      if (!entries || !entries.length) {
        container.innerHTML = '';
        empty.style.display = 'flex';
        return;
      }
      empty.style.display = 'none';
      container.innerHTML = '';
      entries.forEach(function (entry) {
        var card = document.createElement('div');
        card.className = 'jnl-entry-card';
        card.setAttribute('data-id', entry.id);
        var hasPhoto = entry.photos && entry.photos.length;
        if (hasPhoto) {
          card.classList.add('jnl-entry-card-photo');
          card.innerHTML =
            '<div class="jnl-entry-photo-scrim">' +
              '<div class="jnl-entry-card-title">' + escapeHtml(entry.title || formatDate(entry.createdAt)) + '</div>' +
              '<div class="jnl-entry-card-date">' + formatRelative(entry.createdAt) + '</div>' +
            '</div>';
          loadPhotoIntoCard(card, entry.photos[0]);
        } else {
          card.innerHTML =
            '<div class="jnl-entry-card-title">' + escapeHtml(entry.title || formatDate(entry.createdAt)) + '</div>' +
            '<div class="jnl-entry-card-date">' + formatRelative(entry.createdAt) + '</div>' +
            '<div class="jnl-entry-card-preview">' + escapeHtml((entry.body || '').substring(0, 150)) + '</div>';
        }
        var indicators = [];
        if (entry.mood) indicators.push('<span class="jnl-entry-mood">' + entry.mood + '</span>');
        if (entry.voiceNotes && entry.voiceNotes.length) indicators.push('<span class="jnl-entry-voice-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg></span>');
        if (entry.tags && entry.tags.length) {
          entry.tags.slice(0, 3).forEach(function (t) { indicators.push('<span class="jnl-entry-tag-chip">' + escapeHtml(t) + '</span>'); });
        }
        if (indicators.length) {
          var indEl = document.createElement('div');
          indEl.className = 'jnl-entry-card-indicators';
          indEl.innerHTML = indicators.join('');
          card.appendChild(indEl);
        }
        card.addEventListener('click', function () { goToEditor(entry.id); });
        container.appendChild(card);
      });
    });
    renderTagFilter();
  }

  function loadPhotoIntoCard(card, photoMeta) {
    MateyJournal.getMediaBlob(photoMeta.id).then(function (blob) {
      if (!blob || !card.isConnected) return;
      var url = URL.createObjectURL(blob);
      var placeholder = card.querySelector('.jnl-entry-photo-placeholder');
      if (placeholder) {
        var img = document.createElement('img');
        img.className = 'jnl-entry-photo-img';
        img.src = url;
        img.onload = function () { placeholder.style.display = 'none'; };
        card.insertBefore(img, placeholder);
      } else {
        card.style.backgroundImage = 'url(' + url + ')';
        card.style.backgroundSize = 'cover';
        card.style.backgroundPosition = 'center';
      }
    });
  }

  function renderTagFilter() {
    if (!_currentJournalId) return;
    MateyJournal.getAllTags(_currentJournalId).then(function (tags) {
      var container = $('jnl-tags-filter');
      if (!tags || !tags.length) { container.innerHTML = ''; return; }
      var html = '<button class="jnl-tag-chip' + (!_activeFilterTag ? ' jnl-tag-chip-active' : '') + '" data-tag="">All</button>';
      tags.forEach(function (t) {
        html += '<button class="jnl-tag-chip' + (_activeFilterTag === t ? ' jnl-tag-chip-active' : '') + '" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</button>';
      });
      container.innerHTML = html;
      container.querySelectorAll('.jnl-tag-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          _activeFilterTag = chip.getAttribute('data-tag') || null;
          renderEntries();
        });
      });
    });
  }

  function formatDuration(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function saveEntry() {
    var body = $('jnl-editor-body').value;
    var fontChoice = $('jnl-editor-body').style.fontFamily || null;
    var data = {
      title: '',
      body: body,
      tags: _currentTags.slice(),
      photos: _currentPhotos.slice(),
      voiceNotes: _currentVoiceNotes.slice(),
      fontChoice: fontChoice,
      mood: _currentTags.find(function (t) { return MOODS.some(function (m) { return m.emoji + ' ' + m.label === t; }); }) || null
    };
    var promise;
    if (_currentEntryId) {
      promise = MateyJournal.updateEntry(_currentEntryId, data);
    } else {
      promise = MateyJournal.createEntry(_currentJournalId, data);
    }
    promise.then(function () {
      showToast('Entry saved');
      goToEntryList(_currentJournalId);
    });
  }

  /* ==================== Photo Attach ==================== */
  function handlePhotoSelect(e) {
    var files = e.target.files;
    if (!files || !files.length) return;
    var processed = 0;
    Array.from(files).forEach(function (file) {
      MateyJournal.saveMedia(file, { name: file.name }).then(function (media) {
        _currentPhotos.push({ id: media.id, name: media.name, type: media.type });
        processed++;
        if (processed === files.length) renderMediaStack();
      });
    });
    e.target.value = '';
  }

  /* ==================== Voice Recording ==================== */
  function toggleVoiceRecording() {
    if (_isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function startRecording() {
    if (typeof MediaRecorder === 'undefined') {
      showToast('Recording not supported on this device');
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      _audioChunks = [];
      _recordingStartTime = Date.now();
      var mime = '';
      var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      for (var i = 0; i < candidates.length; i++) {
        if (MediaRecorder.isTypeSupported(candidates[i])) { mime = candidates[i]; break; }
      }
      try {
        _mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (e) {
        _mediaRecorder = new MediaRecorder(stream);
      }
      _mediaRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) _audioChunks.push(e.data);
      };
      _mediaRecorder.onstop = function () {
        var blob = new Blob(_audioChunks, { type: _mediaRecorder.mimeType || 'audio/webm' });
        var duration = (Date.now() - _recordingStartTime) / 1000;
        stream.getTracks().forEach(function (t) { t.stop(); });
        MateyJournal.saveMedia(blob, { name: 'voice-note.webm', duration: duration }).then(function (media) {
          _currentVoiceNotes.push({ id: media.id, duration: duration, type: media.type });
          renderMediaStack();
        });
      };
      _mediaRecorder.start(250);
      _isRecording = true;
      $('jnl-attach-voice').classList.add('jnl-toolbar-btn-recording');
      showToast('Recording...');
    }).catch(function () {
      showToast('Microphone permission denied');
    });
  }

  function stopRecording() {
    if (_mediaRecorder && _mediaRecorder.state === 'recording') {
      _mediaRecorder.stop();
    }
    _isRecording = false;
    var btn = $('jnl-attach-voice');
    if (btn) btn.classList.remove('jnl-toolbar-btn-recording');
  }

  /* ==================== Mood Picker ==================== */
  function openMoodPicker() {
    var grid = $('jnl-mood-grid');
    grid.innerHTML = '';
    MOODS.forEach(function (m) {
      var btn = document.createElement('button');
      btn.className = 'jnl-mood-item';
      btn.innerHTML = '<span class="jnl-mood-emoji">' + m.emoji + '</span><span class="jnl-mood-label">' + m.label + '</span>';
      btn.addEventListener('click', function () {
        var tag = m.emoji + ' ' + m.label;
        if (_currentTags.indexOf(tag) === -1) _currentTags.push(tag);
        hideOverlay('jnl-mood-overlay');
        showToast('Mood set: ' + m.label);
      });
      grid.appendChild(btn);
    });
    showOverlay('jnl-mood-overlay');
  }

  /* ==================== Font Picker ==================== */
  function openFontPicker() {
    var list = $('jnl-font-list');
    list.innerHTML = '';
    FONTS.forEach(function (f) {
      var btn = document.createElement('button');
      btn.className = 'jnl-font-item';
      btn.style.fontFamily = f.family;
      btn.textContent = f.name;
      btn.addEventListener('click', function () {
        $('jnl-editor-body').style.fontFamily = f.family;
        hideOverlay('jnl-font-overlay');
      });
      list.appendChild(btn);
    });
    showOverlay('jnl-font-overlay');
  }

  /* ==================== Tags Editor ==================== */
  function openTagsEditor() {
    renderTagsEditList();
    showOverlay('jnl-tags-overlay');
  }

  function renderTagsEditList() {
    var list = $('jnl-tags-edit-list');
    if (!_currentTags.length) { list.innerHTML = '<p class="jnl-tags-empty">No tags yet</p>'; return; }
    list.innerHTML = '';
    _currentTags.forEach(function (tag, i) {
      var row = document.createElement('div');
      row.className = 'jnl-tags-edit-item';
      row.innerHTML = '<span>' + escapeHtml(tag) + '</span><button class="jnl-icon-btn" type="button">&times;</button>';
      row.querySelector('button').addEventListener('click', function () {
        _currentTags.splice(i, 1);
        renderTagsEditList();
      });
      list.appendChild(row);
    });
  }

  function addTagFromInput() {
    var input = $('jnl-tags-input');
    var val = input.value.trim();
    if (!val) return;
    if (_currentTags.indexOf(val) === -1) _currentTags.push(val);
    input.value = '';
    renderTagsEditList();
  }

  /* ==================== Location ==================== */
  function addLocation() {
    var loc = prompt('Location (freeform text):');
    if (loc && loc.trim()) {
      _currentTags.push('\ud83d\udccd ' + loc.trim());
      showToast('Location added');
    }
  }

  /* ==================== Cover Picker ==================== */
  function openCoverPicker(targetId, type) {
    var grid = $('jnl-cover-grid');
    grid.innerHTML = '';
    COVERS.forEach(function (cover) {
      var btn = document.createElement('button');
      btn.className = 'jnl-cover-item';
      btn.style.setProperty('--jnl-cover', 'var(' + cover + ')');
      btn.addEventListener('click', function () {
        if (type === 'journal') {
          MateyJournal.updateJournal(targetId, { coverStyle: cover }).then(function () {
            hideOverlay('jnl-cover-overlay');
            renderLibrary();
          });
        }
      });
      grid.appendChild(btn);
    });
    showOverlay('jnl-cover-overlay');
  }

  /* ==================== Attach Picker ==================== */
  function showAttachPicker() {
    var picker = $('jnl-attach-picker');
    if (picker) {
      picker.style.display = 'flex';
      picker.classList.add('jnl-overlay-visible');
    }
  }

  function renderMediaStack() {
    var stack = $('jnl-media-stack');
    if (!stack) return;
    var html = '';
    _currentPhotos.forEach(function (p, i) {
      html += '<div class="jnl-media-image-card" data-type="photo" data-index="' + i + '">' +
        '<img class="jnl-media-image-img" src="" alt="" style="display:none" />' +
        '<button class="jnl-media-remove" type="button" data-remove="' + i + '">&times;</button>' +
        '</div>';
    });
    var loc = _currentTags.find(function (t) { return t.indexOf('\ud83d\udccd') === 0; });
    if (loc) {
      html += '<div class="jnl-media-location-chip">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        '<span>' + escapeHtml(loc.replace('\ud83d\udccd ', '')) + '</span>' +
        '<button class="jnl-media-remove" type="button" data-remove-loc="1">&times;</button>' +
        '</div>';
    }
    _currentVoiceNotes.forEach(function (v, i) {
      html += '<div class="jnl-media-voice-player" data-type="voice" data-index="' + i + '">' +
        '<button class="jnl-voice-play" type="button" data-voice-index="' + i + '" aria-label="Play">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>' +
        '</button>' +
        '<div class="jnl-voice-meta">' +
        '<div class="jnl-voice-waveform"><span></span><span></span><span></span><span></span><span></span></div>' +
        '<div class="jnl-voice-duration">' + (v.duration ? formatDuration(v.duration) : 'Voice') + '</div>' +
        '</div>' +
        '<button class="jnl-media-remove" type="button" data-remove-voice="' + i + '">&times;</button>' +
        '</div>';
    });
    stack.innerHTML = html;
    stack.querySelectorAll('.jnl-media-image-img').forEach(function (img) {
      var card = img.closest('.jnl-media-image-card');
      var idx = parseInt(card.getAttribute('data-index'), 10);
      var photo = _currentPhotos[idx];
      if (!photo) return;
      MateyJournal.getMediaBlob(photo.id).then(function (blob) {
        if (!blob || !card.isConnected) return;
        var url = URL.createObjectURL(blob);
        img.src = url;
        img.style.display = 'block';
        img.onload = function () {
          var placeholder = card.querySelector('.jnl-media-image-placeholder');
          if (placeholder) placeholder.style.display = 'none';
        };
      });
    });
    stack.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-remove'), 10);
        _currentPhotos.splice(idx, 1);
        renderMediaStack();
        renderEditorAttachments();
      });
    });
    stack.querySelectorAll('[data-remove-loc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _currentTags = _currentTags.filter(function (t) { return t.indexOf('\ud83d\udccd') !== 0; });
        renderMediaStack();
      });
    });
    stack.querySelectorAll('[data-remove-voice]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-remove-voice'), 10);
        _currentVoiceNotes.splice(idx, 1);
        renderMediaStack();
        renderEditorAttachments();
      });
    });
  }

  /* ==================== Action Sheet ==================== */
  function showActionSheet(title, actions) {
    var overlay = document.createElement('div');
    overlay.className = 'jnl-overlay';
    overlay.style.display = 'flex';
    overlay.classList.add('jnl-overlay-visible');
    var sheet = document.createElement('div');
    sheet.className = 'jnl-sheet';
    if (title) {
      var titleEl = document.createElement('h3');
      titleEl.className = 'jnl-sheet-title';
      titleEl.textContent = title;
      sheet.appendChild(titleEl);
    }
    actions.forEach(function (a) {
      var btn = document.createElement('button');
      btn.className = 'jnl-sheet-item' + (a.danger ? ' jnl-sheet-danger' : '');
      btn.textContent = a.label;
      btn.addEventListener('click', function () {
        overlay.remove();
        a.action();
      });
      sheet.appendChild(btn);
    });
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'jnl-sheet-item';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () { overlay.remove(); });
    sheet.appendChild(cancelBtn);
    overlay.appendChild(sheet);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  /* ==================== Journal Settings ==================== */
  function openJournalSettings() {
    showOverlay('jnl-settings-overlay');
  }

  function journalSettingsRename() {
    hideOverlay('jnl-settings-overlay');
    renameJournal(_currentJournalId);
  }

  function journalSettingsCover() {
    hideOverlay('jnl-settings-overlay');
    openCoverPicker(_currentJournalId, 'journal');
  }

  function journalSettingsAutoLock() {
    hideOverlay('jnl-settings-overlay');
    MateyJournal.getSettings().then(function (settings) {
      var current = Math.round((settings.autoLockMs || 30000) / 1000);
      var val = prompt('Auto-lock timeout in seconds (10-300):', String(current));
      if (val) {
        var ms = parseInt(val, 10) * 1000;
        if (ms >= 10000 && ms <= 300000) {
          settings.autoLockMs = ms;
          MateyJournal.saveSettings(settings);
          showToast('Auto-lock set to ' + val + 's');
        }
      }
    });
  }

  function journalSettingsPin() {
    hideOverlay('jnl-settings-overlay');
    var newPin = prompt('Set a new PIN (4+ characters):');
    if (newPin && newPin.length >= 4) {
      MateyJournal.setPin(newPin).then(function () { showToast('PIN updated'); });
    }
  }

  function journalSettingsDelete() {
    hideOverlay('jnl-settings-overlay');
    MateyJournal.getJournal(_currentJournalId).then(function (j) {
      showConfirm('Delete Journal?', 'This will permanently delete "' + (j ? j.name : 'this journal') + '" and all its entries.', function () {
        MateyJournal.deleteJournal(_currentJournalId).then(function () { goToLibrary(); });
      });
    });
  }

  /* ==================== Search ==================== */
  function toggleSearch() {
    var bar = $('jnl-search-bar');
    if (bar.style.display === 'none') {
      bar.style.display = 'flex';
      $('jnl-search-input').focus();
    } else {
      bar.style.display = 'none';
      $('jnl-search-input').value = '';
      renderEntries();
    }
  }

  /* ==================== Init ==================== */
  function init() {
    /* Make incognito icon status-only on Journal (disable matey-greet.js toggle) */
    var incBtn = document.querySelector('.incognito-trigger');
    if (incBtn) {
      var clone = incBtn.cloneNode(true);
      incBtn.parentNode.replaceChild(clone, incBtn);
      clone.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (MateyJournal.isLocked()) {
          showLock();
          $('jnl-pin-input').focus();
        }
      });
    }

    /* Lock screen */
    $('jnl-unlock-btn').addEventListener('click', tryUnlock);
    $('jnl-setup-btn').addEventListener('click', trySetupPin);
    $('jnl-pin-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if ($('jnl-setup-btn').style.display !== 'none') trySetupPin();
        else tryUnlock();
      }
    });

    /* Library */
    $('jnl-new-journal-btn').addEventListener('click', createNewJournal);

    /* Entry list */
    $('jnl-entry-list-back').addEventListener('click', goToLibrary);
    $('jnl-new-entry-fab').addEventListener('click', function () { goToEditor(null); });
    $('jnl-search-btn').addEventListener('click', toggleSearch);
    $('jnl-journal-settings-btn').addEventListener('click', openJournalSettings);
    $('jnl-search-input').addEventListener('input', debounce(function () { renderEntries(); }, 300));

    /* Editor */
    $('jnl-editor-back').addEventListener('click', function () { goToEntryList(_currentJournalId); });
    $('jnl-editor-body').addEventListener('input', debounce(function () {
      if (_currentEntryId) {
        var body = $('jnl-editor-body').value;
        var fontChoice = $('jnl-editor-body').style.fontFamily || null;
        MateyJournal.updateEntry(_currentEntryId, {
          body: body,
          fontChoice: fontChoice,
          tags: _currentTags.slice(),
          photos: _currentPhotos.slice(),
          voiceNotes: _currentVoiceNotes.slice(),
          mood: _currentTags.find(function (t) { return MOODS.some(function (m) { return m.emoji + ' ' + m.label === t; }); }) || null
        }).catch(function () {});
      }
    }, 800));
    $('jnl-quick-attach').addEventListener('click', function () { showAttachPicker(); });
    $('jnl-attach-pick-photo').addEventListener('click', function () { hideOverlay('jnl-attach-picker'); $('jnl-photo-input').click(); });
    $('jnl-attach-pick-location').addEventListener('click', function () { hideOverlay('jnl-attach-picker'); addLocation(); });
    $('jnl-attach-pick-voice').addEventListener('click', function () { hideOverlay('jnl-attach-picker'); toggleVoiceRecording(); });
    $('jnl-attach-pick-cancel').addEventListener('click', function () { hideOverlay('jnl-attach-picker'); });
    $('jnl-quick-mood').addEventListener('click', openMoodPicker);
    $('jnl-quick-font').addEventListener('click', openFontPicker);

    /* Toolbar */
    if (window.MateyToolbar && typeof window.MateyToolbar.init === 'function') {
      window.MateyToolbar.init('journal', '#md-composer.journal-toolbar');
    }
    // Wire double-stacked toolbar buttons to #jnl-editor-body
    setTimeout(function () {
      var editor = $('jnl-editor-body');
      if (!editor) return;

      // Edit row buttons (arrows, cut, copy, paste, pin)
      document.querySelectorAll('#md-composer .matey-edit-btn').forEach(function (btn) {
        var action = btn.dataset.action;
        if (!action) return;
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          editor.focus();
          var start = editor.selectionStart;
          var end = editor.selectionEnd;
          var val = editor.value;

          switch (action) {
            case 'arrowLeft':
              editor.setSelectionRange(Math.max(0, start - 1), Math.max(0, end - 1));
              break;
            case 'arrowRight':
              editor.setSelectionRange(Math.min(val.length, start + 1), Math.min(val.length, end + 1));
              break;
            case 'arrowUp':
              var beforeNewline = val.lastIndexOf('\n', start - 1);
              if (beforeNewline >= 0) {
                var lineStart = val.lastIndexOf('\n', beforeNewline - 1) + 1;
                var diff = start - beforeNewline - 1;
                var newPos = Math.max(lineStart, lineStart + Math.min(diff, val.substring(lineStart, beforeNewline).length));
                editor.setSelectionRange(newPos, newPos);
              }
              break;
            case 'arrowDown':
              var nextNewline = val.indexOf('\n', start);
              if (nextNewline !== -1) {
                var lineStart = nextNewline + 1;
                var endOfNextLine = val.indexOf('\n', lineStart);
                if (endOfNextLine === -1) endOfNextLine = val.length;
                var lineLen = endOfNextLine - lineStart;
                var currLineStart = val.lastIndexOf('\n', start - 1) + 1;
                var diff = start - currLineStart;
                var newPos = Math.min(lineStart + lineLen, lineStart + Math.min(diff, lineLen));
                editor.setSelectionRange(newPos, newPos);
              }
              break;
            case 'cut':
              if (start !== end) {
                navigator.clipboard.writeText(val.substring(start, end)).then(function () {
                  editor.value = val.substring(0, start) + val.substring(end);
                  editor.setSelectionRange(start, start);
                  editor.dispatchEvent(new Event('input', { bubbles: true }));
                });
              }
              break;
            case 'copy':
              if (start !== end) {
                navigator.clipboard.writeText(val.substring(start, end));
              }
              break;
            case 'paste':
              navigator.clipboard.readText().then(function (text) {
                editor.value = val.substring(0, start) + text + val.substring(end);
                editor.setSelectionRange(start + text.length, start + text.length);
                editor.dispatchEvent(new Event('input', { bubbles: true }));
              }).catch(function () {});
              break;
            case 'pin':
              var timestamp = new Date().toLocaleString([], { hour12: true });
              editor.value = val.substring(0, start) + '[' + timestamp + '] ' + val.substring(end);
              editor.setSelectionRange(start + timestamp.length + 3, start + timestamp.length + 3);
              editor.dispatchEvent(new Event('input', { bubbles: true }));
              break;
          }
        });
      });

      // Symbol row buttons
      document.querySelectorAll('#md-composer .matey-symbol-btn').forEach(function (btn) {
        var key = btn.dataset.key;
        if (!key) return;
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          editor.focus();
          var start = editor.selectionStart;
          var end = editor.selectionEnd;
          var val = editor.value;
          editor.value = val.substring(0, start) + key + val.substring(end);
          editor.setSelectionRange(start + key.length, start + key.length);
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });

      // Mic button - use journal's voice recording
      var micBtn = document.getElementById('journal-mic-btn');
      if (micBtn) {
        micBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          toggleVoiceRecording();
        });
      }
    }, 200);

    $('jnl-attach-photo').addEventListener('click', function () { $('jnl-photo-input').click(); });
    $('jnl-photo-input').addEventListener('change', handlePhotoSelect);
    $('jnl-attach-voice').addEventListener('click', toggleVoiceRecording);
    $('jnl-attach-mood').addEventListener('click', openMoodPicker);
    $('jnl-attach-location').addEventListener('click', addLocation);
    $('jnl-attach-font').addEventListener('click', openFontPicker);

    /* Tags editor */
    $('jnl-tags-add-btn').addEventListener('click', addTagFromInput);
    $('jnl-tags-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addTagFromInput(); }
    });

    /* Settings */
    $('jnl-settings-rename').addEventListener('click', journalSettingsRename);
    $('jnl-settings-cover').addEventListener('click', journalSettingsCover);
    $('jnl-settings-autolock').addEventListener('click', journalSettingsAutoLock);
    $('jnl-settings-pin').addEventListener('click', journalSettingsPin);
    $('jnl-settings-delete').addEventListener('click', journalSettingsDelete);

    /* Overlay close on backdrop click */
    document.querySelectorAll('.jnl-overlay').forEach(function (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) hideOverlay(overlay.id);
      });
    });

    /* Check lock state */
    MateyJournal.isLockEnabled().then(function (enabled) {
      if (enabled) {
        MateyJournal.isLocked().then(function (locked) {
          if (locked) {
            showLock();
            activateIncognitoIcon();
          } else {
            goToLibrary();
            activateIncognitoIcon();
          }
        });
      } else {
        goToLibrary();
      }
    });

    /* Listen for auto-lock */
    MateyJournal.onJournalChange(function (event) {
      if (event === 'autoLocked' || event === 'locked') {
        MateyJournal.isLockEnabled().then(function (enabled) {
          if (enabled) {
            showLock();
            activateIncognitoIcon();
          }
        });
      } else if (event === 'unlocked') {
        activateIncognitoIcon();
      }
    });
  }

  function activateIncognitoIcon() {
    var incBtn = document.querySelector('.incognito-trigger');
    if (incBtn && MateyJournal.isLockEnabled()) {
      incBtn.classList.add('active');
    }
  }

  function debounce(fn, ms) {
    var timer;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

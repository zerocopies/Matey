/* Matey Lifestyle — Grooming, Wardrobe, Culinary, Living, Beat (flat redesign)
   Shared voice-input + like components defined once here and reused by every
   Lifestyle screen; flagged as reusable for Journal / Agent chat later. */
(function () {
  'use strict';

  var PERSONA = 'You are Matey, a warm and friendly AI companion who is the user\'s close friend. You are candid, gently witty, and grounded. Talk like a real friend with real rapport. Short, punchy sentences. Light humor. No fluff, no apology loops, no "as an AI" disclaimers. Always on the user\'s side. Respect regional context: the user lives in the UAE — public decency norms matter, it is very hot most of the year. Never restate or re-ask for information already provided. Ask questions ONLY when necessary — if you have enough context to give a good answer, just give it. You understand what you already know about the user from learning history and won\'t repeat questions across conversations.';

  /* ---------- design tokens / accents ---------- */
  var ACCENTS = {
    grooming: '#EF9F27',
    wardrobe: '#378ADD',
    culinary: '#D85A30',
    living: '#97C459',
    livingDeep: '#639922',
    beat: '#AFA9EC'
  };

  /* ---------- Tabler outline icons (bundled locally — no CDN) ---------- */
  var ICON_PATHS = {
    scissors: '<path d="M6 7m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M6 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M8.6 8.6l10.4 10.4"/><path d="M8.6 15.4l10.4 -10.4"/>',
    shirt: '<path d="M15 4l6 2v5h-3v8a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-8h-3v-5l6 -2a3 3 0 0 0 6 0"/>',
    kitchen: '<path d="M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12zm0 12v6h-1v-3m-10 -14v17m-3 -17v3a3 3 0 1 0 6 0v-3"/>',
    home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/>',
    activity: '<path d="M3 12h4l3 8l4 -16l3 8h4"/>',
    mic: '<path d="M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3z"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M8 21l8 0"/><path d="M12 17l0 4"/>',
    heart: '<path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"/>',
    x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
    plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
    arrowRight: '<path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>',
    camera: '<path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"/><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
    chevronLeft: '<path d="M15 6l-6 6l6 6"/>',
    chevronRight: '<path d="M9 6l6 6l-6 6"/>'
  };

  function IC(name, size) {
    return '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || '') + '</svg>';
  }

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function dataUrlToBase64Block(dataUrl) {
    var m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  }

  function readFile(file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.readAsDataURL(file);
    });
  }

  function getStorage(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return (v === null || v === undefined) ? fallback : v; }
    catch (e) { return fallback; }
  }

  function setStorage(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  /* ---------- persistence (localStorage, same keys as before) ---------- */
  var store = {
    bodyProfile: function () { return getStorage('matey-body-profile', {}); },
    groomingLikes: function () { return getStorage('matey-grooming-likes', []); },
    groomingDislikes: function () { return getStorage('matey-grooming-dislikes', []); },
    wardrobeItems: function () { return getStorage('matey-wardrobe-items', []); },
    saveWardrobeItems: function (v) { setStorage('matey-wardrobe-items', v); },
    wardrobeLikes: function () { return getStorage('matey-wardrobe-likes', []); },
    culinaryPrefs: function () { return getStorage('matey-culinary-prefs', {}); },
    saveCulinaryPrefs: function (p) { setStorage('matey-culinary-prefs', p); },
    culinaryLikes: function () { return getStorage('matey-culinary-likes', []); },
    likes: function (type) { return getStorage('matey-' + type + '-likes', []); },
    setLikes: function (type, arr) { setStorage('matey-' + type + '-likes', arr); },
    toggleLike: function (type, id) {
      var arr = store.likes(type);
      var idx = arr.indexOf(id);
      if (idx === -1) { arr.push(id); } else { arr.splice(idx, 1); }
      store.setLikes(type, arr);
      return idx === -1;
    }
  };

  function buildLearningContext() {
    var parts = [];
    var bp = store.bodyProfile();
    if (bp.skinTone) parts.push('User skin tone: ' + bp.skinTone);
    if (bp.faceShape) parts.push('User face shape: ' + bp.faceShape);
    if (bp.height) parts.push('User height: ' + bp.height);
    if (bp.weight) parts.push('User weight: ' + bp.weight);
    if (bp.bodyType) parts.push('User body type: ' + bp.bodyType);
    var gl = store.groomingLikes(), gd = store.groomingDislikes();
    if (gl.length) parts.push('Previously liked grooming: ' + gl.join('; '));
    if (gd.length) parts.push('Previously disliked grooming: ' + gd.join('; '));
    var wl = store.wardrobeLikes(), wd = store.groomingDislikes();
    if (wl.length) parts.push('Previously liked outfits: ' + wl.join('; '));
    if (wd.length) parts.push('Previously disliked outfits: ' + wd.join('; '));
    var cl = store.culinaryLikes();
    if (cl.length) parts.push('Previously liked recipes: ' + cl.join('; '));
    return parts.length ? '# User Learning Context\n' + parts.join('\n') : '';
  }

  /* ---------- Beat usage tracking (local only) ---------- */
  function weekKey(d) {
    d = d || new Date();
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = (t.getDay() + 6) % 7;
    t.setDate(t.getDate() - day + 3);
    var firstThu = new Date(t.getFullYear(), 0, 4);
    var fday = (firstThu.getDay() + 6) % 7;
    firstThu.setDate(firstThu.getDate() - fday + 3);
    var wk = 1 + Math.round((t - firstThu) / (7 * 864e5));
    return t.getFullYear() + '-W' + wk;
  }
  function monthKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function usageStore() { return getStorage('matey-lifestyle-usage', {}); }
  function trackUsage(section) {
    var u = usageStore();
    if (!u[section]) u[section] = { weekly: {}, monthly: {} };
    u[section].weekly[weekKey()] = (u[section].weekly[weekKey()] || 0) + 1;
    u[section].monthly[monthKey()] = (u[section].monthly[monthKey()] || 0) + 1;
    setStorage('matey-lifestyle-usage', u);
    updateBeatBadge();
  }
  function usageCount(section, period) {
    var u = usageStore();
    if (!u[section]) return 0;
    return period === 'monthly' ? (u[section].monthly[monthKey()] || 0) : (u[section].weekly[weekKey()] || 0);
  }
  function updateBeatBadge() {
    var badge = $('lf-beat-badge');
    if (!badge) return;
    var total = 0;
    ['grooming', 'wardrobe', 'culinary', 'living'].forEach(function (s) { total += usageCount(s, 'weekly'); });
    badge.textContent = total + '/wk';
  }

  /* ---------- shared modal shell ---------- */
  function stopMic(modal) {
    if (modal._listeningField && window.MateySpeech && typeof MateySpeech.stopListening === 'function' && MateySpeech.isRecording) {
      try { MateySpeech.stopListening().catch(function () {}); } catch (e) {}
    }
    modal._listeningField = null;
  }

  function createModal(id, title, subtitle, accent) {
    var existing = $(id);
    if (existing) { stopMic(existing); existing.remove(); }
    var modal = document.createElement('div');
    modal.id = id;
    modal.className = 'lifestyle-modal';
    modal.style.setProperty('--lf-accent', accent || '#8b8b90');
    modal.innerHTML = '<div class="lifestyle-backdrop"></div>' +
      '<div class="lifestyle-dialog">' +
      '<div class="lifestyle-header">' +
      '<button class="lifestyle-back" type="button" aria-label="Back">' + IC('chevronLeft', 22) + '</button>' +
      '<div class="lifestyle-head-text"><span class="lifestyle-title"></span><span class="lifestyle-subtitle"></span></div>' +
      '</div><div class="lifestyle-body"></div></div>';
    document.body.appendChild(modal);
    modal.setTitle = function (t) { modal.querySelector('.lifestyle-title').textContent = t; };
    modal.setSubtitle = function (s) { modal.querySelector('.lifestyle-subtitle').textContent = s || ''; };
    modal.setBody = function (html) { var b = modal.querySelector('.lifestyle-body'); b.innerHTML = html; b.scrollTop = 0; };
    modal.close = function () { stopMic(modal); modal.remove(); };
    modal.querySelector('.lifestyle-back').addEventListener('click', function () {
      if (typeof modal._onBack === 'function') modal._onBack(); else modal.close();
    });
    modal.querySelector('.lifestyle-backdrop').addEventListener('click', function () { modal.close(); });
    modal.setTitle(title);
    modal.setSubtitle(subtitle);
    return modal;
  }

  function showLoading(container) {
    container.innerHTML = '<div class="lifestyle-loading"><img src="./images/matey-logo.png" class="ai-thinking-logo" alt="Thinking…" /><p>Analyzing…</p></div>';
  }
  function showError(container, msg) {
    container.innerHTML = '<div class="lifestyle-error">' + esc(msg) + '</div>';
  }
  function showResult(container, text) {
    container.innerHTML = '<div class="lifestyle-result"><pre class="lifestyle-pre">' + esc(text).replace(/\n/g, '<br>') + '</pre></div>';
  }

  /* ---------- shared: like/save heart ---------- */
  function likeBtnHTML(type, id) {
    var liked = store.likes(type).indexOf(id) !== -1;
    return '<button type="button" class="lf-like' + (liked ? ' liked' : '') + '" data-lf-like="' + esc(id) + '" data-lf-type="' + type + '" aria-label="Save">' + IC('heart', 18) + '</button>';
  }
  function wireLikeButtons(root) {
    root.querySelectorAll('.lf-like').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var liked = store.toggleLike(this.dataset.lfType, this.dataset.lfLike);
        this.classList.toggle('liked', liked);
      });
    });
  }

  /* ---------- shared: voice text input ----------
     46px field + 34px circular mic (15% accent fill, accent icon).
     Mic toggles on-device Whisper listening via window.MateySpeech —
     never the OS/keyboard mic. Submitted values become pill chips:
     chipStyle 'accent' = filled with section accent (preference fields),
     'neutral' = #1c1c20 chips with an x (inventory fields). */
  function voiceFieldHTML(id, placeholder) {
    return '<div class="lf-vinput" id="' + id + '-wrap">' +
      '<input type="text" id="' + id + '" placeholder="' + esc(placeholder) + '" autocomplete="off" />' +
      '<button type="button" class="lf-mic" id="' + id + '-mic" aria-label="Voice input">' + IC('mic', 17) + '</button>' +
      '</div>' +
      '<div class="lf-mic-caption" id="' + id + '-caption">Listening…</div>' +
      '<div class="lf-chips" id="' + id + '-chips"></div>';
  }

  function wireVoiceField(modal, id, opts) {
    var input = modal.querySelector('#' + id);
    var wrap = modal.querySelector('#' + id + '-wrap');
    var caption = modal.querySelector('#' + id + '-caption');
    var chipsEl = modal.querySelector('#' + id + '-chips');
    var values = (opts.initial || []).slice();

    function renderChips() {
      chipsEl.innerHTML = values.map(function (v, i) {
        return '<span class="lf-chip' + (opts.chipStyle === 'accent' ? ' lf-chip-accent' : '') + '">' +
          '<span class="lf-chip-text">' + esc(v) + '</span>' +
          '<button type="button" class="lf-chip-x" data-lf-chip="' + i + '" aria-label="Remove">' + IC('x', 12) + '</button></span>';
      }).join('');
      chipsEl.querySelectorAll('.lf-chip-x').forEach(function (btn) {
        btn.addEventListener('click', function () {
          values.splice(parseInt(this.dataset.lfChip, 10), 1);
          renderChips();
          if (opts.onChange) opts.onChange(values.slice());
        });
      });
    }

    function addValue(v) {
      v = (v || '').trim().replace(/\s+/g, ' ');
      if (!v) return;
      var parts = opts.chipSplit ? v.split(/,|\band\b/i).map(function (s) { return s.trim(); }).filter(Boolean) : [v];
      parts.forEach(function (p) { if (values.indexOf(p) === -1) values.push(p); });
      input.value = '';
      renderChips();
      if (opts.onChange) opts.onChange(values.slice());
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addValue(input.value); }
    });

    function setListening(on) {
      wrap.classList.toggle('listening', !!on);
      caption.style.display = on ? 'block' : 'none';
    }

    micClick(modal.querySelector('#' + id + '-mic'));
    function micClick(micBtn) {
      micBtn.addEventListener('click', function () {
        var S = window.MateySpeech;
        if (!S || typeof S.startListening !== 'function' || typeof S.stopListening !== 'function') {
          caption.textContent = 'Voice input unavailable';
          caption.style.display = 'block';
          setTimeout(function () { caption.style.display = 'none'; }, 2000);
          return;
        }
        if (modal._listeningField === id) {
          modal._listeningField = null;
          setListening(false);
          caption.textContent = 'Transcribing…';
          caption.style.display = 'block';
          S.stopListening(opts.domain || 'culinary', { field: id }).then(function (text) {
            caption.style.display = 'none';
            if (text) addValue(text);
          }).catch(function () {
            caption.style.display = 'none';
          });
          return;
        }
        if (modal._listeningField) {
          /* another field on this modal is listening — stop it first */
          var prevId = modal._listeningField;
          modal._listeningField = null;
          var prevWrap = modal.querySelector('#' + prevId + '-wrap');
          var prevCap = modal.querySelector('#' + prevId + '-caption');
          if (prevCap) prevCap.style.display = 'none';
          S.stopListening(opts.domain || 'culinary', {}).then(function (text) {
            if (text && prevId) {
              var prevInput = modal.querySelector('#' + prevId);
              if (prevInput) {
                prevInput.value = text;
                prevInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              }
            }
          }).catch(function () {});
        }
        S.startListening().then(function () {
          modal._listeningField = id;
          setListening(true);
        }).catch(function () {
          caption.textContent = 'Microphone unavailable';
          caption.style.display = 'block';
          setTimeout(function () { caption.style.display = 'none'; }, 2000);
        });
      });
    }

    renderChips();
    return { getValues: function () { return values.slice(); } };
  }

  /* ============================================================
     CULINARY — input screen (voice fields) + results (recipe cards)
     ============================================================ */
  function openCulinary() {
    var accent = ACCENTS.culinary;
    var modal = createModal('modal-culinary', 'Culinary', 'Tell us what to cook with', accent);
    var cuisineField = null, ingredientsField = null;

    function savePrefs() {
      var prefs = store.culinaryPrefs();
      prefs.cuisinesList = cuisineField ? cuisineField.getValues() : (prefs.cuisinesList || []);
      prefs.ingredientsList = ingredientsField ? ingredientsField.getValues() : (prefs.ingredientsList || []);
      store.saveCulinaryPrefs(prefs);
    }

    function renderInput() {
      modal._onBack = null;
      modal.setTitle('Culinary');
      modal.setSubtitle('Tell us what to cook with');
      var prefs = store.culinaryPrefs();
      modal.setBody(
        '<div class="lf-field"><label class="lf-label">What do you like to eat?</label>' +
        voiceFieldHTML('lf-cuisine', 'e.g. South Indian, or any cuisine') + '</div>' +
        '<div class="lf-field"><label class="lf-label">What\'s in your kitchen?</label>' +
        voiceFieldHTML('lf-ingredients', 'e.g. tomatoes, chilies, rice') + '</div>' +
        '<button type="button" class="lf-btn-primary" id="lf-find-recipes">Find recipes ' + IC('arrowRight', 18) + '</button>' +
        '<div id="lf-culinary-inline" class="lifestyle-result-container"></div>'
      );
      cuisineField = wireVoiceField(modal, 'lf-cuisine', {
        accent: accent, chipStyle: 'accent', domain: 'culinary', chipSplit: false,
        initial: prefs.cuisinesList || [], onChange: savePrefs
      });
      ingredientsField = wireVoiceField(modal, 'lf-ingredients', {
        accent: accent, chipStyle: 'neutral', domain: 'culinary', chipSplit: true,
        initial: prefs.ingredientsList || [], onChange: savePrefs
      });
      modal.querySelector('#lf-find-recipes').addEventListener('click', findRecipes);
    }

    function findRecipes() {
      var cuisines = cuisineField.getValues();
      var ingredients = ingredientsField.getValues();
      var inlineEl = modal.querySelector('#lf-culinary-inline');
      if (!cuisines.length && !ingredients.length) {
        showError(inlineEl, 'Add a cuisine or a few ingredients first.');
        return;
      }
      trackUsage('culinary');
      modal._onBack = renderInput;
      modal.setTitle('Your recipes');
      modal.setSubtitle(
        (cuisines.length ? cuisines.join(', ') : 'any cuisine') + ' · ' +
        (ingredients.length ? ingredients.length + ' ingredient' + (ingredients.length > 1 ? 's' : '') : 'pantry')
      );
      modal.setBody('<div id="lf-culinary-result" class="lifestyle-result-container"></div>');
      var resultEl = modal.querySelector('#lf-culinary-result');
      showLoading(resultEl);

      var learning = buildLearningContext();
      var prompt = '# Request\nSuggest 3 to 5 recipes I can cook.' +
        (cuisines.length ? '\nPreferred cuisines: ' + cuisines.join(', ') : '') +
        (ingredients.length ? '\nIngredients available: ' + ingredients.join(', ') : '') +
        '\nWork with what I have — don\'t block on missing items.' +
        '\nReturn ONLY a JSON array (no markdown), each object: { "name": string, "time": string (e.g. "30 min"), "difficulty": string (Easy/Medium/Hard), "cuisine": string }';
      var messages = [{ role: 'system', content: PERSONA + (learning ? '\n\n' + learning : '') }, { role: 'user', content: [{ type: 'text', text: prompt }] }];

      MateyByok.chat(messages).then(function (text) {
        var recipes = (function () { try { var p = JSON.parse(text); return Array.isArray(p) ? p : null; } catch (e) { return null; } })();
        if (!recipes) { showResult(resultEl, text); return; }
        var html = recipes.slice(0, 5).map(function (r, i) {
          var name = r.name || 'Recipe ' + (i + 1);
          return '<div class="lf-recipe-card">' +
            '<div class="lf-recipe-img">' + IC('kitchen', 30) + '</div>' +
            likeBtnHTML('culinary', name) +
            '<div class="lf-card-title">' + esc(name) + '</div>' +
            '<div class="lf-card-meta">' + esc(r.time || '—') + ' · ' + esc(r.difficulty || '—') + ' · ' + esc(r.cuisine || '—') + '</div>' +
            '</div>';
        }).join('');
        resultEl.innerHTML = html;
        wireLikeButtons(resultEl);
      }).catch(function (e) {
        showError(resultEl, e.message || 'Recipe search failed — check your AI key under Settings → Custom.');
      });
    }

    renderInput();
  }

  /* ============================================================
     GROOMING — photo capture + three pick cards
     ============================================================ */
  function openGrooming() {
    var accent = ACCENTS.grooming;
    var modal = createModal('modal-grooming', 'Grooming', 'Let\'s find your look', accent);
    var photoDataUrl = null;

    function renderInput() {
      modal._onBack = null;
      modal.setTitle('Grooming');
      modal.setSubtitle('Let\'s find your look');
      modal.setBody(
        '<input type="file" accept="image/*" id="lf-groom-file" style="display:none" />' +
        '<div class="lf-photo-area" id="lf-groom-photo">' + IC('camera', 34) +
        '<span>Add a clear front-facing photo</span></div>' +
        '<ul class="lf-tips">' +
        '<li>Use good, even lighting — avoid harsh shadows</li>' +
        '<li>Keep your face centered and fully visible</li>' +
        '<li>No sunglasses or hats</li>' +
        '</ul>' +
        '<button type="button" class="lf-btn-primary" id="lf-groom-analyse">Analyse my look</button>' +
        '<div id="lf-groom-result" class="lifestyle-result-container"></div>'
      );
      var photoEl = modal.querySelector('#lf-groom-photo');
      var fileEl = modal.querySelector('#lf-groom-file');
      photoDataUrl = null;
      photoEl.addEventListener('click', function () { fileEl.click(); });
      fileEl.addEventListener('change', function () {
        var file = this.files[0];
        if (!file) return;
        readFile(file).then(function (dataUrl) {
          photoDataUrl = dataUrl;
          photoEl.innerHTML = '<img src="' + dataUrl + '" alt="Selfie preview" />';
          photoEl.classList.add('filled');
        });
      });
      modal.querySelector('#lf-groom-analyse').addEventListener('click', analyse);
    }

    function analyse() {
      var resultEl = modal.querySelector('#lf-groom-result');
      if (!photoDataUrl) { showError(resultEl, 'Add a clear front-facing photo first.'); return; }
      trackUsage('grooming');
      modal._onBack = renderInput;
      modal.setTitle('Your picks');
      modal.setSubtitle('Based on your photo');
      modal.setBody('<div id="lf-groom-result-body" class="lifestyle-result-container"></div>');
      var body = modal.querySelector('#lf-groom-result-body');
      showLoading(body);

      var block = dataUrlToBase64Block(photoDataUrl);
      var learning = buildLearningContext();
      var prompt = 'Analyse this selfie. Identify the user\'s face shape, then suggest one flattering hairstyle, one beard style and one moustache style. For each, give a short one-line reason it suits the face shape. Return ONLY JSON: { "face_shape": string, "hairstyle": { "name": string, "reason": string }, "beard_style": { "name": string, "reason": string }, "moustache": { "name": string, "reason": string } }';
      var messages = [{ role: 'system', content: PERSONA + (learning ? '\n\n' + learning : '') }, { role: 'user', content: [block, { type: 'text', text: prompt }] }];

      MateyByok.chatVision(messages).then(function (text) {
        var parsed = (function () { try { return JSON.parse(text); } catch (e) { return null; } })();
        if (!parsed || !parsed.hairstyle) { showResult(body, typeof text === 'string' ? text : 'Analysis failed'); return; }
        var items = [
          { label: 'Hairstyle', data: parsed.hairstyle },
          { label: 'Beard style', data: parsed.beard_style },
          { label: 'Moustache style', data: parsed.moustache }
        ];
        body.innerHTML = items.filter(function (i) { return i.data; }).map(function (i) {
          return '<div class="lf-groom-card">' +
            '<div class="lf-groom-icon">' + IC('scissors', 20) + '</div>' +
            '<div class="lf-groom-text"><div class="lf-card-title" style="padding:0">' + esc(i.data.name || i.label) + '</div>' +
            '<div class="lf-card-meta" style="padding:2px 0 0">' + esc(i.data.reason || i.label) + '</div></div>' +
            likeBtnHTML('grooming', i.data.name || i.label) +
            '</div>';
        }).join('');
        wireLikeButtons(body);
      }).catch(function (e) {
        showError(body, e.message || 'Analysis failed — check your AI key under Settings → Custom.');
      });
    }

    renderInput();
  }

  /* ============================================================
     WARDROBE — closet grid + outfit of the day
     ============================================================ */
  var WARDROBE_CATEGORIES = [
    { label: 'Shirt', type: 'top' }, { label: 'T-shirt', type: 'top' },
    { label: 'Trousers', type: 'bottom' }, { label: 'Shorts', type: 'bottom' },
    { label: 'Jacket', type: 'outer' }, { label: 'Shoes', type: 'shoes' },
    { label: 'Other', type: 'other' }
  ];

  function openWardrobe() {
    var accent = ACCENTS.wardrobe;
    var modal = createModal('modal-wardrobe', 'Wardrobe', 'Your digital closet', accent);

    function render() {
      modal._onBack = null;
      modal.setTitle('Wardrobe');
      modal.setSubtitle('Your digital closet');
      modal.setBody(
        '<input type="file" accept="image/*" id="lf-ward-file" style="display:none" />' +
        '<div class="lf-add-row" id="lf-ward-add">' + IC('plus', 20) + '<span>Add a clothing photo</span></div>' +
        '<div id="lf-ward-editor"></div>' +
        '<div class="lf-wgrid" id="lf-ward-grid"></div>' +
        '<button type="button" class="lf-btn-primary" id="lf-ward-outfit" style="margin-top:18px">Create an outfit</button>' +
        '<div id="lf-ward-result" class="lifestyle-result-container"></div>'
      );
      var fileEl = modal.querySelector('#lf-ward-file');
      modal.querySelector('#lf-ward-add').addEventListener('click', function () { fileEl.click(); });
      fileEl.addEventListener('change', function () {
        var file = this.files[0];
        if (!file) return;
        readFile(file).then(function (dataUrl) { showEditor(dataUrl); });
        this.value = '';
      });
      modal.querySelector('#lf-ward-outfit').addEventListener('click', createOutfit);
      renderGrid();
    }

    function showEditor(dataUrl) {
      var editor = modal.querySelector('#lf-ward-editor');
      editor.innerHTML = '<div class="lf-inline-editor">' +
        '<img src="' + dataUrl + '" style="width:100%;max-height:160px;object-fit:cover;border-radius:12px;display:block;margin-bottom:10px" />' +
        '<label class="lf-label">Category</label>' +
        '<select class="lf-vinput" id="lf-ward-cat" style="height:46px;background:#141418;border:1px solid #29292e;border-radius:12px;color:#f0f0f0;font-size:14px;padding:0 14px;width:100%">' +
        WARDROBE_CATEGORIES.map(function (c) { return '<option value="' + c.label + '">' + c.label + '</option>'; }).join('') +
        '</select>' +
        '<div style="display:flex;gap:10px;margin-top:12px">' +
        '<button type="button" class="lf-btn-primary" id="lf-ward-save" style="height:42px;font-size:14px">Save item</button>' +
        '<button type="button" class="lf-btn-primary" id="lf-ward-cancel" style="height:42px;font-size:14px;background:#29292e">Cancel</button>' +
        '</div></div>';
      editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      modal.querySelector('#lf-ward-cancel').addEventListener('click', function () {
        editor.innerHTML = '';
      });
      modal.querySelector('#lf-ward-save').addEventListener('click', function () {
        var catLabel = modal.querySelector('#lf-ward-cat').value;
        var cat = WARDROBE_CATEGORIES.find(function (c) { return c.label === catLabel; }) || WARDROBE_CATEGORIES[0];
        var items = store.wardrobeItems();
        items.push({ id: Date.now(), type: cat.type, name: cat.label, image: dataUrl, color: '', pattern: '', tags: [] });
        store.saveWardrobeItems(items);
        editor.innerHTML = '';
        renderGrid();
      });
    }

    function renderGrid() {
      var grid = modal.querySelector('#lf-ward-grid');
      var items = store.wardrobeItems();
      if (!items.length) {
        grid.innerHTML = '<div class="lf-wempty">Your closet is empty — add your first item above.</div>';
        return;
      }
      grid.innerHTML = items.map(function (it) {
        return '<div class="lf-wthumb">' +
          (it.image ? '<img src="' + it.image + '" alt="' + esc(it.name) + '" />' : '') +
          '<span class="lf-wlabel">' + esc(it.name || it.type || 'Item') + '</span></div>';
      }).join('');
    }

    function createOutfit() {
      var resultEl = modal.querySelector('#lf-ward-result');
      var items = store.wardrobeItems();
      if (items.length < 2) { showError(resultEl, 'Add at least 2 items to create an outfit.'); return; }
      trackUsage('wardrobe');
      showLoading(resultEl);
      var bp = store.bodyProfile();
      var wardrobeDesc = items.map(function (it) { return '- ' + it.name + ' (' + it.type + ')' + (it.color ? ' — ' + it.color : ''); }).join('\n');
      var prompt = '# Request\nPick the best outfit of the day from my wardrobe. Match colours to my skin tone and keep it practical for hot weather.\n\n# Wardrobe\n' + wardrobeDesc + '\n# Body profile\nSkin tone: ' + (bp.skinTone || 'unknown') + '\n\nReturn ONLY JSON: { "top": string, "bottom": string, "extra": string (optional third item), "why": string (one or two sentences of colour-match reasoning) }';
      var messages = [{ role: 'system', content: PERSONA }, { role: 'user', content: [{ type: 'text', text: prompt }] }];

      MateyByok.chat(messages).then(function (text) {
        var outfit = (function () { try { return JSON.parse(text); } catch (e) { return null; } })();
        if (!outfit || !outfit.top) { showResult(resultEl, text); return; }
        var wanted = [outfit.top, outfit.bottom, outfit.extra].filter(Boolean).slice(0, 3);
        var thumbs = wanted.map(function (w) {
          var match = items.find(function (it) { return (it.name || '').toLowerCase() === String(w).toLowerCase(); });
          return match && match.image ? '<img src="' + match.image + '" alt="' + esc(w) + '" />' : '';
        }).join('');
        resultEl.innerHTML = '<div class="lf-outfit-card">' +
          '<div class="lf-card-title" style="padding:0">Outfit of the day</div>' +
          '<div class="lf-outfit-thumbs">' + thumbs + '</div>' +
          '<div class="lf-outfit-note">' + esc(outfit.why || '') + '</div>' +
          likeBtnHTML('wardrobe', 'outfit-' + (outfit.top || '') + '-' + (outfit.bottom || '')) +
          '</div>';
        wireLikeButtons(resultEl);
      }).catch(function (e) {
        showError(resultEl, e.message || 'Outfit creation failed — check your AI key under Settings → Custom.');
      });
    }

    render();
  }

  /* ============================================================
     LIVING — four photo slots + numbered suggestions
     Open question (noted for revisit): requires at least ONE photo,
     not all four — simplest to implement first.
     ============================================================ */
  var LIVING_ANGLES = ['Entrance', 'Left', 'Right', 'Opposite'];

  function openLiving() {
    var accent = ACCENTS.living;
    var modal = createModal('modal-living', 'Living', 'Rearrange what you already have', accent);
    var photos = {};

    function render() {
      modal._onBack = null;
      modal.setTitle('Living');
      modal.setSubtitle('Rearrange what you already have');
      modal.setBody(
        '<div class="lf-lgrid">' +
        LIVING_ANGLES.map(function (angle, i) {
          return '<div class="lf-lslot" data-angle="' + angle + '" id="lf-lslot-' + i + '">' +
            '<input type="file" accept="image/*" id="lf-lfile-' + i + '" style="display:none" />' +
            '<span class="lf-lslot-label">' + angle + '</span></div>';
        }).join('') +
        '</div>' +
        '<button type="button" class="lf-btn-primary" id="lf-living-go" style="background:' + ACCENTS.livingDeep + '">Get suggestions</button>' +
        '<div id="lf-living-result" class="lifestyle-result-container"></div>'
      );
      photos = {};
      LIVING_ANGLES.forEach(function (angle, i) {
        var slot = modal.querySelector('#lf-lslot-' + i);
        var fileEl = modal.querySelector('#lf-lfile-' + i);
        slot.addEventListener('click', function () { fileEl.click(); });
        fileEl.addEventListener('change', function () {
          var file = this.files[0];
          if (!file) return;
          readFile(file).then(function (dataUrl) {
            photos[angle] = dataUrl;
            slot.innerHTML = '<img src="' + dataUrl + '" alt="' + esc(angle) + ' view" />' +
              '<span class="lf-lslot-label">' + angle + '</span>';
            slot.classList.add('filled');
          });
        });
      });
      modal.querySelector('#lf-living-go').addEventListener('click', suggest);
    }

    function suggest() {
      var resultEl = modal.querySelector('#lf-living-result');
      var angles = Object.keys(photos);
      if (!angles.length) { showError(resultEl, 'Add at least one photo of your space (all four is best).'); return; }
      trackUsage('living');
      showLoading(resultEl);
      var blocks = angles.map(function (a) {
        return { block: dataUrlToBase64Block(photos[a]), angle: a };
      }).filter(function (x) { return x.block; });
      var content = [{ type: 'text', text: 'These are photos of my room from these angles: ' + blocks.map(function (b) { return b.angle; }).join(', ') + '. Suggest 4 to 6 specific, numbered rearrangement moves (e.g. "Move the sofa to face the window"). Consider light, traffic flow and what I already own. Return ONLY JSON: { "suggestions": [string, …] }' }];
      blocks.forEach(function (b) { content.push(b.block); });
      var messages = [{ role: 'system', content: PERSONA }, { role: 'user', content: content }];

      MateyByok.chatVision(messages).then(function (text) {
        var parsed = (function () { try { return JSON.parse(text); } catch (e) { return null; } })();
        var suggestions = parsed && parsed.suggestions;
        if (!suggestions || !suggestions.length) { showResult(resultEl, typeof text === 'string' ? text : 'No suggestions returned'); return; }
        resultEl.innerHTML = '<div class="lf-lsug-list">' + suggestions.slice(0, 6).map(function (s, i) {
          return '<div class="lf-lsug"><div class="lf-lnum">' + (i + 1) + '</div><div class="lf-lsug-text">' + esc(s) + '</div></div>';
        }).join('') + '</div>';
      }).catch(function (e) {
        showError(resultEl, e.message || 'Suggestions failed — check your AI key under Settings → Custom.');
      });
    }

    render();
  }

  /* ============================================================
     BEAT — stats-only screen (weekly/monthly segmented toggle)
     ============================================================ */
  function openBeat() {
    var accent = ACCENTS.beat;
    var modal = createModal('modal-beat', 'Beat', 'Your usage rhythm', accent);
    var period = 'weekly';
    var sections = [
      { id: 'grooming', label: 'Grooming', icon: 'scissors', accent: ACCENTS.grooming },
      { id: 'wardrobe', label: 'Wardrobe', icon: 'shirt', accent: ACCENTS.wardrobe },
      { id: 'culinary', label: 'Culinary', icon: 'kitchen', accent: ACCENTS.culinary },
      { id: 'living', label: 'Living', icon: 'home', accent: ACCENTS.living }
    ];

    function render() {
      var counts = sections.map(function (s) { return usageCount(s.id, period); });
      var max = Math.max.apply(null, counts.concat([1]));
      modal.setBody(
        '<div class="lf-seg" id="lf-beat-seg">' +
        '<button type="button" data-period="weekly" class="' + (period === 'weekly' ? 'active' : '') + '">Weekly</button>' +
        '<button type="button" data-period="monthly" class="' + (period === 'monthly' ? 'active' : '') + '">Monthly</button>' +
        '</div>' +
        sections.map(function (s, i) {
          var c = counts[i];
          var pct = max > 0 ? Math.round((c / max) * 100) : 0;
          return '<div class="lf-stat-row">' +
            '<div class="lf-row-icon" style="background:' + hexToRgba(s.accent, 0.15) + ';color:' + s.accent + '">' + IC(s.icon, 20) + '</div>' +
            '<div class="lf-row-text"><div class="lf-row-title">' + s.label + '</div>' +
            '<div class="lf-stat-bar"><div class="lf-stat-fill" style="width:' + (c > 0 ? Math.max(pct, 6) : 0) + '%"></div></div></div>' +
            '<div class="lf-stat-count">' + c + ' ' + (c === 1 ? 'time' : 'times') + '</div>' +
            '</div>';
        }).join('')
      );
      modal.querySelectorAll('#lf-beat-seg button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          period = this.dataset.period;
          modal.querySelectorAll('#lf-beat-seg button').forEach(function (b) { b.classList.remove('active'); });
          this.classList.add('active');
          render();
        });
      });
    }

    render();
  }

  function hexToRgba(hex, alpha) {
    var m = hex.replace('#', '');
    var r = parseInt(m.substring(0, 2), 16), g = parseInt(m.substring(2, 4), 16), b = parseInt(m.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* ============================================================
     COACH — tip rotation with local hardening state
     ============================================================ */
  var COACH_TIPS = [
    { id: 'tip-1', text: 'You can drop PDFs or CSVs directly into the chat to search and analyze them locally.' },
    { id: 'tip-2', text: 'Ask your Agent to inspect local directory files using native shell commands.' },
    { id: 'tip-3', text: 'Set custom workspace filters in Journal to organize entries by tag or keyword.' },
    { id: 'tip-4', text: 'Your Agent streams responses locally without sending raw text to an external cloud.' },
    { id: 'tip-5', text: 'Paste X or YouTube links in My-VOTS to draft instant zero-network takes.' },
    { id: 'tip-6', text: 'Long-press or record up to 60 seconds of voice input with auto noise suppression.' },
    { id: 'tip-7', text: 'Use pattern or PIN locks to secure private Journal entries locally.' },
    { id: 'tip-8', text: 'Attach images to extract inline text and context directly into Agent conversations.' }
  ];

  function getHardenedTips() {
    try { var v = JSON.parse(localStorage.getItem('matey-coach-hardened')); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function setHardenedTips(arr) { try { localStorage.setItem('matey-coach-hardened', JSON.stringify(arr)); } catch (e) {} }
  function isTipHardened(tipId) { return getHardenedTips().some(function (h) { return h.tipId === tipId; }); }

  function getNextTip() {
    var hardened = getHardenedTips();
    var hardenedIds = hardened.map(function (h) { return h.tipId; });
    for (var i = 0; i < COACH_TIPS.length; i++) {
      if (hardenedIds.indexOf(COACH_TIPS[i].id) === -1) return COACH_TIPS[i];
    }
    return COACH_TIPS[0];
  }

  function updateCoachCardSubtitle() {
    var sub = document.getElementById('lf-coach-subtitle');
    if (!sub) return;
    var tip = getNextTip();
    var text = (tip && tip.text) ? tip.text : 'One thing your Agent can do';
    sub.textContent = text.length > 60 ? text.slice(0, 57) + '…' : text;
  }

  function openCoach() {
    var accent = '#FFD166';
    var modal = createModal('modal-coach', "Matey's Corner", '', accent);
    var tip = getNextTip();

    modal.setBody(
      '<div class="lf-coach-tip">' +
        '<div class="lf-coach-tip-text">' + esc(tip.text) + '</div>' +
        '<button type="button" class="lf-btn-primary" id="lf-coach-next" style="margin-top:18px;background:' + accent + ';color:#1c1c20">Got it, next one</button>' +
      '</div>'
    );

    modal.querySelector('#lf-coach-next').addEventListener('click', function () {
      var hardened = getHardenedTips();
      hardened.push({ tipId: tip.id, tipText: tip.text, hardenedAt: new Date().toISOString() });
      setHardenedTips(hardened);
      updateCoachCardSubtitle();
      modal.close();
    });
  }

  /* ---------- Matey's Corner: dynamic DOM injection ---------- */
  /* The Coach card is injected by JS instead of being hardcoded in
     lifestyle.html. Some Android WebViews drop statically-positioned nodes
     during layout recalculations; a JS-managed node that re-asserts itself
     after every render pass stays visible permanently. Click handling needs
     no rewiring: wire() delegates on [data-cat] at the document level. */
  var COACH_CARD_HTML =
    '<div class="lf-row" data-cat="coach" role="button" tabindex="0">' +
      '<div class="lf-row-icon lf-coach-icon" style="background:rgba(255,215,0,0.12);color:#FFD166"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>' +
      '<div class="lf-row-text"><div class="lf-row-title">Matey\'s Corner</div><div class="lf-row-desc" id="lf-coach-subtitle">One thing your Agent can do</div></div>' +
      '<span class="lf-row-chevron"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6"/></svg></span>' +
    '</div>';

  var _coachGuard = null;

  function findCoachCard() {
    return document.querySelector('.lf-rows [data-cat="coach"]');
  }

  function injectCoachCard(immediate) {
    var rows = document.querySelector('.lf-rows');
    if (!rows) return;
    var run = function () {
      var existing = findCoachCard();
      if (existing && existing.isConnected) { assertCoachCardVisible(); return; }
      rows.insertAdjacentHTML('beforeend', COACH_CARD_HTML);
      updateCoachCardSubtitle();
      startCoachGuard();
    };
    if (immediate) { run(); return; }
    /* Guarantee execution after the primary layout render pass (double rAF;
       setTimeout fallback for WebViews without rAF) */
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () { window.requestAnimationFrame(run); });
    } else {
      setTimeout(run, 50);
    }
  }

  /* Re-enforce visibility immediately if the card was unmounted or hidden */
  function assertCoachCardVisible() {
    var card = findCoachCard();
    if (!card || !card.isConnected) { injectCoachCard(true); return; }
    if (card.hasAttribute('hidden')) card.removeAttribute('hidden');
    if (card.style && card.style.display === 'none') card.style.display = '';
    if (card.style && card.style.visibility === 'hidden') card.style.visibility = '';
    if (card.style && card.style.opacity === '0') card.style.opacity = '';
  }

  /* DOM mutation guard: watches .lf-rows for removals/attribute changes and
     restores the card in the same tick. (An IntersectionObserver is a poor
     fit here — it also fires when the card is legitimately scrolled out of
     view, which would cause false re-render loops.) */
  function startCoachGuard() {
    if (_coachGuard || typeof window.MutationObserver !== 'function') return;
    var rows = document.querySelector('.lf-rows');
    if (!rows) return;
    _coachGuard = new MutationObserver(function () {
      assertCoachCardVisible();
    });
    _coachGuard.observe(rows, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
  }

  /* ---------- wiring ---------- */
  function wire() {
    document.addEventListener('click', function (e) {
      var row = e.target.closest('[data-cat]');
      if (!row || row.closest('.lifestyle-modal')) return;
      var cat = row.dataset.cat;
      if (cat === 'grooming') openGrooming();
      else if (cat === 'wardrobe') openWardrobe();
      else if (cat === 'culinary') openCulinary();
      else if (cat === 'living') openLiving();
      else if (cat === 'beat') openBeat();
      else if (cat === 'coach') openCoach();
    });
    updateBeatBadge();
  }

  window.MateyLifestyle = {
    wire: wire,
    injectCoachCard: injectCoachCard,
    assertCoachCardVisible: assertCoachCardVisible,
    voiceFieldHTML: voiceFieldHTML,
    wireVoiceField: wireVoiceField,
    likeBtnHTML: likeBtnHTML,
    wireLikeButtons: wireLikeButtons,
    trackUsage: trackUsage
  };
  function boot() {
    wire();
    /* Inject Matey's Corner after the primary layout render pass */
    injectCoachCard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

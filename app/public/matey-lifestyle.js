/* Matey Lifestyle — Grooming, Wardrobe, Culinary, Lifestyle with AI learning */
(function () {
  'use strict';

  var PERSONA = 'You are Matey, a warm and friendly AI companion who is the user\'s close friend. You are candid, gently witty, and grounded. Talk like a real friend with real rapport. Short, punchy sentences. Light humor. No fluff, no apology loops, no "as an AI" disclaimers. Always on the user\'s side. Respect regional context: the user lives in the UAE — public decency norms matter, it is very hot most of the year. Never restate or re-ask for information already provided. Ask questions ONLY when necessary — if you have enough context to give a good answer, just give it. You understand what you already know about the user from learning history and won\'t repeat questions across conversations.';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

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
    try { var v = JSON.parse(localStorage.getItem(key)); return v || fallback; }
    catch (e) { return fallback; }
  }

  function setStorage(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var store = {
    bodyProfile: function () { return getStorage('matey-body-profile', {}); },
    saveBodyProfile: function (p) { setStorage('matey-body-profile', p); },
    groomingLikes: function () { return getStorage('matey-grooming-likes', []); },
    groomingDislikes: function () { return getStorage('matey-grooming-dislikes', []); },
    wardrobeItems: function () { return getStorage('matey-wardrobe-items', []); },
    saveWardrobeItems: function (v) { setStorage('matey-wardrobe-items', v); },
    wardrobeLikes: function () { return getStorage('matey-wardrobe-likes', []); },
    wardrobeDislikes: function () { return getStorage('matey-wardrobe-dislikes', []); },
    culinaryPrefs: function () { return getStorage('matey-culinary-prefs', {}); },
    saveCulinaryPrefs: function (p) { setStorage('matey-culinary-prefs', p); },
    culinaryLikes: function () { return getStorage('matey-culinary-likes', []); },
    culinaryDislikes: function () { return getStorage('matey-culinary-dislikes', []); }
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

    var wl = store.wardrobeLikes(), wd = store.wardrobeDislikes();
    if (wl.length) parts.push('Previously liked outfits: ' + wl.join('; '));
    if (wd.length) parts.push('Previously disliked outfits: ' + wd.join('; '));

    var cl = store.culinaryLikes(), cd = store.culinaryDislikes();
    if (cl.length) parts.push('Previously liked recipes: ' + cl.join('; '));
    if (cd.length) parts.push('Previously disliked recipes: ' + cd.join('; '));

    return parts.length ? '# User Learning Context\n' + parts.join('\n') : '';
  }

  function createModal(id, title, bodyHtml) {
    var existing = $(id);
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = id;
    modal.className = 'lifestyle-modal';
    modal.innerHTML = '<div class="lifestyle-backdrop"></div>' +
      '<div class="lifestyle-dialog">' +
      '<div class="lifestyle-header"><button class="lifestyle-back" data-back="' + id + '" type="button" aria-label="Back">&#8249;</button><span class="lifestyle-title">' + esc(title) + '</span><button class="lifestyle-close" data-close="' + id + '" type="button" aria-label="Close">&times;</button></div>' +
      '<div class="lifestyle-body">' + bodyHtml + '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelector('.lifestyle-backdrop').addEventListener('click', function () { modal.remove(); });
    modal.querySelector('[data-close]').addEventListener('click', function () { modal.remove(); });
    modal.querySelector('[data-back]').addEventListener('click', function () { modal.remove(); });
    return modal;
  }

  function showLoading(container) {
    container.innerHTML = '<div class="lifestyle-loading"><img src="./images/matey-logo.png" class="ai-thinking-logo" alt="Thinking…" /><p>Analyzing…</p></div>';
  }

  function showResult(container, text) {
    var formatted = esc(text).replace(/\n/g, '<br>');
    container.innerHTML = '<div class="lifestyle-result"><pre class="lifestyle-pre">' + formatted + '</pre></div>';
  }

  function showError(container, msg) {
    container.innerHTML = '<div class="lifestyle-error">' + esc(msg) + '</div>';
  }

  function likeDislikeBtns(itemId, type) {
    return '<div class="lifestyle-actions"><button class="lifestyle-like" data-like="' + itemId + '" data-type="' + type + '">👍 Like</button><button class="lifestyle-dislike" data-like="' + itemId + '" data-type="' + type + '">👎 Dislike</button></div>';
  }

  function wireLikeDislike(container, type) {
    container.querySelectorAll('.lifestyle-like').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.dataset.like;
        var likes = store[type + 'Likes']();
        if (likes.indexOf(id) === -1) likes.push(id);
        setStorage('matey-' + type + '-likes', likes);
        this.textContent = '✓ Liked';
        this.disabled = true;
        container.querySelectorAll('.lifestyle-dislike').forEach(function (d) { d.disabled = true; });
      });
    });
    container.querySelectorAll('.lifestyle-dislike').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.dataset.like;
        var dislikes = store[type + 'Dislikes']();
        if (dislikes.indexOf(id) === -1) dislikes.push(id);
        setStorage('matey-' + type + '-dislikes', dislikes);
        this.textContent = '✓ Noted';
        this.disabled = true;
        container.querySelectorAll('.lifestyle-like').forEach(function (d) { d.disabled = true; });
      });
    });
  }

  /* ---------- Grooming ---------- */
  function openGrooming() {
    var body = '<div class="lifestyle-upload-area"><input type="file" accept="image/*" id="grooming-file" style="position:absolute;opacity:0;width:0;height:0;overflow:hidden" /><div class="lifestyle-upload-prompt" id="grooming-prompt"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg><p>Upload a selfie for face shape &amp; skin tone analysis</p><button class="lifestyle-btn" id="grooming-choose">Choose Photo</button></div><div class="lifestyle-preview" id="grooming-preview" style="display:none"><img id="grooming-img" /><button class="lifestyle-btn lifestyle-btn-secondary" id="grooming-retake">Retake</button></div></div><button class="lifestyle-btn" id="grooming-validate" style="display:none;margin-top:12px;width:100%">Validate Photo</button><div id="grooming-result" class="lifestyle-result-container"></div>';
    var modal = createModal('modal-grooming', 'Grooming Analysis', body);
    var promptEl = modal.querySelector('#grooming-prompt');
    var previewEl = modal.querySelector('#grooming-preview');
    var fileInput = modal.querySelector('#grooming-file');
    var imgEl = modal.querySelector('#grooming-img');
    var validateBtn = modal.querySelector('#grooming-validate');
    var resultEl = modal.querySelector('#grooming-result');
    var dataUrl = null;

    modal.querySelector('#grooming-choose').addEventListener('click', function () { fileInput.click(); });
    modal.querySelector('#grooming-retake').addEventListener('click', function () { dataUrl = null; promptEl.style.display = ''; previewEl.style.display = 'none'; validateBtn.style.display = 'none'; resultEl.innerHTML = ''; });

    fileInput.addEventListener('change', async function () {
      var file = this.files[0];
      if (!file) return;
      dataUrl = await readFile(file);
      imgEl.src = dataUrl;
      promptEl.style.display = 'none';
      previewEl.style.display = '';
      validateBtn.style.display = '';
    });

    validateBtn.addEventListener('click', async function () {
      if (!dataUrl) return;
      showLoading(resultEl);
      var block = dataUrlToBase64Block(dataUrl);
      if (!block) { showError(resultEl, 'Invalid image'); return; }

      var learning = buildLearningContext();
      var validatePrompt = 'You are a photo quality validator for a grooming analysis app. Analyze this selfie and determine if it is SUFFICIENT for face shape and skin tone analysis. A sufficient photo must: 1) Show the user\'s face clearly, 2) Be front-facing or show both front and side profile if possible, 3) Have good lighting without harsh shadows, 4) Not be blurry or obscured. Return ONLY JSON: { "sufficient": true/false, "reason": "brief explanation" }';

      var messages = [{ role: 'system', content: PERSONA }, { role: 'user', content: [block, { type: 'text', text: validatePrompt }] }];

      try {
        var validation = await MateyByok.chatVision(messages);
        var parsed = (function () { try { return JSON.parse(validation); } catch (e) { return null; } })();
        if (!parsed || parsed.sufficient === false) {
          resultEl.innerHTML = '<div class="lifestyle-result"><p style="color:var(--text-secondary);margin-bottom:8px;">This photo needs improvement:</p><p style="font-weight:500;">' + esc(parsed && parsed.reason ? parsed.reason : 'Please upload a clearer front-facing selfie.') + '</p><p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">Tips: Use natural light, face the camera directly, ensure your full face is visible.</p></div>';
          return;
        }

        showLoading(resultEl);
        var analysisPrompt = 'Analyze this selfie. Return ONLY JSON: { "face_shape": "oval|round|square|heart|oblong|diamond", "skin_tone": "warm-fair|cool-olive|neutral-tan|warm-deep|cool-porcelain|medium", "grooming_suggestions": ["short practical suggestion 1", "short practical suggestion 2"] } Keep suggestions specific and practical.';

        var analysisMessages = [{ role: 'system', content: PERSONA + '\n\n' + learning }, { role: 'user', content: [block, { type: 'text', text: analysisPrompt }] }];
        var analysis = await MateyByok.chatVision(analysisMessages);
        var analysisParsed = (function () { try { return JSON.parse(analysis); } catch (e) { return null; } })();

        if (analysisParsed) {
          store.saveBodyProfile({ skinTone: analysisParsed.skin_tone, faceShape: analysisParsed.face_shape });
          var html = '<div class="lifestyle-result"><div class="lifestyle-badges"><span class="lifestyle-badge">Face: ' + esc(analysisParsed.face_shape) + '</span><span class="lifestyle-badge">Skin: ' + esc(analysisParsed.skin_tone) + '</span></div>';
          if (analysisParsed.grooming_suggestions && analysisParsed.grooming_suggestions.length) {
            html += '<div class="lifestyle-suggestions-title">Grooming Suggestions</div>';
            html += '<div class="lifestyle-suggestions">';
            analysisParsed.grooming_suggestions.forEach(function (s, i) {
              html += '<div class="lifestyle-suggestion" data-id="groom-' + i + '">' + esc(s) + likeDislikeBtns('groom-' + i, 'grooming') + '</div>';
            });
            html += '</div>';
          }
          html += '</div>';
          resultEl.innerHTML = html;
          wireLikeDislike(resultEl, 'grooming');
        } else {
          showResult(resultEl, analysis);
        }
      } catch (e) { showError(resultEl, e.message || 'Analysis failed'); }
    });
  }

  /* ---------- Wardrobe ---------- */
  function openWardrobe() {
    var body = '<div class="lifestyle-tabs"><button class="lifestyle-tab active" data-tab="wardrobe-digital">My Wardrobe</button><button class="lifestyle-tab" data-tab="wardrobe-outfits">Get Outfits</button></div>' +
      '<div class="lifestyle-tab-body" id="wardrobe-digital">' +
        '<input type="file" accept="image/*" id="wardrobe-item-file" style="position:absolute;opacity:0;width:0;height:0;overflow:hidden" />' +
        '<button class="lifestyle-btn lifestyle-btn-secondary" id="wardrobe-item-choose" style="width:100%;margin-bottom:8px">📷 Add Photo</button>' +
        '<div class="lifestyle-photo-preview" id="wardrobe-photo-preview" style="display:none;">' +
          '<img id="wardrobe-item-preview" style="width:100%;max-height:180px;object-fit:cover;border-radius:12px;border:1px solid var(--border);display:block" />' +
          '<div style="display:flex;gap:8px;margin-top:8px;">' +
            '<button class="lifestyle-btn" id="wardrobe-confirm" style="flex:1">Confirm</button>' +
            '<button class="lifestyle-btn lifestyle-btn-secondary" id="wardrobe-cancel" style="flex:1">Cancel</button>' +
          '</div>' +
          '<div class="lifestyle-form" id="wardrobe-edit-form" style="display:none;margin-top:12px;">' +
            '<div class="lifestyle-field">' +
              '<label class="lifestyle-label">Detected item</label>' +
              '<input type="text" class="lifestyle-input" id="wardrobe-detected" readonly style="background:var(--surface);border:1px solid var(--border);" />' +
            '</div>' +
            '<div class="lifestyle-row" style="display:flex;gap:8px;">' +
              '<div class="lifestyle-field" style="flex:1;">' +
                '<label class="lifestyle-label">Color</label>' +
                '<input type="text" class="lifestyle-input" id="wardrobe-color" placeholder="e.g. Navy" />' +
              '</div>' +
              '<div class="lifestyle-field" style="flex:1;">' +
                '<label class="lifestyle-label">Pattern</label>' +
                '<input type="text" class="lifestyle-input" id="wardrobe-pattern" placeholder="e.g. Solid" />' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="lifestyle-wardrobe-grid" id="wardrobe-grid"></div>' +
      '</div>' +
      '<div class="lifestyle-tab-body" id="wardrobe-outfits" style="display:none">' +
        '<div class="lifestyle-form">' +
          '<div class="lifestyle-field">' +
            '<label class="lifestyle-label">Occasion</label>' +
            '<select class="lifestyle-input" id="outfit-occasion">' +
              '<option value="casual">Casual</option>' +
              '<option value="work">Work</option>' +
              '<option value="evening">Evening</option>' +
              '<option value="workout">Workout</option>' +
            '</select>' +
          '</div>' +
          '<button class="lifestyle-btn" id="outfit-generate" style="width:100%;margin-top:12px;">Generate Outfits</button>' +
        '</div>' +
        '<div id="wardrobe-outfit-result" class="lifestyle-result-container"></div>' +
      '</div>';

    var modal = createModal('modal-wardrobe', 'Wardrobe', body);
    var items = store.wardrobeItems();
    var fileInput = modal.querySelector('#wardrobe-item-file');
    var preview = modal.querySelector('#wardrobe-item-preview');
    var photoPreview = modal.querySelector('#wardrobe-photo-preview');
    var confirmBtn = modal.querySelector('#wardrobe-confirm');
    var cancelBtn = modal.querySelector('#wardrobe-cancel');
    var detectedInput = modal.querySelector('#wardrobe-detected');
    var colorInput = modal.querySelector('#wardrobe-color');
    var patternInput = modal.querySelector('#wardrobe-pattern');
    var editForm = modal.querySelector('#wardrobe-edit-form');
    var dataUrl = null;
    var detectedData = null;

    function renderGrid() {
      var grid = modal.querySelector('#wardrobe-grid');
      if (!grid) return;
      var tops = items.filter(function (x) { return x.type === 'top'; });
      var bottoms = items.filter(function (x) { return x.type === 'bottom'; });
      if (!tops.length && !bottoms.length) {
        grid.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;text-align:center;padding:16px;">No items yet. Add your first clothing item with a photo.</p>';
        return;
      }
      var html = '';
      if (tops.length) {
        html += '<div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Tops</div>' +
          '<div class="lifestyle-wardrobe-row">' +
          tops.map(function (t) {
            return '<div class="lifestyle-wardrobe-item"><img src="' + esc(t.image) + '" /><div class="lifestyle-wardrobe-name">' + esc(t.name || t.color || 'Item') + '</div></div>';
          }).join('') +
          '</div>';
      }
      if (bottoms.length) {
        html += '<div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.1em;margin:12px 0 8px;">Bottoms</div>' +
          '<div class="lifestyle-wardrobe-row">' +
          bottoms.map(function (b) {
            return '<div class="lifestyle-wardrobe-item"><img src="' + esc(b.image) + '" /><div class="lifestyle-wardrobe-name">' + esc(b.name || b.color || 'Item') + '</div></div>';
          }).join('') +
          '</div>';
      }
      grid.innerHTML = html;
    }

    modal.querySelector('#wardrobe-item-choose').addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', async function () {
      var file = this.files[0];
      if (!file) return;
      dataUrl = await readFile(file);
      preview.src = dataUrl;
      photoPreview.style.display = '';
      detectedInput.value = 'Identifying…';
      colorInput.value = '';
      patternInput.value = '';
      editForm.style.display = 'none';
      confirmBtn.textContent = 'Identifying…';
      confirmBtn.disabled = true;
      detectedData = null;

      var block = dataUrlToBase64Block(dataUrl);
      if (!block) {
        detectedInput.value = 'Unable to read image';
        confirmBtn.textContent = 'Save';
        confirmBtn.disabled = false;
        return;
      }

      var messages = [{
        role: 'user',
        content: [
          block,
          { type: 'text', text: 'Identify the clothing item in this photo. Return ONLY JSON: { "type": "top|bottom", "name": "auto-generated label like Navy Solid T-Shirt", "color": "Primary color", "pattern": "Pattern type like Solid, Striped, etc" }' }
        ]
      }];

      try {
        var text = await MateyByok.chatVision(messages);
        var parsed = (function () { try { return JSON.parse(text); } catch (e) { return null; } })();
        if (parsed) {
          detectedData = parsed;
          detectedInput.value = parsed.name || parsed.type || 'Item';
          colorInput.value = parsed.color || '';
          patternInput.value = parsed.pattern || '';
          editForm.style.display = '';
          confirmBtn.textContent = 'Save Item';
          confirmBtn.disabled = false;
        } else {
          detectedInput.value = 'Could not identify — edit manually';
          editForm.style.display = '';
          confirmBtn.textContent = 'Save Item';
          confirmBtn.disabled = false;
        }
      } catch (e) {
        detectedInput.value = 'AI identification failed — edit manually';
        editForm.style.display = '';
        confirmBtn.textContent = 'Save Item';
        confirmBtn.disabled = false;
      }
    });

    cancelBtn.addEventListener('click', function () {
      dataUrl = null;
      detectedData = null;
      photoPreview.style.display = 'none';
      preview.src = '';
      fileInput.value = '';
      detectedInput.value = '';
      colorInput.value = '';
      patternInput.value = '';
      editForm.style.display = 'none';
      confirmBtn.textContent = 'Save Item';
      confirmBtn.disabled = false;
    });

    confirmBtn.addEventListener('click', function () {
      if (!dataUrl) return;
      var itemType = (detectedData && detectedData.type) || (detectedInput.value ? 'top' : 'top');
      var itemName = detectedInput.value.trim() || 'Item';
      var itemColor = colorInput.value.trim() || '';
      var itemPattern = patternInput.value.trim() || '';
      items.push({
        id: Date.now(),
        type: itemType,
        name: itemName,
        image: dataUrl,
        color: itemColor,
        pattern: itemPattern,
        tags: []
      });
      store.saveWardrobeItems(items);
      dataUrl = null;
      detectedData = null;
      photoPreview.style.display = 'none';
      preview.src = '';
      fileInput.value = '';
      detectedInput.value = '';
      colorInput.value = '';
      patternInput.value = '';
      editForm.style.display = 'none';
      confirmBtn.textContent = 'Save Item';
      confirmBtn.disabled = false;
      renderGrid();
    });

    modal.querySelectorAll('.lifestyle-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        modal.querySelectorAll('.lifestyle-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var target = tab.dataset.tab;
        modal.querySelectorAll('.lifestyle-tab-body').forEach(function (b) { b.style.display = 'none'; });
        modal.querySelector('#' + target).style.display = '';
      });
    });

    modal.querySelector('#outfit-generate').addEventListener('click', async function () {
      var occasion = modal.querySelector('#outfit-occasion').value;
      var resultEl = modal.querySelector('#wardrobe-outfit-result');
      if (items.length < 2) { showError(resultEl, 'Add at least 2 items (tops and bottoms) to generate outfits.'); return; }
      showLoading(resultEl);
      var bp = store.bodyProfile();
      var tops = items.filter(function (x) { return x.type === 'top'; });
      var bottoms = items.filter(function (x) { return x.type === 'bottom'; });
      var wardrobeDesc = tops.map(function (t) { return t.name + ' (' + t.color + ', ' + t.pattern + ')'; }).join('\n') + '\n' + bottoms.map(function (b) { return b.name + ' (' + b.color + ', ' + b.pattern + ')'; }).join('\n');
      var context = buildLearningContext() + '\n\n# User Body Profile\n- Skin tone: ' + (bp.skinTone || 'unknown') + '\n- Face shape: ' + (bp.faceShape || 'unknown') + '\n- Height: ' + (bp.height || 'unknown') + '\n- Weight: ' + (bp.weight || 'unknown') + '\n- Body type: ' + (bp.bodyType || 'unknown') + '\n\n# Available Wardrobe\n' + wardrobeDesc + '\n\n# Occasion\n' + occasion + '\n\n# Rules\nSuggest 3-5 complete outfit combinations (one top + one bottom). Work with what is actually in the wardrobe — suggest good combinations from existing items, don\'t block on having "enough" items. Return ONLY JSON array with objects: { "name": string, "top": string, "bottom": string, "why": string }';
      var messages = [{ role: 'system', content: PERSONA }, { role: 'user', content: [{ type: 'text', text: context }] }];
      try {
        var text = await MateyByok.chat(messages);
        var outfits = (function () { try { return JSON.parse(text); } catch (e) { return null; } })();
        if (outfits && Array.isArray(outfits)) {
          var html = '<div class="lifestyle-suggestions">';
          outfits.forEach(function (o, i) {
            html += '<div class="lifestyle-suggestion" data-id="outfit-' + i + '"><strong>' + esc(o.name || 'Outfit ' + (i + 1)) + '</strong><div class="lifestyle-sub">' + esc(o.top) + ' + ' + esc(o.bottom) + '</div><div class="lifestyle-body">' + esc(o.why) + '</div>' + likeDislikeBtns('outfit-' + i, 'wardrobe') + '</div>';
          });
          html += '</div>';
          resultEl.innerHTML = html;
          wireLikeDislike(resultEl, 'wardrobe');
        } else {
          showResult(resultEl, text);
        }
      } catch (e) { showError(resultEl, e.message || 'Outfit generation failed'); }
    });

    renderGrid();
  }

  /* ---------- Culinary ---------- */
  function openCulinary() {
    var body = '<div class="lifestyle-tab-body" id="culinary-recipe"><div class="lifestyle-form"><div class="lifestyle-field"><label class="lifestyle-label">Cuisines you like</label><input type="text" class="lifestyle-input" id="cuisine-prefs" placeholder="e.g. Lebanese, Indian, Italian" /></div><textarea class="lifestyle-input" id="recipe-ingredients" placeholder="List your ingredients, e.g. chicken, rice, tomatoes, labneh…" rows="4"></textarea><button class="lifestyle-btn" id="recipe-generate" style="margin-top:16px;width:100%">Get Recipes</button></div></div>' +
      '<div id="culinary-result" class="lifestyle-result-container"></div>';
    var modal = createModal('modal-culinary', 'Culinary', body);
    var resultEl = modal.querySelector('#culinary-result');
    var prefs = store.culinaryPrefs();

    /* No mic button on Culinary inputs — user preference */
    modal.querySelector('#cuisine-prefs').value = prefs.cuisines || '';

    modal.querySelectorAll('.lifestyle-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        modal.querySelectorAll('.lifestyle-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var target = tab.dataset.tab;
        modal.querySelectorAll('.lifestyle-tab-body').forEach(function (b) { b.style.display = 'none'; });
        modal.querySelector('#' + target).style.display = '';
        resultEl.innerHTML = '';
      });
    });

    modal.querySelector('#recipe-generate').addEventListener('click', async function () {
      var ingredients = modal.querySelector('#recipe-ingredients').value.trim();
      var cuisines = modal.querySelector('#cuisine-prefs').value.trim();
      if (window.mateyCoach) mateyCoach.evaluate(ingredients); // app-wide prompt coaching
      if (!ingredients) { showError(resultEl, 'Please enter some ingredients'); return; }
      store.saveCulinaryPrefs({ cuisines: cuisines });
      showLoading(resultEl);
      var learning = buildLearningContext();
      var context = 'Ingredients: ' + ingredients;
      if (cuisines) context += '\nPreferred cuisines: ' + cuisines;
      var messages = [{ role: 'system', content: PERSONA + '\n\n' + learning }, { role: 'user', content: [{ type: 'text', text: context + '\n\nSuggest recipes organized by cuisine blocks. For each cuisine, provide 3-5 complete recipes. Each recipe must include: name, description, ingredients_used (from the provided ingredients), and step-by-step cooking instructions.\n\nReturn ONLY a JSON object with this structure:\n{\n  "cuisines": [\n    {\n      "cuisine_name": "Italian",\n      "recipes": [\n        { "name": "Recipe Name", "description": "Brief description", "ingredients_used": ["ingredient1", "ingredient2"], "steps": ["Step 1", "Step 2", "Step 3"] }\n      ]\n    }\n  ]\n}\n\nProvide 3-5 cuisine blocks, each with 3-5 fully defined recipes.' }] }];
      try {
        var text = await MateyByok.chat(messages);
        var data = (function () { try { return JSON.parse(text); } catch (e) { return null; } })();
        if (data && data.cuisines && Array.isArray(data.cuisines)) {
          var html = '<div class="lifestyle-suggestions">';
          data.cuisines.forEach(function (cuisine) {
            var cuisineName = esc(cuisine.cuisine_name || 'Cuisine');
            html += '<div class="lifestyle-cuisine-block" style="margin-bottom:24px;border:1px solid var(--app-border,#2A2A2A);border-radius:12px;padding:16px;background:rgba(255,255,255,0.02);">';
            html += '<h4 style="margin:0 0 12px 0;font-size:16px;color:var(--app-accent,#B583FC);">🍽 ' + cuisineName + '</h4>';
            if (cuisine.recipes && cuisine.recipes.length) {
              cuisine.recipes.forEach(function (r, i) {
                var stepsHtml = '';
                if (r.steps && r.steps.length) {
                  stepsHtml = '<div class="lifestyle-steps"><strong>Steps</strong><ol>' +
                    r.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
                  '</ol></div>';
                }
                html += '<div class="lifestyle-suggestion" data-id="recipe-' + i + '" style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.05);"><strong>' + esc(r.name || 'Recipe ' + (i + 1)) + '</strong><div class="lifestyle-sub">' + esc(r.description || '') + '</div><div class="lifestyle-body"><strong>Uses:</strong> ' + esc((r.ingredients_used || []).join(', ')) + '</div>' + stepsHtml + likeDislikeBtns('recipe-' + i, 'culinary') + '</div>';
              });
            }
            html += '</div>';
          });
          html += '</div>';
          resultEl.innerHTML = html;
          wireLikeDislike(resultEl, 'culinary');
        } else if (data && Array.isArray(data)) {
          // Fallback for old flat format
          var html = '<div class="lifestyle-suggestions">';
          data.forEach(function (r, i) {
            var stepsHtml = '';
            if (r.steps && r.steps.length) {
              stepsHtml = '<div class="lifestyle-steps"><strong>Steps</strong><ol>' +
                r.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
              '</ol></div>';
            }
            html += '<div class="lifestyle-suggestion" data-id="recipe-' + i + '"><strong>' + esc(r.name || 'Recipe ' + (i + 1)) + '</strong><div class="lifestyle-sub">' + esc(r.description || '') + '</div><div class="lifestyle-body"><strong>Uses:</strong> ' + esc((r.ingredients_used || []).join(', ')) + '</div>' + stepsHtml + likeDislikeBtns('recipe-' + i, 'culinary') + '</div>';
          });
          html += '</div>';
          resultEl.innerHTML = html;
          wireLikeDislike(resultEl, 'culinary');
        } else {
          showResult(resultEl, text);
        }
      } catch (e) { showError(resultEl, e.message || 'Recipe generation failed'); }
    });
  }

  /* ---------- Living (Spatial Living Restyler) ---------- */
  function openLiving() {
    var body = '<div class="lifestyle-form">' +
      '<div class="lifestyle-field">' +
        '<label class="lifestyle-label">Room Type</label>' +
        '<select class="lifestyle-input" id="living-type">' +
          '<option value="living-room">Living Room</option>' +
          '<option value="bedroom">Bedroom</option>' +
          '<option value="office">Home Office</option>' +
          '<option value="kitchen">Kitchen</option>' +
          '<option value="bathroom">Bathroom</option>' +
          '<option value="open">Open Plan</option>' +
        '</select>' +
      '</div>' +
      '<div class="lifestyle-field">' +
        '<label class="lifestyle-label">Room Dimensions (L x W)</label>' +
        '<input type="text" class="lifestyle-input" id="living-dims" placeholder="e.g. 12 x 10 ft" />' +
      '</div>' +
      '<div class="lifestyle-field">' +
        '<label class="lifestyle-label">Notable Features</label>' +
        '<input type="text" class="lifestyle-input" id="living-features" placeholder="e.g. large east window, fireplace, two doors" />' +
      '</div>' +
      '<div class="lifestyle-field">' +
        '<label class="lifestyle-label">Primary Activities</label>' +
        '<input type="text" class="lifestyle-input" id="living-activities" placeholder="e.g. work from home, watch TV, read" />' +
      '</div>' +
      '<div class="lifestyle-field">' +
        '<label class="lifestyle-label">Photo (optional)</label>' +
        '<input type="file" accept="image/*" id="living-file" style="display:none" />' +
        '<button class="lifestyle-btn lifestyle-btn-secondary" id="living-choose" style="width:100%;margin-bottom:8px">Choose Photo</button>' +
        '<img id="living-img" style="display:none;width:100%;max-height:180px;object-fit:cover;border-radius:12px;border:1px solid var(--border);margin-bottom:12px" />' +
      '</div>' +
      '<button class="lifestyle-btn" id="living-analyze" style="margin-top:12px;width:100%">Generate Layout Options</button>' +
      '</div>' +
      '<div id="living-result" class="lifestyle-result-container"></div>';

    var modal = createModal('modal-living', 'Spatial Living Restyler', body);
    var resultEl = modal.querySelector('#living-result');
    var dataUrl = null;
    var fileInput = modal.querySelector('#living-file');
    var imgEl = modal.querySelector('#living-img');

    modal.querySelector('#living-choose').addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', async function () {
      var file = this.files[0];
      if (!file) return;
      dataUrl = await readFile(file);
      imgEl.src = dataUrl;
      imgEl.style.display = '';
    });

    modal.querySelector('#living-analyze').addEventListener('click', async function () {
      var roomType = modal.querySelector('#living-type').value;
      var dims = modal.querySelector('#living-dims').value.trim();
      var features = modal.querySelector('#living-features').value.trim();
      var activities = modal.querySelector('#living-activities').value.trim();

      if (!roomType) { showError(resultEl, 'Please specify a room type.'); return; }

      showLoading(resultEl);

      var context = '# Spatial Living Analysis Request\n' +
        '- Room type: ' + roomType + '\n' +
        (dims ? '- Dimensions: ' + dims + '\n' : '') +
        (features ? '- Notable features: ' + features + '\n' : '') +
        (activities ? '- Primary activities: ' + activities + '\n' : '');

      var prompt = 'You are a spatial design restyler. Given a room description, provide THE SINGLE BEST furniture layout recommendation with 3-5 specific, actionable move instructions and a brief rationale. Consider traffic flow, natural light, and practical use.';

      if (dataUrl) {
        var block = dataUrlToBase64Block(dataUrl);
        if (block) {
          try {
            var messages = [{ type: 'text', text: context + '\n' + prompt }, block];
            if (window.MateyByok && typeof MateyByok.chatVision === 'function') {
              var analysis = await MateyByok.chatVision([{ role: 'user', content: messages }]);
              showResult(resultEl, analysis);
            } else {
              showError(resultEl, 'AI provider not configured.');
            }
          } catch (e) { showError(resultEl, e.message || 'Analysis failed'); }
        } else {
          showError(resultEl, 'Invalid image.');
        }
      } else {
        try {
          var messages2 = [{ role: 'system', content: PERSONA }, { role: 'user', content: [{ type: 'text', text: context + '\n' + prompt }] }];
          if (window.MateyByok && typeof MateyByok.chat === 'function') {
            var analysis2 = await MateyByok.chat(messages2);
            showResult(resultEl, analysis2);
          } else {
            /* Fallback: basic layout suggestion */
            showResult(resultEl, generateBasicLayout(roomType, dims, features, activities));
          }
        } catch (e) { showError(resultEl, e.message || 'Analysis failed'); }
      }
    });

    function generateBasicLayout(type, dims, features, activities) {
      var layouts = {
        'living-room': 'Open-concept layout: Place sofa facing the largest window for natural light. Add a coffee table 18" from seating. Floating TV stand on the longest wall. Keep 36" clearance around all paths.',
        'bedroom': 'Focal-point layout: Bed centered on the longest wall, nightstands on each side. Dresser opposite the bed. Keep 30" clearance around. Add a reading chair near any window.',
        'office': 'Workstation-first: Desk facing the door or window. Chair with 24" depth clearance. Floating shelves above for storage. Add a small lounge chair for breaks.',
        'kitchen': 'Work-triangle: Prioritize sink-stove-refrigerator triangle. Ensure 42" between counters. Add rolling cart for extra prep space. Task lighting over each zone.',
        'bathroom': 'Vertical flow: Toilet, sink, shower, bath in sequence. Maximize vertical storage. Non-slip mat near shower. Keep 30" clearance for doors.',
        'open': 'Zone-based: Define areas with furniture rugs. Living zone around TV, dining zone central, kitchen workflow separate. Maintain 42" traffic lanes.'
      };
      var output = '# Spatial Living Layout — ' + type.replace(/-/g, ' ').toUpperCase() + '\n\n';
      output += (dims ? '**Dimensions:** ' + dims + '\n\n' : '');
      if (features) output += '**Features:** ' + features + '\n\n';
      if (activities) output += '**Activities:** ' + activities + '\n\n';
      output += '**Recommended Layout:**\n' + (layouts[type] || layouts['living-room']);
      if (features) output += '\n\n**Feature Integration:** Position furniture to take advantage of ' + features + '.';
      if (activities) output += '\n\n**Activity Zones:** Organize space to support: ' + activities + '.';
      return output;
    }
  }

  /* ---------- Lifestyle Beat ---------- */
  function openLiving() {
    var body = '<div class="lifestyle-upload-area"><input type="file" accept="image/*" id="living-file" style="position:absolute;opacity:0;width:0;height:0;overflow:hidden" /><div class="lifestyle-upload-prompt" id="living-prompt"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l6-6 4 4 8-8"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/></svg><p>Upload a photo of your space — entrance, far-end, left side, right side (4 views)</p><button class="lifestyle-btn" id="living-choose">Choose Photo</button></div><div class="lifestyle-preview" id="living-preview" style="display:none"><img id="living-img" /><button class="lifestyle-btn lifestyle-btn-secondary" id="living-retake">Retake</button></div></div><button class="lifestyle-btn" id="living-analyze" style="display:none;margin-top:12px;width:100%">Analyze Space</button><div id="living-result" class="lifestyle-result-container"></div>';
    var modal = createModal('modal-living', 'Spatial Room Restyler', body);
    var resultEl = modal.querySelector('#living-result');
    var dataUrl = null;

    modal.querySelector('#living-choose').addEventListener('click', function () { document.getElementById('living-file').click(); });
    modal.querySelector('#living-retake').addEventListener('click', function () { dataUrl = null; document.getElementById('living-prompt').style.display = ''; document.getElementById('living-preview').style.display = 'none'; document.getElementById('living-analyze').style.display = 'none'; resultEl.innerHTML = ''; });

    document.getElementById('living-file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        dataUrl = ev.target.result;
        document.getElementById('living-img').src = dataUrl;
        document.getElementById('living-prompt').style.display = 'none';
        document.getElementById('living-preview').style.display = '';
        document.getElementById('living-analyze').style.display = '';
      };
      reader.readAsDataURL(file);
    });

    modal.querySelector('#living-analyze').addEventListener('click', async function () {
      if (!dataUrl) return;
      if (window.MateyBeat && MateyBeat.analyze) {
        showLoading(resultEl);
        try {
          var result = await MateyBeat.analyze([dataUrl]);
          if (typeof result === 'string') {
            resultEl.innerHTML = '<div class="lifestyle-result"><pre class="lifestyle-pre">' + esc(result).replace(/\n/g, '<br>') + '</pre></div>';
          } else {
            var html = '<div class="lifestyle-result"><div class="lifestyle-badges"><span class="lifestyle-badge">Type: ' + esc(result.living_type || 'Detected') + '</span></div>';
            if (result.moves && result.moves.length) {
              html += '<div class="lifestyle-suggestions-title">Layout Moves</div><div class="lifestyle-suggestions">' + result.moves.map(function (m) { return '<div class="lifestyle-suggestion">' + esc(m) + '</div>'; }).join('') + '</div>';
            }
            if (result.why) html += '<div style="font-size:13px;color:var(--text-secondary);margin-top:8px;">' + esc(result.why) + '</div>';
            html += '</div>';
            resultEl.innerHTML = html;
          }
        } catch (e) { showError(resultEl, e.message || 'Analysis failed'); }
      } else {
        showLoading(resultEl);
        setTimeout(function () {
          showResult(resultEl, 'Living analysis needs your AI key set up under Settings → Custom.');
        }, 500);
      }
    });
  }

  /* ---------- Lifestyle Beat ---------- */
  function openLifestyle() {
    var body = '<div class="lifestyle-form"><div class="lifestyle-field"><label class="lifestyle-label">Period</label><select class="lifestyle-input" id="beat-period"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div><div class="lifestyle-row"><div class="lifestyle-field"><label class="lifestyle-label">Meals Cooked</label><input type="number" class="lifestyle-input" id="beat-meals" value="0" /></div><div class="lifestyle-field"><label class="lifestyle-label">Outfits Worn</label><input type="number" class="lifestyle-input" id="beat-outfits" value="0" /></div></div><div class="lifestyle-row"><div class="lifestyle-field"><label class="lifestyle-label">Discoveries</label><input type="number" class="lifestyle-input" id="beat-discoveries" value="0" /></div><div class="lifestyle-field"><label class="lifestyle-label">Kitchen Events</label><input type="number" class="lifestyle-input" id="beat-kitchen" value="0" /></div></div><div class="lifestyle-field"><label class="lifestyle-label">Weather</label><input type="text" class="lifestyle-input" id="beat-weather" placeholder="e.g., Hot, 38C, sunny" /></div><button class="lifestyle-btn" id="beat-generate" style="margin-top:12px;width:100%">Generate Beat</button></div><div id="lifestyle-result" class="lifestyle-result-container"></div>';
    var modal = createModal('modal-lifestyle', 'Lifestyle Beat', body);
    var resultEl = modal.querySelector('#lifestyle-result');

    modal.querySelector('#beat-generate').addEventListener('click', async function () {
      var period = modal.querySelector('#beat-period').value;
      var meals = parseInt(modal.querySelector('#beat-meals').value) || 0;
      var outfits = parseInt(modal.querySelector('#beat-outfits').value) || 0;
      var discoveries = parseInt(modal.querySelector('#beat-discoveries').value) || 0;
      var kitchen = parseInt(modal.querySelector('#beat-kitchen').value) || 0;
      var weather = modal.querySelector('#beat-weather').value.trim();
      showLoading(resultEl);
      var learning = buildLearningContext();
      var context = 'Period: ' + period + '\n- Stats: meals cooked=' + meals + ', outfits worn=' + outfits + ', discoveries=' + discoveries + ', kitchen events=' + kitchen + (weather ? '\n- Weather: ' + weather : '');
      var messages = [{ role: 'system', content: PERSONA + '\n\n' + learning }, { role: 'user', content: [{ type: 'text', text: 'Write my ' + period + ' Beat now.\n\n' + context }] }];
      try {
        var text = await MateyByok.chat(messages);
        showResult(resultEl, text);
      } catch (e) { showError(resultEl, e.message || 'Beat generation failed'); }
    });
  }

  /* ---------- wiring ---------- */
  function wire() {
    document.addEventListener('click', function (e) {
      var item = e.target.closest('.category-item');
      if (!item) return;
      var name = item.querySelector('.category-name');
      if (!name) return;
      var cat = name.textContent.trim();
      if (cat === 'Grooming') openGrooming();
      else if (cat === 'Wardrobe') openWardrobe();
      else if (cat === 'Culinary') openCulinary();
      else if (cat === 'Living') openLiving();
      else if (cat === 'Lifestyle') openLifestyle();
    });
  }

  window.MateyLifestyle = { wire: wire };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();

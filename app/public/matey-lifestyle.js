/* Matey Lifestyle — Grooming, Wardrobe, Culinary, Lifestyle with AI learning */
(function () {
  'use strict';

  var PERSONA = 'You are Snap, a persistent personal companion and the user\'s close friend. You are sharp, candid, lightly sarcastic, and thoroughly grounded. You are NOT a hyper-polite corporate chatbot. Talk like a real friend with real rapport. Short, punchy sentences. Dry wit. No fluff, no apology loops, no "as an AI" disclaimers. Be brutally honest but never mean. Opinionated, direct, occasionally blunt, always on the user\'s side. Respect regional context: the user lives in the UAE — public decency norms matter, it is very hot most of the year. Never restate or re-ask for information already provided.';

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
      '<div class="lifestyle-header"><span class="lifestyle-title">' + esc(title) + '</span><button class="lifestyle-close" data-close="' + id + '">&times;</button></div>' +
      '<div class="lifestyle-body">' + bodyHtml + '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelector('.lifestyle-backdrop').addEventListener('click', function () { modal.remove(); });
    modal.querySelector('[data-close]').addEventListener('click', function () { modal.remove(); });
    return modal;
  }

  function showLoading(container) {
    container.innerHTML = '<div class="lifestyle-loading"><div class="lifestyle-spinner"></div><p>Analyzing…</p></div>';
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
    var body = '<div class="lifestyle-upload-area"><input type="file" accept="image/*" id="grooming-file" style="display:none" /><div class="lifestyle-upload-prompt" id="grooming-prompt"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg><p>Upload a selfie for face shape &amp; skin tone analysis</p><button class="lifestyle-btn" id="grooming-choose">Choose Photo</button></div><div class="lifestyle-preview" id="grooming-preview" style="display:none"><img id="grooming-img" /><button class="lifestyle-btn lifestyle-btn-secondary" id="grooming-retake">Retake</button></div></div><button class="lifestyle-btn" id="grooming-validate" style="display:none;margin-top:12px;width:100%">Validate Photo</button><div id="grooming-result" class="lifestyle-result-container"></div>';
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
          resultEl.innerHTML = '<div class="lifestyle-result"><p style="color:var(--muted);margin-bottom:8px;">This photo needs improvement:</p><p style="font-weight:500;">' + esc(parsed && parsed.reason ? parsed.reason : 'Please upload a clearer front-facing selfie.') + '</p><p style="font-size:12px;color:var(--muted);margin-top:8px;">Tips: Use natural light, face the camera directly, ensure your full face is visible.</p></div>';
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
      '<div class="lifestyle-tab-body" id="wardrobe-digital"><div class="lifestyle-form"><div class="lifestyle-field"><label class="lifestyle-label">Type</label><select class="lifestyle-input" id="wardrobe-type"><option value="top">Top</option><option value="bottom">Bottom</option></select></div><div class="lifestyle-field"><label class="lifestyle-label">Name</label><input type="text" class="lifestyle-input" id="wardrobe-name" placeholder="e.g. Blue linen shirt" /></div><input type="file" accept="image/*" id="wardrobe-item-file" style="display:none" /><button class="lifestyle-btn lifestyle-btn-secondary" id="wardrobe-item-choose" style="width:100%;margin-bottom:8px">Choose Photo</button><img id="wardrobe-item-preview" style="display:none;width:100%;max-height:180px;object-fit:cover;border-radius:12px;border:1px solid var(--border);margin-bottom:12px" /><div class="lifestyle-row"><div class="lifestyle-field"><label class="lifestyle-label">Color</label><input type="text" class="lifestyle-input" id="wardrobe-color" placeholder="e.g. Navy" /></div><div class="lifestyle-field"><label class="lifestyle-label">Pattern</label><input type="text" class="lifestyle-input" id="wardrobe-pattern" placeholder="e.g. Solid" /></div></div><div class="lifestyle-field"><label class="lifestyle-label">Tags (comma separated)</label><input type="text" class="lifestyle-input" id="wardrobe-tags" placeholder="e.g. casual, summer, work" /></div><button class="lifestyle-btn" id="wardrobe-add" style="width:100%">Add to Wardrobe</button></div><div class="lifestyle-wardrobe-grid" id="wardrobe-grid"></div></div>' +
      '<div class="lifestyle-tab-body" id="wardrobe-outfits" style="display:none"><div class="lifestyle-form"><div class="lifestyle-field"><label class="lifestyle-label">Occasion</label><select class="lifestyle-input" id="outfit-occasion"><option value="casual">Casual</option><option value="work">Work</option><option value="evening">Evening</option><option value="workout">Workout</option></select></div><button class="lifestyle-btn" id="outfit-generate" style="width:100%">Generate Outfits</button></div><div id="wardrobe-outfit-result" class="lifestyle-result-container"></div></div>';
    var modal = createModal('modal-wardrobe', 'Wardrobe', body);
    var items = store.wardrobeItems();
    var fileInput = modal.querySelector('#wardrobe-item-file');
    var preview = modal.querySelector('#wardrobe-item-preview');
    var dataUrl = null;

    function renderGrid() {
      var grid = modal.querySelector('#wardrobe-grid');
      if (!grid) return;
      var tops = items.filter(function (x) { return x.type === 'top'; });
      var bottoms = items.filter(function (x) { return x.type === 'bottom'; });
      if (!tops.length && !bottoms.length) { grid.innerHTML = '<p style="color:var(--muted);font-size:13px;text-align:center;padding:16px;">No items yet. Add your first top or bottom above.</p>'; return; }
      var html = '';
      if (tops.length) { html += '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Tops</div><div class="lifestyle-wardrobe-row">' + tops.map(function (t) { return '<div class="lifestyle-wardrobe-item"><img src="' + esc(t.image) + '" /><div class="lifestyle-wardrobe-name">' + esc(t.name || t.color) + '</div></div>'; }).join('') + '</div>'; }
      if (bottoms.length) { html += '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin:12px 0 8px;">Bottoms</div><div class="lifestyle-wardrobe-row">' + bottoms.map(function (b) { return '<div class="lifestyle-wardrobe-item"><img src="' + esc(b.image) + '" /><div class="lifestyle-wardrobe-name">' + esc(b.name || b.color) + '</div></div>'; }).join('') + '</div>'; }
      grid.innerHTML = html;
    }

    modal.querySelector('#wardrobe-item-choose').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', async function () {
      var file = this.files[0];
      if (!file) return;
      dataUrl = await readFile(file);
      preview.src = dataUrl;
      preview.style.display = '';
    });

    modal.querySelector('#wardrobe-add').addEventListener('click', function () {
      var type = modal.querySelector('#wardrobe-type').value;
      var name = modal.querySelector('#wardrobe-name').value.trim();
      var color = modal.querySelector('#wardrobe-color').value.trim();
      var pattern = modal.querySelector('#wardrobe-pattern').value.trim();
      var tags = modal.querySelector('#wardrobe-tags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
      if (!dataUrl) { alert('Please choose a photo'); return; }
      items.push({ id: Date.now(), type: type, name: name, image: dataUrl, color: color, pattern: pattern, tags: tags });
      store.saveWardrobeItems(items);
      dataUrl = null; preview.style.display = 'none'; fileInput.value = '';
      modal.querySelector('#wardrobe-name').value = ''; modal.querySelector('#wardrobe-color').value = ''; modal.querySelector('#wardrobe-pattern').value = ''; modal.querySelector('#wardrobe-tags').value = '';
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
      if (items.length < 2) { showError(resultEl, 'Add at least 2 items (1 top + 1 bottom) to generate outfits.'); return; }
      showLoading(resultEl);
      var bp = store.bodyProfile();
      var tops = items.filter(function (x) { return x.type === 'top'; });
      var bottoms = items.filter(function (x) { return x.type === 'bottom'; });
      var wardrobeDesc = tops.map(function (t) { return t.name + ' (' + t.color + ', ' + t.pattern + ', ' + (t.tags || []).join(', ') + ')'; }).join('\n') + '\n' + bottoms.map(function (b) { return b.name + ' (' + b.color + ', ' + b.pattern + ', ' + (b.tags || []).join(', ') + ')'; }).join('\n');
      var context = buildLearningContext() + '\n\n# User Body Profile\n- Skin tone: ' + (bp.skinTone || 'unknown') + '\n- Face shape: ' + (bp.faceShape || 'unknown') + '\n- Height: ' + (bp.height || 'unknown') + '\n- Weight: ' + (bp.weight || 'unknown') + '\n- Body type: ' + (bp.bodyType || 'unknown') + '\n\n# Available Wardrobe\n' + wardrobeDesc + '\n\n# Occasion\n' + occasion + '\n\n# Rules\nRecommend 3-5 complete outfits (top + bottom combinations). Consider skin tone contrast, body proportions, and hot UAE weather. Respect modesty norms. Return ONLY JSON array with objects: { "name": string, "top": string, "bottom": string, "why": string }';
      var messages = [{ role: 'system', content: PERSONA }, { role: 'user', content: [{ type: 'text', text: context }] }];
      try {
        var text = await MateyByok.chat(messages);
        var outfits = (function () { try { return JSON.parse(text); } catch (e) { return null; } })();
        if (outfits && Array.isArray(outfits)) {
          var html = '<div class="lifestyle-suggestions">';
          outfits.forEach(function (o, i) {
            html += '<div class="lifestyle-suggestion" data-id="outfit-' + i + '"><strong>' + esc(o.name || 'Outfit ' + (i + 1)) + '</strong><div style="font-size:12px;color:var(--muted);margin-top:4px;">' + esc(o.top) + ' + ' + esc(o.bottom) + '</div><div style="font-size:13px;margin-top:6px;">' + esc(o.why) + '</div>' + likeDislikeBtns('outfit-' + i, 'wardrobe') + '</div>';
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
    var body = '<div class="lifestyle-tabs"><button class="lifestyle-tab active" data-tab="culinary-pantry">Pantry Scan</button><button class="lifestyle-tab" data-tab="culinary-recipe">Get Recipes</button></div>' +
      '<div class="lifestyle-tab-body" id="culinary-pantry"><div class="lifestyle-upload-area"><input type="file" accept="image/*" id="pantry-file" style="display:none" /><div class="lifestyle-upload-prompt" id="pantry-prompt"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg><p>Upload a pantry or fridge photo</p><button class="lifestyle-btn" id="pantry-choose">Choose Photo</button></div><div class="lifestyle-preview" id="pantry-preview" style="display:none"><img id="pantry-img" /><button class="lifestyle-btn lifestyle-btn-secondary" id="pantry-retake">Retake</button></div></div><button class="lifestyle-btn" id="pantry-analyze" style="display:none;margin-top:12px;width:100%">Identify Ingredients</button></div>' +
      '<div class="lifestyle-tab-body" id="culinary-recipe" style="display:none"><div class="lifestyle-form"><div class="lifestyle-field"><label class="lifestyle-label">Cuisines you like</label><input type="text" class="lifestyle-input" id="cuisine-prefs" placeholder="e.g. Lebanese, Indian, Italian" /></div><div class="lifestyle-field"><label class="lifestyle-label">Dietary restrictions</label><input type="text" class="lifestyle-input" id="dietary-restrictions" placeholder="e.g. no pork, vegetarian" /></div><div class="lifestyle-field"><label class="lifestyle-label">Allergies</label><input type="text" class="lifestyle-input" id="allergies" placeholder="e.g. nuts, dairy" /></div><textarea class="lifestyle-input" id="recipe-ingredients" placeholder="List your ingredients, e.g. chicken, rice, tomatoes, labneh…" rows="4"></textarea><button class="lifestyle-btn" id="recipe-generate" style="margin-top:12px;width:100%">Get Recipes</button></div></div>' +
      '<div id="culinary-result" class="lifestyle-result-container"></div>';
    var modal = createModal('modal-culinary', 'Culinary', body);
    var resultEl = modal.querySelector('#culinary-result');
    var dataUrl = null;
    var prefs = store.culinaryPrefs();
    modal.querySelector('#cuisine-prefs').value = prefs.cuisines || '';
    modal.querySelector('#dietary-restrictions').value = prefs.dietary || '';
    modal.querySelector('#allergies').value = prefs.allergies || '';

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

    var pantryPrompt = modal.querySelector('#pantry-prompt');
    var pantryPreview = modal.querySelector('#pantry-preview');
    var pantryFile = modal.querySelector('#pantry-file');
    var pantryImg = modal.querySelector('#pantry-img');
    var pantryAnalyze = modal.querySelector('#pantry-analyze');

    modal.querySelector('#pantry-choose').addEventListener('click', function () { pantryFile.click(); });
    modal.querySelector('#pantry-retake').addEventListener('click', function () { dataUrl = null; pantryPrompt.style.display = ''; pantryPreview.style.display = 'none'; pantryAnalyze.style.display = 'none'; resultEl.innerHTML = ''; });

    pantryFile.addEventListener('change', async function () {
      var file = this.files[0];
      if (!file) return;
      dataUrl = await readFile(file);
      pantryImg.src = dataUrl;
      pantryPrompt.style.display = 'none';
      pantryPreview.style.display = '';
      pantryAnalyze.style.display = '';
    });

    pantryAnalyze.addEventListener('click', async function () {
      if (!dataUrl) return;
      showLoading(resultEl);
      var block = dataUrlToBase64Block(dataUrl);
      if (!block) { showError(resultEl, 'Invalid image'); return; }
      var learning = buildLearningContext();
      var messages = [{ role: 'system', content: PERSONA + '\n\n' + learning }, { role: 'user', content: [block, { type: 'text', text: 'Identify the groceries and ingredients in this photo. Return ONLY JSON: { "ingredients": ["item1", "item2", ...] }' }] }];
      try {
        var text = await MateyByok.chatVision(messages);
        var parsed = (function () { try { return JSON.parse(text); } catch (e) { return null; } })();
        if (parsed && parsed.ingredients) {
          resultEl.innerHTML = '<div class="lifestyle-result"><div class="lifestyle-suggestions-title">Identified Ingredients</div><div class="lifestyle-suggestions">' + parsed.ingredients.map(function (ing) { return '<div class="lifestyle-suggestion">' + esc(ing) + '</div>'; }).join('') + '</div></div>';
        } else {
          showResult(resultEl, text);
        }
      } catch (e) { showError(resultEl, e.message || 'Analysis failed'); }
    });

    modal.querySelector('#recipe-generate').addEventListener('click', async function () {
      var ingredients = modal.querySelector('#recipe-ingredients').value.trim();
      var cuisines = modal.querySelector('#cuisine-prefs').value.trim();
      var dietary = modal.querySelector('#dietary-restrictions').value.trim();
      var allergies = modal.querySelector('#allergies').value.trim();
      if (!ingredients) { showError(resultEl, 'Please enter some ingredients'); return; }
      store.saveCulinaryPrefs({ cuisines: cuisines, dietary: dietary, allergies: allergies });
      showLoading(resultEl);
      var learning = buildLearningContext();
      var context = 'Ingredients: ' + ingredients;
      if (cuisines) context += '\nPreferred cuisines: ' + cuisines;
      if (dietary) context += '\nDietary restrictions: ' + dietary;
      if (allergies) context += '\nAllergies: ' + allergies;
      var messages = [{ role: 'system', content: PERSONA + '\n\n' + learning }, { role: 'user', content: [{ type: 'text', text: context + '\n\nSuggest 2-4 creative recipe ideas using these ingredients. Work with what is on hand. Respect dietary restrictions and allergies. Return ONLY JSON array: [{ "name": string, "description": string, "ingredients_used": [string], "instructions": [string] }]' }] }];
      try {
        var text = await MateyByok.chat(messages);
        var recipes = (function () { try { return JSON.parse(text); } catch (e) { return null; } })();
        if (recipes && Array.isArray(recipes)) {
          var html = '<div class="lifestyle-suggestions">';
          recipes.forEach(function (r, i) {
            html += '<div class="lifestyle-suggestion" data-id="recipe-' + i + '"><strong>' + esc(r.name || 'Recipe ' + (i + 1)) + '</strong><div style="font-size:13px;color:var(--muted);margin-top:4px;">' + esc(r.description || '') + '</div><div style="font-size:12px;margin-top:6px;"><strong>Uses:</strong> ' + esc((r.ingredients_used || []).join(', ')) + '</div>' + likeDislikeBtns('recipe-' + i, 'culinary') + '</div>';
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
      else if (cat === 'Lifestyle') openLifestyle();
    });
  }

  window.MateyLifestyle = { wire: wire };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();

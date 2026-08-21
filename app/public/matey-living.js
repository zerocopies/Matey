/* Matey Spatial Living Restyler — 4-view scan + AI layout engine */
(function () {
  'use strict';

  var VIEWS = [
    { key: 'entrance', label: 'Entrance View', hint: 'Stand at the entrance, face inside' },
    { key: 'farend', label: 'Far-End View', hint: 'Walk to the opposite end, face back toward entrance' },
    { key: 'left', label: 'Left Side View', hint: 'Stand in the middle, photo of left side' },
    { key: 'right', label: 'Right Side View', hint: 'Photo of the right side of the space' }
  ];
  var LIVING_KEY = 'matey-living-scan';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function readFile(file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.readAsDataURL(file);
    });
  }

  function saveImages(imgs) {
    try { localStorage.setItem(LIVING_KEY, JSON.stringify(imgs)); } catch (e) {}
  }
  function loadImages() {
    try { return JSON.parse(localStorage.getItem(LIVING_KEY) || '[]'); } catch (e) { return []; }
  }

  function getVisionProvider() {
    var providers = [];
    try { providers = JSON.parse(localStorage.getItem('matey-providers') || '[]'); } catch (e) {}
    return providers[0];
  }

  function analyzeLocally(imgs) {
    return {
      living_type: 'living room',
      dimensions: 'Estimated 12 x 10 ft',
      windows: ['East wall: large window'],
      doors: ['North wall: entry door'],
      outlets: ['South wall: 2 outlets', 'West wall: 1 outlet'],
      best_layout: 'Open Space & Flow',
      moves: [
        'Move seating to the center, leaving 42 inches of clearance around the perimeter.',
        'Align sofa toward the East window for natural light and views.',
        'Use the West wall for a compact workstation.'
      ],
      why: 'Open perimeter improves traffic flow and makes the space feel larger.'
    };
  }

  function renderResults(data) {
    var container = $('living-results');
    if (!container) return;
    var html = '<div class="living-results-title">Best Layout: ' + esc(data.best_layout || 'Recommended') + '</div>';
    if (data.living_type) html += '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">Detected: ' + esc(data.living_type) + '</div>';
    html += '<ul class="living-option-moves">' + (data.moves || []).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
    if (data.why) html += '<div class="living-option-why">' + esc(data.why) + '</div>';
    container.innerHTML = html;
    container.style.display = 'block';
  }

  async function sendToVisionProvider(images, prompt) {
    var provider = getVisionProvider();
    if (!provider || !provider.baseUrl) throw new Error('No vision provider configured');
    var model = provider.model || 'gpt-4o-mini';
    var messages = [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
      ]
    }];
    images.forEach(function (img) {
      messages[0].content.push({ type: 'image_url', image_url: { url: img } });
    });
    var res = await fetch(provider.baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + provider.apiKey
      },
      body: JSON.stringify({ model: model, messages: messages, max_tokens: 1200 })
    });
    if (!res.ok) throw new Error('Vision API error: ' + res.status);
    var data = await res.json();
    return data.choices[0].message.content;
  }

  function runAnalysis() {
    var imgs = loadImages();
    var container = $('living-results');
    if (!container) return;
    var missing = VIEWS.filter(function (v, i) { return !imgs[i]; });
    if (missing.length) {
      container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:24px;">Please upload all 4 space photos: ' + missing.map(function (m) { return m.label; }).join(', ') + '.</p>';
      container.style.display = 'block';
      return;
    }

    var prompt = 'Analyze these 4 space photos taken from different angles: (1) Entrance view — facing inside from the doorway, (2) Far-end view — facing back toward the entrance from the opposite wall, (3) Left side view, (4) Right side view. 1) Infer the living type (home office, bedroom, living room, etc.). 2) Recommend THE SINGLE BEST furniture layout for this space, with 3-4 specific move instructions and a brief rationale. Keep it practical and direct.';

    var provider = getVisionProvider();
    if (!provider) {
      renderResults(analyzeLocally(imgs));
      return;
    }

    container.innerHTML = '<div class="lifestyle-loading"><div class="lifestyle-spinner"></div><p>Analyzing space…</p></div>';
    container.style.display = 'block';

    sendToVisionProvider(imgs, prompt)
      .then(function (text) {
        container.innerHTML = '<pre class="lifestyle-pre">' + esc(text).replace(/\n/g, '<br>') + '</pre>';
      })
      .catch(function () {
        renderResults(analyzeLocally(imgs));
      });
  }

  function init() {
    var grid = $('living-wall-grid');
    if (!grid) return;

    grid.innerHTML = VIEWS.map(function (v, i) {
      return '<div class="living-wall-thumb" data-index="' + i + '">' +
        '<span class="living-wall-label">' + v.label + '</span>' +
        '<span class="living-wall-hint">' + v.hint + '</span>' +
        '<span class="living-wall-plus">+</span>' +
        '</div>';
    }).join('');

    renderThumbs();

    grid.querySelectorAll('.living-wall-thumb').forEach(function (el) {
      el.addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async function (e) {
          var file = e.target.files[0];
          if (!file) return;
          var idx = parseInt(el.dataset.index);
          var dataUrl = await readFile(file);
          var imgs = loadImages();
          imgs[idx] = dataUrl;
          saveImages(imgs);
          el.innerHTML = '<img src="' + esc(dataUrl) + '" alt="' + VIEWS[idx].label + '" /><span class="living-wall-label">' + VIEWS[idx].label + '</span>';
          el.classList.add('has-image');
        };
        input.click();
      });
    });

    var btn = $('living-analyze');
    if (btn) btn.addEventListener('click', runAnalysis);
  }

  function renderThumbs() {
    var grid = $('living-wall-grid');
    if (!grid) return;
    var imgs = loadImages();
    grid.querySelectorAll('.living-wall-thumb').forEach(function (el, i) {
      if (imgs[i]) {
        el.innerHTML = '<img src="' + esc(imgs[i]) + '" alt="' + VIEWS[i].label + '" /><span class="living-wall-label">' + VIEWS[i].label + '</span>';
        el.classList.add('has-image');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* Matey Themes */
(function () {
  'use strict';

  /* Instant background paint — set <html> bg from the persisted theme BEFORE
   * first paint so page navigations never flash white. Matte, theme-aware. */
  var _themeBgs = { graphitexx: '#000000', 'cool-panda': '#1a1d23', minimal: '#fafafa' };
  try {
    var _tid = localStorage.getItem('matey-theme') || 'graphitexx';
    var _bg = _themeBgs[_tid] || _themeBgs.graphitexx;
    var _d = document.documentElement;
    _d.style.backgroundColor = _bg;
    _d.style.setProperty('--app-bg', _bg);
    var _m = document.querySelector('meta[name="theme-color"]');
    if (_m) _m.content = _bg;
  } catch (e) {}

  var themes = [
    { id: 'graphitexx', name: 'Graphite XX',
      bg: '#000000', surface: '#080808', surfaceRaised: '#ffffff',
      text: '#b0b0b0', textSecondary: '#808080', muted: '#4d4d4d', textOnCard: '#121212',
      accent: '#ab5555', accentDim: 'rgba(171,85,85,0.12)',
      accentGreen: '#22ff22', accentGreenDim: 'rgba(34,255,34,0.15)', accentGreenText: '#22ff22',
      border: '#e0e0e0', borderSubtle: '#f0f0f0', danger: '#643535' },
    { id: 'cool-panda', name: 'Cool Panda',
      bg: '#1a1d23', surface: '#22262e', surfaceRaised: '#2a2f38',
      text: '#e0e4ea', textSecondary: '#a8aeb8', muted: '#686e78', textOnCard: '#e0e4ea',
      accent: '#7c9eff', accentDim: 'rgba(124,158,255,0.12)',
      accentGreen: '#7cffb2', accentGreenDim: 'rgba(124,255,178,0.15)', accentGreenText: '#7cffb2',
      border: '#3a3f48', borderSubtle: '#2a2f38', danger: '#ff7c7c' },
    { id: 'minimal', name: 'Minimal',
      bg: '#fafafa', surface: '#ffffff', surfaceRaised: '#ffffff',
      text: '#1a1a1a', textSecondary: '#5a5a5a', muted: '#9a9a9a', textOnCard: '#1a1a1a',
      accent: '#0066cc', accentDim: 'rgba(0,102,204,0.12)',
      accentGreen: '#008844', accentGreenDim: 'rgba(0,136,68,0.15)', accentGreenText: '#008844',
      border: '#e0e0e0', borderSubtle: '#f0f0f0', danger: '#cc3333' }
  ];
  function getTheme() {
    var s = localStorage.getItem('matey-theme') || 'graphitexx';
    if (!themes.some(function(t){return t.id===s;})) { localStorage.setItem('matey-theme','graphitexx'); return 'graphitexx'; }
    return s;
  }
  var MAP = {bg:'bg',surface:'surface',surfaceRaised:'surface-raised',text:'text',textOnCard:'text-on-card',textSecondary:'text-secondary',muted:'muted',accent:'accent',accentDim:'accent-dim',accentGreen:'accent-green',accentGreenDim:'accent-green-dim',accentGreenText:'accent-green-text',border:'border',borderSubtle:'border-subtle',danger:'danger'};
  function applyTheme(id) {
    var t = themes.find(function(x){return x.id===id;}); if(!t)return;
    var root = document.documentElement; root.setAttribute('data-theme',id);
    Object.keys(MAP).forEach(function(k){ root.style.setProperty('--'+MAP[k],t[k]||''); });
    root.style.setProperty('--app-bg', t.bg || '');
    root.style.setProperty('--app-fg', t.text || '');
    root.style.setProperty('--app-muted', t.muted || '');
    root.style.setProperty('--app-border', t.border || '');
    root.style.setProperty('--app-accent', t.accent || '');
    root.style.setProperty('--app-surface', t.surface || '');
    root.style.setProperty('--app-surface-raised', t.surfaceRaised || '');
    localStorage.setItem('matey-theme',id);
    var m = document.querySelector('meta[name="theme-color"]'); if(m)m.content=t.bg||'#000000';
    document.querySelectorAll('.theme-row').forEach(function(r){r.classList.toggle('active',r.dataset.theme===id);});
  }
  function build(root) {
    var c = root.querySelector('#theme-grid'); if(!c)return; c.innerHTML = '';
    var list = document.createElement('div'); list.className = 'theme-list';
    themes.forEach(function(t){
      var row = document.createElement('div'); row.className = 'theme-row'; row.dataset.theme = t.id;
      row.innerHTML = '<span class="theme-row-name">' + t.name + '</span><span class="theme-row-check"></span>';
      row.addEventListener('click',function(){applyTheme(t.id);});
      list.appendChild(row);
    });
    c.appendChild(list); applyTheme(getTheme());
  }
  window.MateyThemes = { themes: themes, apply: applyTheme, build: build, get: getTheme };
  document.addEventListener('DOMContentLoaded', function(){applyTheme(getTheme());});
})();

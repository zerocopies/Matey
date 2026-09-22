/* Matey Themes */
(function () {
  'use strict';

  /* Instant background paint — set <html> bg from the persisted theme BEFORE
   * first paint so page navigations never flash white. OLED pitch-black,
   * theme-independent (all themes resolve to the same OLED palette). */
  var _themeBgs = { graphitexx: '#000000', 'cool-panda': '#000000', minimal: '#000000' };
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
      bg: '#000000', surface: '#121216', surfaceRaised: '#141416',
      text: '#E8E8E8', textSecondary: '#9A9A9A', muted: '#8A8A92', textOnCard: '#E8E8E8',
      accent: '#8B5CF6', accentDim: 'rgba(139,92,246,0.12)',
      accentGreen: '#34D399', accentGreenDim: 'rgba(52,211,153,0.12)', accentGreenText: '#34D399',
      border: '#1a1a22', borderSubtle: '#1c1c24', danger: '#F87171' },
    { id: 'cool-panda', name: 'Cool Panda',
      bg: '#000000', surface: '#121216', surfaceRaised: '#141416',
      text: '#E8E8E8', textSecondary: '#9A9A9A', muted: '#8A8A92', textOnCard: '#E8E8E8',
      accent: '#8B5CF6', accentDim: 'rgba(139,92,246,0.12)',
      accentGreen: '#34D399', accentGreenDim: 'rgba(52,211,153,0.12)', accentGreenText: '#34D399',
      border: '#1a1a22', borderSubtle: '#1c1c24', danger: '#F87171' },
    { id: 'minimal', name: 'Minimal',
      bg: '#000000', surface: '#121216', surfaceRaised: '#141416',
      text: '#E8E8E8', textSecondary: '#9A9A9A', muted: '#8A8A92', textOnCard: '#E8E8E8',
      accent: '#8B5CF6', accentDim: 'rgba(139,92,246,0.12)',
      accentGreen: '#34D399', accentGreenDim: 'rgba(52,211,153,0.12)', accentGreenText: '#34D399',
      border: '#1a1a22', borderSubtle: '#1c1c24', danger: '#F87171' }
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

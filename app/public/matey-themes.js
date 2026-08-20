/* Matey Themes */
(function () {
  'use strict';
  var themes = [
    { id: 'default', name: 'Matey Dark',
      bg: '#000000', surface: '#0a0a0a', surfaceRaised: '#111111',
      text: '#f0f0f0', textSecondary: '#b0b0b0', muted: '#6b6b6b',
      accent: '#f5c542', accentDim: 'rgba(245,197,66,0.12)',
      accentGreen: '#7aa2f7', accentGreenDim: 'rgba(122,162,247,0.12)', accentGreenText: '#7aa2f7',
      border: '#1c1c1c', borderSubtle: '#141414', danger: '#f87171' },
    { id: 'metal-rose', name: 'Metal Rose',
      bg: '#0a0806', surface: '#100e0c', surfaceRaised: '#181512',
      text: '#e8d5c4', textSecondary: '#b09888', muted: '#6b6058',
      accent: '#c28325', accentDim: 'rgba(194,131,37,0.12)',
      accentGreen: '#c28325', accentGreenDim: 'rgba(194,131,37,0.12)', accentGreenText: '#c28325',
      border: '#1e1a16', borderSubtle: '#161310', danger: '#d94f5c' },
    { id: 'graphitexx', name: 'GraphiteXX',
      bg: '#000000', surface: '#080808', surfaceRaised: '#0e0e0e',
      text: '#b0b0b0', textSecondary: '#808080', muted: '#4d4d4d',
      accent: '#ab5555', accentDim: 'rgba(171,85,85,0.12)',
      accentGreen: '#ab5555', accentGreenDim: 'rgba(171,85,85,0.12)', accentGreenText: '#ab5555',
      border: '#1c1c1c', borderSubtle: '#141414', danger: '#643535' },
    { id: 'dark-death', name: 'Dark Death',
      bg: '#000000', surface: '#060606', surfaceRaised: '#0c0c0c',
      text: '#e0e0e0', textSecondary: '#a0a0a0', muted: '#555558',
      accent: '#0cbd79', accentDim: 'rgba(12,189,121,0.12)',
      accentGreen: '#0cbd79', accentGreenDim: 'rgba(12,189,121,0.12)', accentGreenText: '#0cbd79',
      border: '#18181a', borderSubtle: '#101012', danger: '#ee5d43' },
    { id: 'nixdorf-8870', name: 'Nixdorf 8870',
      bg: '#080400', surface: '#0c0800', surfaceRaised: '#140e00',
      text: '#FFBF00', textSecondary: '#b8860b', muted: '#8a6a00',
      accent: '#FFBF00', accentDim: 'rgba(255,191,0,0.12)',
      accentGreen: '#FFBF00', accentGreenDim: 'rgba(255,191,0,0.12)', accentGreenText: '#FFBF00',
      border: '#1c1400', borderSubtle: '#120c00', danger: '#ff4444' },
    { id: 'code-green', name: 'Code Green',
      bg: '#0a0f0e', surface: '#0c1412', surfaceRaised: '#141c1a',
      text: '#b8e6d8', textSecondary: '#7db8a7', muted: '#3d7065',
      accent: '#2caf93', accentDim: 'rgba(44,175,147,0.12)',
      accentGreen: '#2caf93', accentGreenDim: 'rgba(44,175,147,0.12)', accentGreenText: '#2caf93',
      border: '#162420', borderSubtle: '#101a16', danger: '#f14c4c' }
  ];
  function getTheme() {
    var s = localStorage.getItem('matey-theme') || 'default';
    if (!themes.some(function(t){return t.id===s;})) { localStorage.setItem('matey-theme','default'); return 'default'; }
    return s;
  }
  var MAP = {bg:'bg',surface:'surface',surfaceRaised:'surface-raised',text:'text',textSecondary:'text-secondary',muted:'muted',accent:'accent',accentDim:'accent-dim',accentGreen:'accent-green',accentGreenDim:'accent-green-dim',accentGreenText:'accent-green-text',border:'border',borderSubtle:'border-subtle',danger:'danger'};
  function applyTheme(id) {
    var t = themes.find(function(x){return x.id===id;}); if(!t)return;
    var root = document.documentElement; root.setAttribute('data-theme',id);
    Object.keys(MAP).forEach(function(k){ root.style.setProperty('--'+MAP[k],t[k]||''); });
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
  window.MateyThemes = window.SnapThemes = { themes: themes, apply: applyTheme, build: build, get: getTheme };
  document.addEventListener('DOMContentLoaded', function(){applyTheme(getTheme());});
})();

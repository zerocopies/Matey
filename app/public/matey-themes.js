/* Matey Themes */
(function () {
  'use strict';
  var themes = [
    { id: 'default', name: 'Matey Dark',
      bg: '#000000', surface: '#0a0a0a', surfaceRaised: '#ffffff',
      text: '#ffffff', textSecondary: '#b0b0b0', muted: '#6b6b6b', textOnCard: '#121212',
      accent: '#f5c542', accentDim: 'rgba(245,197,66,0.12)',
      accentGreen: '#22c55e', accentGreenDim: 'rgba(34,197,94,0.12)', accentGreenText: '#22c55e',
      border: '#e0e0e0', borderSubtle: '#f0f0f0', danger: '#f87171' },
    { id: 'metal-rose', name: 'Metal Rose',
      bg: '#0a0806', surface: '#100e0c', surfaceRaised: '#ffffff',
      text: '#e8d5c4', textSecondary: '#b09888', muted: '#6b6058', textOnCard: '#121212',
      accent: '#c28325', accentDim: 'rgba(194,131,37,0.12)',
      accentGreen: '#22c55e', accentGreenDim: 'rgba(34,197,94,0.12)', accentGreenText: '#22c55e',
      border: '#d4c2a8', borderSubtle: '#e0d0b8', danger: '#d94f5c' },
    { id: 'graphitexx', name: 'GraphiteXX',
      bg: '#000000', surface: '#080808', surfaceRaised: '#ffffff',
      text: '#b0b0b0', textSecondary: '#808080', muted: '#4d4d4d', textOnCard: '#121212',
      accent: '#ab5555', accentDim: 'rgba(171,85,85,0.12)',
      accentGreen: '#22c55e', accentGreenDim: 'rgba(34,197,94,0.12)', accentGreenText: '#22c55e',
      border: '#e0e0e0', borderSubtle: '#f0f0f0', danger: '#643535' },
    { id: 'dark-death', name: 'Dark Death',
      bg: '#000000', surface: '#060606', surfaceRaised: '#ffffff',
      text: '#e0e0e0', textSecondary: '#a0a0a0', muted: '#555558', textOnCard: '#121212',
      accent: '#0cbd79', accentDim: 'rgba(12,189,121,0.12)',
      accentGreen: '#0cbd79', accentGreenDim: 'rgba(12,189,121,0.12)', accentGreenText: '#0cbd79',
      border: '#e0e0e0', borderSubtle: '#f0f0f0', danger: '#ee5d43' },
    { id: 'nixdorf-8870', name: 'Nixdorf 8870',
      bg: '#080400', surface: '#0c0800', surfaceRaised: '#ffffff',
      text: '#FFBF00', textSecondary: '#b8860b', muted: '#8a6a00', textOnCard: '#8a6a00',
      accent: '#FFBF00', accentDim: 'rgba(255,191,0,0.12)',
      accentGreen: '#22c55e', accentGreenDim: 'rgba(34,197,94,0.12)', accentGreenText: '#22c55e',
      border: '#d4b878', borderSubtle: '#e0c890', danger: '#ff4444' },
    { id: 'code-green', name: 'Code Green',
      bg: '#0a0f0e', surface: '#0c1412', surfaceRaised: '#ffffff',
      text: '#b8e6d8', textSecondary: '#7db8a7', muted: '#3d7065', textOnCard: '#121212',
      accent: '#2caf93', accentDim: 'rgba(44,175,147,0.12)',
      accentGreen: '#22c55e', accentGreenDim: 'rgba(34,197,94,0.12)', accentGreenText: '#22c55e',
      border: '#a0b8ab', borderSubtle: '#b0c8b7', danger: '#f14c4c' }
  ];
  function getTheme() {
    var s = localStorage.getItem('matey-theme') || 'default';
    if (!themes.some(function(t){return t.id===s;})) { localStorage.setItem('matey-theme','default'); return 'default'; }
    return s;
  }
  var MAP = {bg:'bg',surface:'surface',surfaceRaised:'surface-raised',text:'text',textOnCard:'text-on-card',textSecondary:'text-secondary',muted:'muted',accent:'accent',accentDim:'accent-dim',accentGreen:'accent-green',accentGreenDim:'accent-green-dim',accentGreenText:'accent-green-text',border:'border',borderSubtle:'border-subtle',danger:'danger'};
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

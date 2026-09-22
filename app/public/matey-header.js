/* Matey Header & Tab Bar — Centralized Injection
 * Builds the app header + tab bar with consistent structure, icons, and labels
 * across all pages. Replaces static markup in HTML files.
 */
(function () {
  'use strict';

  var TAB_ORDER = ['lifestyle', 'vots', 'journal', 'editor', 'agent'];
  var TAB_URLS = {
    'lifestyle': './lifestyle.html',
    'vots': './vots.html',
    'journal': './journal.html',
    'editor': './raw-editor.html',
    'agent': './preview.html#agent'
  };
  var TAB_LABELS = {
    'lifestyle': 'LIFESTYLE',
    'vots': 'MY VOTS',
    'journal': 'JOURNAL',
    'editor': 'EDITOR',
    'agent': 'AGENT'
  };
var TAB_ICONS = {
    'lifestyle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>',
    'vots': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"></path><path d="M8 10h8M8 14h5"></path></svg>',
    'journal': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="2" width="8" height="8" rx="1" transform="rotate(45 10 2)"/><rect x="6" y="14" width="8" height="8" rx="1" transform="rotate(45 6 14)"/><rect x="2" y="10" width="8" height="8" rx="1" transform="rotate(45 2 10)"/><rect x="14" y="14" width="8" height="8" rx="1" transform="rotate(45 14 14)"/></svg>',
    'editor': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8"/><path d="M6 2H4a2 2 0 0 0-2 2v2"/><path d="M22 4v2a2 2 0 0 1-2 2h-2"/><path d="M10 2h4"/><path d="m8 13 2 2 2-2"/><path d="M8 7v2"/></svg>',
    'agent': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-4z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-4z"/><circle cx="12" cy="12" r="2"/><path d="m8 13 2 2 6-6-2-2"/></svg>'
  };

  function tabUrl(id) { return TAB_URLS[id] || '#'; }
  function tabLabel(id) { return TAB_LABELS[id] || id; }
  function tabIcon(id) { return TAB_ICONS[id] || ''; }

  function detectActive() {
    var path = window.location.pathname.replace(/\/$/, ''), hash = window.location.hash || '';
    if (path === '' || path === '/index.html' || path.indexOf('lifestyle') !== -1) return 'lifestyle';
    if (path.indexOf('vots') !== -1) return 'vots';
    if (path.indexOf('raw-editor') !== -1) return 'editor';
    if (path.indexOf('journal') !== -1) return 'journal';
    if (hash === '#agent' || path.indexOf('preview') !== -1 || path.indexOf('agent') !== -1) return 'agent';
    return 'lifestyle';
  }

  function buildHeader() {
    var activeTab = detectActive();
    var badgeText = 'EDITOR'; // Consistent badge text
    return (
      '<header class="header">' +
        '<div class="header-left">' +
          '<img src="images/matey-logo.png" class="matey-logo" alt="Matey" />' +
          '<button id="workspace-folder-btn" class="header-icon-btn workspace-plug-box" title="Select Workspace" aria-label="Select Workspace">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M9 9h6"></path><path d="M9 13h6"></path></svg>' +
          '</button>' +
          '<button class="header-icon-btn ide-text-badge" type="button" title="EDITOR" aria-label="EDITOR">EDITOR</button>' +
        '</div>' +
        '<div class="header-actions">' +
          '<div class="status-circle" title="Token Meter"></div>' +
          '<button class="header-icon-btn" type="button" title="Incognito" aria-label="Incognito">' +
            '<svg viewBox="0 0 100 120" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M50 4 C20 4 5 28 5 52 L5 92 C5 105 15 105 20 98 C25 105 35 105 40 98 C45 105 55 105 60 98 C65 105 75 105 80 98 C85 105 95 105 95 92 L95 52 C95 28 80 4 50 4 Z"></path>' +
              '<ellipse cx="35" cy="50" rx="10" ry="15"></ellipse>' +
              '<ellipse cx="65" cy="50" rx="10" ry="15"></ellipse>' +
              '<path d="M26 34 L38 40"></path>' +
              '<path d="M74 34 L62 40"></path>' +
              '<path d="M38 78 Q50 94 62 78 Q50 88 38 78 Z"></path>' +
              '<path d="M40 80 L43 85 L46 80 L49 85 L52 80 L55 85 L58 80 L60 82"></path>' +
            '</svg>' +
          '</button>' +
          '<button class="header-icon-btn burger-menu-btn" type="button" title="Menu" aria-label="Menu">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<line x1="4" y1="6" x2="20" y2="6"></line>' +
              '<line x1="4" y1="12" x2="20" y2="12"></line>' +
              '<line x1="4" y1="18" x2="20" y2="18"></line>' +
            '</svg>' +
          '</button>' +
        '</div>' +
      '</header>'
    );
  }

  function buildTabs() {
    var activeTab = detectActive();
    var html = '<nav class="tabs-wrap" id="tabs-wrap"><div class="tabs">';
    TAB_ORDER.forEach(function (id) {
      var isActive = id === detectActive();
      html += '<a class="tab' + (isActive ? ' active' : '') + '" href="' + tabUrl(id) + '" data-tab="' + id + '"' + (isActive ? ' aria-current="page"' : '') + '>' +
        tabIcon(id) +
        '<span>' + tabLabel(id) + '</span>' +
      '</a>';
    });
    html += '</div></nav>';
    return html;
  }

  function injectHeaderAndTabs() {
    var appShell = document.querySelector('.app-shell');
    if (!appShell) return;

    // Remove any existing header and tabs-wrap
    var existingHeader = appShell.querySelector('header.header');
    var existingTabs = appShell.querySelector('.tabs-wrap');
    if (existingHeader) existingHeader.remove();
    if (existingTabs) existingTabs.remove();

    // Inject header and tabs at the beginning of app-shell
    var headerHtml = buildHeader();
    var tabsHtml = buildTabs();
    appShell.insertAdjacentHTML('afterbegin', headerHtml + tabsHtml);
  }

  // Run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHeaderAndTabs);
  } else {
    injectHeaderAndTabs();
  }

  window.MateyHeader = {
    inject: injectHeaderAndTabs,
    detectActive: detectActive
  };
})();

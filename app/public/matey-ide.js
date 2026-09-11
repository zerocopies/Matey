import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { HighlightStyle, syntaxHighlighting, bracketMatching, defaultHighlightStyle, language } from '@codemirror/language';
import { keymap, highlightActiveLine, highlightActiveLineGutter, lineNumbers } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

import { readFile, writeFile } from './matey-fs-module.js';
import { AgentOrchestrator } from './matey-agent.js';
import { diffField, addDiffEffect, clearDiffEffect } from './matey-diff.js';
import { ASTIndexClient as ASTIndex } from './matey-ast-client.js';
import { zedThemeFromObject, zedThemeFromJsonString, applyGlobalZedTheme, clearGlobalZedTheme, convertZedThemeToCodeMirror } from './matey-zed-theme-bridge.js';

const BINARY_REGEX = /[\x00-\x08\x0E-\x1F\x7F]/;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/* Native dark theme — replaces @codemirror/theme-one-dark which fails
 * to import correctly through Vite (bundles to a 2D-array shape that
 * trips CodeMirror's extension validator). Hand-written using the
 * same color values as the canonical oneDark theme. */
const oneDarkTheme = EditorView.theme({
  '&': {
    color: '#abb2bf',
    backgroundColor: '#282c34',
    height: '100%',
  },
  '.cm-scroller': {
    backgroundColor: '#282c34',
    color: '#abb2bf',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    lineHeight: '1.5',
  },
  '.cm-content': { color: '#abb2bf', caretColor: '#528bff', fontFamily: 'inherit' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#528bff' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: '#3e4451' },
  '.cm-activeLine': { backgroundColor: '#2c313a' },
  '.cm-activeLineGutter': { backgroundColor: '#2c313a', color: '#7d8590' },
  '.cm-gutters': { backgroundColor: '#282c34', color: '#7d8590', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { color: '#7d8590' },
}, { dark: true });

const oneDarkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#c678dd' },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: '#e06c75' },
  { tag: [t.function(t.variableName), t.labelName], color: '#61afef' },
  { tag: [t.typeName, t.namespace], color: '#e5c07b' },
  { tag: [t.operator, t.punctuation, t.bracket], color: '#abb2bf' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#98c379' },
  { tag: [t.number, t.bool, t.atom], color: '#d19a66' },
  { tag: [t.variableName, t.className], color: '#e06c75' },
  { tag: [t.comment, t.docComment, t.blockComment, t.lineComment], color: '#7f848e', fontStyle: 'italic' },
  { tag: t.meta, color: '#61afef' },
  { tag: t.invalid, color: '#ffffff' },
]);

const oneDark = [oneDarkTheme, syntaxHighlighting(oneDarkHighlightStyle)];

const floatingActionStyle = `
  .matey-floating-diff-bar {
    position: fixed;
    z-index: 2000;
    display: flex;
    align-items: center;
    gap: 4px;
    background: #1e1e1e;
    border: 1px solid #404040;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    font-family: monospace;
    box-shadow: 0 4px 16px rgba(0,0,0,0.45);
    max-width: 420px;
  }
  .matey-floating-diff-bar button {
    background: #4f46e5;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    height: 22px;
  }
  .matey-floating-diff-bar button.reject {
    background: #7f1d1d;
  }
  .matey-floating-diff-bar .diff-preview {
    color: #a3a3a3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 260px;
  }
  .matey-floating-diff-bar .diff-label {
    color: #6b7280;
    margin-right: 4px;
    font-size: 10px;
  }
`;

function injectFloatingActionStyle() {
  if (document.getElementById('matey-floating-diff-bar-style')) return;
  const styleEl = document.createElement('style');
  styleEl.id = 'matey-floating-diff-bar-style';
  styleEl.textContent = floatingActionStyle;
  document.head.appendChild(styleEl);
}

export class MateyIDE {
  constructor(containerId, provider) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('[MateyIDE] Container not found:', containerId);
      return;
    }
    this.activeFilePath = null;
    this.isDirty = false;
    this.isReadOnly = false;
    this.fileSize = 0;
    this.agent = new AgentOrchestrator(provider);
    this.languageCompartment = new Compartment();
    this.readOnlyCompartment = new Compartment();
    this.themeCompartment = new Compartment();
    this.currentDiff = null;
    this.useFallback = false;
    this.elFallbackTextarea = null;

    injectFloatingActionStyle();
    this.initHeaderUI();
    this.initEditor();
    this.initGlobalShortcuts();
  }

  initHeaderUI() {
    const headerHTML = `
      <div id="ide-header" style="display:flex;align-items:center;justify-content:space-between;background:var(--app-header-bg, #0D0D0D);border-bottom:1px solid var(--app-border, #262626);padding:8px 12px;font-family:sans-serif;font-size:13px;color:var(--app-fg, #e5e5e5);min-height:41px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;gap:8px;overflow:hidden;min-width:0;flex:1;">
          <span id="ide-lang-badge" style="background:#312e81;color:#a5b4fc;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;white-space:nowrap;">TXT</span>
          <span id="ide-file-path" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--app-muted, #a3a3a3);font-family:monospace;min-width:0;flex:1;">No file open</span>
          <span id="ide-dirty-dot" style="display:none;color:#f59e0b;font-size:14px;line-height:1;white-space:nowrap;">\u25CF</span>
          <span id="ide-theme-label" title="Active editor theme" style="font-size:10px;color:var(--app-muted, #6b6b6b);white-space:nowrap;"></span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;position:relative;">
          <button id="ide-btn-theme" title="Pick editor theme" style="background:var(--app-surface, #262626);color:var(--app-fg, #d4d4d4);border:1px solid var(--app-border, #404040);border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;">Theme\u2026</button>
          <div id="ide-theme-menu" style="display:none;position:absolute;top:100%;right:0;margin-top:4px;background:var(--app-surface, #1a1a1a);border:1px solid var(--app-border, #404040);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.55);padding:4px 0;z-index:9999;max-height:60vh;overflow-y:auto;min-width:220px;"></div>
          <button id="ide-btn-theme-reset" title="Revert to default theme" style="background:transparent;color:var(--app-muted, #9ca3af);border:1px solid var(--app-border, #404040);border-radius:4px;padding:4px 6px;font-size:11px;cursor:pointer;display:none;">\u2715</button>
          <input type="file" id="ide-theme-file" accept="*" style="display:none" />
          <button id="ide-btn-save" title="Save (Cmd+S)" style="background:var(--app-accent, #4f46e5);color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;">Save</button>
          <button id="ide-btn-saveas" title="Save As" style="background:var(--app-surface, #262626);color:var(--app-fg, #d4d4d4);border:1px solid var(--app-border, #404040);border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;">Save As</button>
          <button id="ide-btn-delete" title="Delete file" style="background:transparent;color:#ef4444;border:1px solid #7f1d1d;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;">Delete</button>
        </div>
      </div>
      <div id="editor-cm-target" style="flex:1;min-height:0;overflow:hidden;"></div>
    `;
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.innerHTML = headerHTML;

    this.elFilePath = document.getElementById('ide-file-path');
    this.elDirtyDot = document.getElementById('ide-dirty-dot');
    this.elLangBadge = document.getElementById('ide-lang-badge');
    this.elEditorTarget = document.getElementById('editor-cm-target');
    this.elThemeLabel = document.getElementById('ide-theme-label');
    this.elThemeFile = document.getElementById('ide-theme-file');
    this.elBtnTheme = document.getElementById('ide-btn-theme');
    this.elBtnThemeReset = document.getElementById('ide-btn-theme-reset');
    this.elThemeMenu = document.getElementById('ide-theme-menu');

    this.elBtnSave = document.getElementById('ide-btn-save');
    this.elBtnSaveAs = document.getElementById('ide-btn-saveas');
    this.elBtnDelete = document.getElementById('ide-btn-delete');

    this.elBtnSave.addEventListener('click', () => this.saveFile());
    this.elBtnSaveAs.addEventListener('click', () => this.saveFileAs());
    this.elBtnDelete.addEventListener('click', () => this.deleteCurrentFile());
    this.elBtnTheme.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleThemeMenu();
    });
    this.elBtnThemeReset.addEventListener('click', () => this.resetTheme());
    this.elThemeFile.addEventListener('change', (e) => this.handleThemeFileChosen(e));
    document.addEventListener('click', (e) => {
      if (this.elThemeMenu && this.elThemeMenu.style.display !== 'none' &&
          !this.elThemeMenu.contains(e.target) && e.target !== this.elBtnTheme) {
        this.elThemeMenu.style.display = 'none';
      }
    });
  }

  /* Build the theme dropdown menu from /themes-registry.json. Each
   * entry fetches the theme JSON, parses it, and calls applyThemeFromJson
   * (which updates both the CodeMirror theme and the app CSS vars). */
  async toggleThemeMenu() {
    if (!this.elThemeMenu) return;
    if (this.elThemeMenu.style.display !== 'none') {
      this.elThemeMenu.style.display = 'none';
      return;
    }
    this.elThemeMenu.innerHTML = '<div style="padding:8px 12px;color:var(--app-muted,#9ca3af);font-size:11px;">Loading\u2026</div>';
    this.elThemeMenu.style.display = 'block';
    let registry = { themes: [{ id: 'zed-default', name: 'Default (oneDark)', builtin: true }] };
    try {
      const r = await fetch('themes-registry.json');
      if (r.ok) registry = await r.json();
    } catch (e) { /* fall through to default-only menu */ }
    this.renderThemeMenu(registry.themes || []);
  }

  renderThemeMenu(themes) {
    if (!this.elThemeMenu) return;
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--app-fg').trim() || '#e5e5e5';
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--app-muted').trim() || '#9ca3af';
    const hover = getComputedStyle(document.documentElement).getPropertyValue('--app-surface').trim() || '#262626';
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--app-accent').trim() || '#5e2baf';
    this.elThemeMenu.innerHTML = '';
    themes.forEach((t) => {
      const item = document.createElement('div');
      item.textContent = t.name;
      item.style.cssText = `padding:8px 14px;cursor:pointer;font-size:12px;color:${fg};white-space:nowrap;`;
      item.addEventListener('mouseenter', () => { item.style.background = hover; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      item.addEventListener('click', () => {
        this.elThemeMenu.style.display = 'none';
        if (t.builtin) {
          this.resetTheme();
        } else {
          this.applyThemeByPath(t.id, t.name, t.path);
        }
      });
      this.elThemeMenu.appendChild(item);
    });
    const divider = document.createElement('div');
    divider.style.cssText = `height:1px;background:${muted};opacity:0.3;margin:4px 0;`;
    this.elThemeMenu.appendChild(divider);
    const fileItem = document.createElement('div');
    fileItem.textContent = 'Choose file\u2026';
    fileItem.style.cssText = `padding:8px 14px;cursor:pointer;font-size:12px;color:${muted};white-space:nowrap;font-style:italic;`;
    fileItem.addEventListener('mouseenter', () => { fileItem.style.background = hover; });
    fileItem.addEventListener('mouseleave', () => { fileItem.style.background = 'transparent'; });
    fileItem.addEventListener('click', () => {
      this.elThemeMenu.style.display = 'none';
      this.elThemeFile.click();
    });
    this.elThemeMenu.appendChild(fileItem);
  }

  async applyThemeByPath(id, name, path) {
    try {
      const r = await fetch(path);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      const result = this.applyZedThemeJson(text);
      if (result.ok) {
        localStorage.setItem('matey-editor-theme-id', id);
        localStorage.setItem('matey_selected_theme', name);
        this.elThemeLabel.textContent = name;
        this.elThemeLabel.title = `Active theme: ${name} (${path})`;
        this.elBtnThemeReset.style.display = 'inline-block';
      } else {
        alert('Failed to apply theme: ' + result.error);
      }
    } catch (e) {
      alert('Failed to load theme ' + name + ': ' + e.message);
    }
  }

  handleThemeFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const result = this.applyZedThemeJson(text);
      if (result.ok) {
        this.elThemeLabel.textContent = file.name.replace(/\.json$/i, '');
        this.elThemeLabel.title = `Active theme: ${file.name}`;
        this.elBtnThemeReset.style.display = 'inline-block';
      } else {
        alert('Failed to apply theme: ' + result.error);
      }
    };
    reader.onerror = () => alert('Failed to read theme file: ' + reader.error);
    reader.readAsText(file);
    e.target.value = '';
  }

  resetTheme() {
    localStorage.removeItem('matey-editor-theme');
    localStorage.removeItem('matey-editor-theme-source');
    localStorage.removeItem('matey-editor-theme-id');
    localStorage.setItem('matey_selected_theme', 'default');
    this.setTheme(oneDark);
    try { clearGlobalZedTheme(); } catch (_) { /* ignore */ }
    this.elThemeLabel.textContent = '';
    this.elThemeLabel.title = '';
    this.elBtnThemeReset.style.display = 'none';
  }

  initGlobalShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        this.saveFile();
      }
    });
  }

  getLanguageExtension(path) {
    if (!path) return [];
    const ext = path.split('.').pop().toLowerCase();
    switch (ext) {
      case 'js': case 'jsx': case 'ts': case 'tsx':
        this.elLangBadge.innerText = ext.toUpperCase();
        return [javascript()];
      case 'html': case 'htm':
        this.elLangBadge.innerText = 'HTML';
        return [html()];
      case 'svg':
        this.elLangBadge.innerText = 'SVG';
        return [xml()];
      case 'css': case 'scss': case 'sass': case 'less':
        this.elLangBadge.innerText = 'CSS';
        return [css()];
      case 'json':
        this.elLangBadge.innerText = 'JSON';
        return [json()];
      case 'py': case 'pyw':
        this.elLangBadge.innerText = 'PY';
        return [python()];
      case 'md': case 'markdown':
        this.elLangBadge.innerText = 'MD';
        return [markdown()];
      case 'sql':
        this.elLangBadge.innerText = 'SQL';
        return [sql()];
      case 'yaml': case 'yml':
        this.elLangBadge.innerText = 'YAML';
        return [yaml()];
      case 'xml':
        this.elLangBadge.innerText = 'XML';
        return [xml()];
      case 'txt':
        this.elLangBadge.innerText = 'TXT';
        return [];
      default:
        this.elLangBadge.innerText = ext ? ext.toUpperCase() : 'TXT';
        return [];
    }
  }

  buildBaseExtensions() {
    return [
      basicSetup,
      this.themeCompartment.of(oneDark),
      diffField,
      history(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      lineNumbers(),
      autocompletion(),
      this.languageCompartment.of([]),
      this.readOnlyCompartment.of([]),
      EditorView.lineWrapping,
      keymap.of([
        { key: 'Mod-s', run: () => { this.saveFile(); return true; } },
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
         if (update.docChanged) {
           this.setDirty(true);
           /* Stage 8: Offline AST analysis — when offline, run local lint */
           if (!navigator.onLine) {
             this.runOfflineLint(update.state.doc.toString());
           }
           /* Stage 5: Shadow Twin — error pattern detection on content change */
           if (window.MateyShadowTwin && this._shadowTwinDebounce) {
             clearTimeout(this._shadowTwinDebounce);
           }
           if (window.MateyShadowTwin) {
             this._shadowTwinDebounce = setTimeout(function () {
               var content = update.state.doc.toString();
               var path = this.activeFilePath || '';
               window.MateyShadowTwin.checkContent(content, path);
             }.bind(this), 1500);
           }
         }
       }),
    ];
  }

  /* Apply a CodeMirror theme extension to the live editor.
   * Pass `oneDark` (or any Extension) to switch themes at runtime.
   * CodeMirror 6 themes are additive in the theme facet; reconfigure
   * alone leaves stale CSS rules from the previous theme. Dispatch
   * a clear first, then the new theme in a second transaction. */
  setTheme(themeExtension) {
    if (!this.view || this.useFallback) return;
    const ext = [].concat(themeExtension).flat(Infinity);
    /* Step 1: clear the compartment */
    this.view.dispatch({
      effects: this.themeCompartment.reconfigure([]),
    });
    /* Step 2: apply the new theme. requestAnimationFrame ensures
     * the browser has processed the clear before the new theme's
     * CSS rules land in the StyleModule. */
    requestAnimationFrame(() => {
      if (!this.view || this.useFallback) return;
      this.view.dispatch({
        effects: this.themeCompartment.reconfigure(ext),
      });
    });
  }

  /* Convenience: parse a Zed theme JSON string and apply it.
   * Saves the theme name to localStorage('matey_selected_theme') so
   * the choice persists across app restarts. The applyThemeByPath
   * path also writes the registry id to the same key. */
  applyZedThemeJson(jsonString) {
    try {
      const obj = JSON.parse(jsonString);
      const ext = zedThemeFromObject(obj);
      this.setTheme(ext);
      try { applyGlobalZedTheme(obj); } catch (_) { /* ignore global apply */ }
      const themeName = (obj && (obj.name || (obj.themes && obj.themes[0] && obj.themes[0].name))) || 'custom';
      localStorage.setItem('matey-editor-theme-source', 'zed');
      localStorage.setItem('matey-editor-theme', jsonString);
      localStorage.setItem('matey_selected_theme', themeName);
      return { ok: true, theme: themeName };
    } catch (e) {
      console.error('[MateyIDE] Failed to apply Zed theme:', e);
      return { ok: false, error: e.message };
    }
  }

  /* Restore the last-applied editor theme (or oneDark default). */
  restoreStoredTheme() {
    const stored = localStorage.getItem('matey-editor-theme');
    if (stored) {
      const result = this.applyZedThemeJson(stored);
      if (result.ok && this.elThemeLabel) {
        try {
          const parsed = JSON.parse(stored);
          const name = (parsed && parsed.name) || 'custom';
          this.elThemeLabel.textContent = name;
          this.elThemeLabel.title = 'Active theme: ' + name;
          if (this.elBtnThemeReset) this.elBtnThemeReset.style.display = 'inline-block';
        } catch (_) { /* ignore label update */ }
      }
    }
  }

  initEditor() {
    try {
      this.view = new EditorView({
        state: EditorState.create({
          doc: '',
          extensions: this.buildBaseExtensions(),
        }),
        parent: this.elEditorTarget,
      });

      this.view.dispatch({
        effects: this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(true)),
      });
      this.isReadOnly = true;
      this.useFallback = false;
      this.restoreStoredTheme();
    } catch (err) {
      console.error('[MateyIDE] Failed to initialize CodeMirror:', err);
      this.createFallbackEditor();
    }
  }

  createFallbackEditor() {
    this.useFallback = true;
    this.elFallbackTextarea = document.createElement('textarea');
    this.elFallbackTextarea.style.width = '100%';
    this.elFallbackTextarea.style.height = '100%';
    this.elFallbackTextarea.style.boxSizing = 'border-box';
    this.elFallbackTextarea.style.padding = '8px';
    this.elFallbackTextarea.style.fontFamily = 'monospace';
    this.elFallbackTextarea.style.fontSize = '13px';
    this.elFallbackTextarea.style.color = '#e5e5e5';
    this.elFallbackTextarea.style.backgroundColor = '#080808';
    this.elFallbackTextarea.style.border = 'none';
    this.elFallbackTextarea.style.resize = 'none';
    this.elFallbackTextarea.style.outline = 'none';
    this.elFallbackTextarea.style.whiteSpace = 'pre';
    this.elFallbackTextarea.value = '';
    this.elEditorTarget.appendChild(this.elFallbackTextarea);
  }

  setDirty(state) {
    if (this.isReadOnly) return;
    this.isDirty = state;
    this.elDirtyDot.style.display = state ? 'inline' : 'none';
  }

  setReadOnly(state) {
    this.isReadOnly = state;
    if (this.view && !this.useFallback) {
      this.view.dispatch({
        effects: this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(state)),
      });
    } else if (this.elFallbackTextarea) {
      this.elFallbackTextarea.readOnly = state;
    }
  }

  setWarningMessage(message) {
    this.isReadOnly = true;
    this.setDirty(false);
    const warningText = `// ${message}\n// This file is read-only due to size or binary content.`;
    if (this.view && !this.useFallback) {
      this.view.dispatch({
        effects: this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(true)),
      });
      this.view.setState(EditorState.create({
        doc: warningText,
        extensions: this.buildBaseExtensions(),
      }));
    } else if (this.elFallbackTextarea) {
      this.elFallbackTextarea.value = warningText;
      this.elFallbackTextarea.readOnly = true;
    }
  }

  async openFile(filePath) {
    try {
      const content = await readFile(filePath);
      const fileSize = new Blob([content]).size;
      this.fileSize = fileSize;
      this.activeFilePath = filePath;
      this.elFilePath.innerText = filePath;
      this.elLangBadge.innerText = '...';

      if (fileSize > MAX_FILE_SIZE) {
        this.setWarningMessage(`File too large to edit (${(fileSize / 1024 / 1024).toFixed(1)}MB > 2MB limit). Open in an external editor.`);
        return;
      }

      if (BINARY_REGEX.test(content) && !this.isLikelyText(filePath)) {
        this.setWarningMessage('File appears to be binary. Displaying as read-only text.');
        return;
      }

      this.isReadOnly = false;
      const langExt = this.getLanguageExtension(filePath);

      this.setReadOnly(false);

      this.setContent(content);
      if (this.view && !this.useFallback) {
        this.view.dispatch({
          effects: this.languageCompartment.reconfigure(langExt),
        });
      }
      this.setDirty(false);
    } catch (e) {
      console.error('Failed to open file:', e);
      this.activeFilePath = filePath;
      this.elFilePath.innerText = `${filePath} (error)`;
      this.elLangBadge.innerText = 'ERR';
      this.setReadOnly(true);
      const errText = `// Error: Could not open ${filePath}\n// ${e.message}`;
      this.setContent(errText);
    }
  }

  isLikelyText(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    return ['js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'json', 'py', 'pyw', 'md', 'markdown', 'sql', 'yaml', 'yml', 'xml', 'txt', 'svg'].includes(ext);
  }

  async saveFile() {
    if (!this.activeFilePath) {
      return this.saveFileAs();
    }
    if (this.isReadOnly) {
      return;
    }
    try {
      const content = this.view.state.doc.toString();
      await writeFile(this.activeFilePath, content);
      this.setDirty(false);
      this.view.dispatch({ effects: clearDiffEffect.of() });
      if (window.MateyFS && typeof window.MateyFS.fileSaved === 'function') {
        window.MateyFS.fileSaved(this.activeFilePath);
      }
    } catch (e) {
      alert(`Save failed: ${e.message}`);
    }
  }

  async saveFileAs() {
    const defaultName = this.activeFilePath || 'untitled.js';
    const newPath = prompt('Save file as (relative to workspace):', defaultName);
    if (!newPath) return;

    this.activeFilePath = newPath;
    this.elFilePath.innerText = newPath;
    const langExt = this.getLanguageExtension(newPath);
    this.view.dispatch({
      effects: this.languageCompartment.reconfigure(langExt),
    });

    await this.saveFile();
    this.autoSync();
  }

  async deleteCurrentFile() {
    if (!this.activeFilePath) return;
    if (!confirm(`Are you sure you want to delete ${this.activeFilePath}? This cannot be undone.`)) {
      return;
    }
    try {
      if (window.MateyFS && typeof window.MateyFS.deleteFile === 'function') {
        await window.MateyFS.deleteFile(this.activeFilePath);
      } else {
        console.warn('No deleteFile available on window.MateyFS; cannot delete remote file');
        return;
      }

      this.activeFilePath = null;
      this.elFilePath.innerText = 'No file open';
      this.elLangBadge.innerText = 'TXT';
      this.setDirty(false);
      this.isReadOnly = false;

      this.view.dispatch({
        effects: this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(false)),
      });
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: '' },
      });

      this.autoSync();
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
  }

  autoSync() {
    if (window.MateyFS && typeof window.MateyFS.refreshFileTree === 'function') {
      window.MateyFS.refreshFileTree();
    }
    window.dispatchEvent(new CustomEvent('matey:workspace-changed', {
      detail: { action: 'reload' },
    }));
  }

  async askAgent(promptText) {
    if (this.isReadOnly) {
      alert('Cannot send agent changes to a read-only file.');
      return;
    }

    await this.agent.executeTask(promptText, this.activeFilePath, (diff) => {
      const currentDoc = this.view.state.doc.toString();
      const searchTrimmed = diff.search.trim();
      const replaceTrimmed = diff.replace.trim();

      const startIndex = currentDoc.indexOf(searchTrimmed);

      if (startIndex === -1) {
        console.warn('Agent search block did not match current code.');
        return;
      }

      const fromPos = this.view.state.doc.lineAt(startIndex).from;
      const fromLine = this.view.state.doc.lineAt(startIndex).number;
      const toIndex = startIndex + searchTrimmed.length;
      const toLine = this.view.state.doc.lineAt(toIndex).number;

      this.view.dispatch({
        effects: addDiffEffect.of({
          fromLine,
          toLine,
          type: 'replace',
        }),
      });

      this.currentDiff = {
        fromPos,
        toPos: fromPos + searchTrimmed.length,
        search: searchTrimmed,
        replace: replaceTrimmed,
        fromLine,
        toLine,
      };

      this.showFloatingDiffBar(this.currentDiff);

      this.view.dispatch({
        effects: EditorView.scrollIntoView({ from: fromPos, to: fromPos + searchTrimmed.length }, 1),
      });
    });
  }

  showFloatingDiffBar(diff) {
    const targetPos = diff.fromPos;
    const rect = this.view.coordsAtPos(targetPos);
    if (!rect) return;

    const existing = document.getElementById('matey-floating-diff-bar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.id = 'matey-floating-diff-bar';

    const label = document.createElement('span');
    label.className = 'diff-label';
    label.textContent = 'Agent';

    const preview = document.createElement('span');
    preview.className = 'diff-preview';
    preview.textContent = diff.replace;

    const acceptBtn = document.createElement('button');
    acceptBtn.textContent = 'Apply';
    acceptBtn.addEventListener('click', () => {
      this.acceptAgentDiff();
      bar.remove();
    });

    const rejectBtn = document.createElement('button');
    rejectBtn.textContent = 'Reject';
    rejectBtn.className = 'reject';
    rejectBtn.addEventListener('click', () => {
      this.rejectAgentDiff();
      bar.remove();
    });

    bar.appendChild(label);
    bar.appendChild(preview);
    bar.appendChild(acceptBtn);
    bar.appendChild(rejectBtn);

    bar.style.left = `${rect.left}px`;
    bar.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 60)}px`;

    const editorRect = this.view.dom.getBoundingClientRect();
    bar.style.maxWidth = `${Math.min(editorRect.width, 420)}px`;

    document.body.appendChild(bar);

    setTimeout(() => {
      if (bar.parentNode) bar.remove();
    }, 20000);
  }

  /* Stage 8: Offline AST lint — local static analysis via tree-sitter.
   * Runs only when navigator.onLine is false. No network call is made. */
  runOfflineLint(content) {
    if (this._offlineLintDebounce) clearTimeout(this._offlineLintDebounce);
    this._offlineLintDebounce = setTimeout(function () {
      var self = this;
      if (navigator.onLine) return;
      var langHint = ASTIndex.detectLanguage(this.activeFilePath || '');
      ASTIndex.validateParse(content, langHint).then(function (res) {
        if (res.valid) {
          self.setOfflineStatus('No syntax issues', 'ok');
        } else {
          var where = res.firstError ? ('line ' + res.firstError.line) : '';
          self.setOfflineStatus('Syntax issue ' + where + ' — ' + (res.errorNodes || 1) + ' node(s)', 'warn');
        }
      }).catch(function () {
        self.setOfflineStatus('', 'ok');
      });
    }.bind(this), 1200);
  }

  setOfflineStatus(text, kind) {
    var el = document.getElementById('ide-offline-status');
    if (!el) {
      var header = document.getElementById('ide-header');
      if (!header) return;
      el = document.createElement('div');
      el.id = 'ide-offline-status';
      el.style.cssText = 'display:none;font-size:11px;padding:3px 12px;border-top:1px solid var(--app-border);';
      header.parentNode.insertBefore(el, header.nextSibling);
    }
    if (!text) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.textContent = '⚠ Offline · ' + text;
    if (kind === 'warn') {
      el.style.color = '#fbbf24';
      el.style.background = '#2a1f00';
    } else {
      el.style.color = '#6ee7b7';
      el.style.background = '#001f14';
    }
  }

  acceptAgentDiff() {
    if (!this.currentDiff) return;
    const { fromPos, toPos, replace } = this.currentDiff;
    this.view.dispatch({
      changes: { from: fromPos, to: toPos, insert: replace },
      effects: clearDiffEffect.of(),
    });
    this.setDirty(true);
    this.currentDiff = null;
  }

  rejectAgentDiff() {
    this.view.dispatch({ effects: clearDiffEffect.of() });
    this.currentDiff = null;
  }

  async refreshFileTree() {
    this.autoSync();
  }

  dispose() {
    this.clearDiffMarkers();
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
  }

  clearDiffMarkers() {
    if (!this.view) return;
    this.view.dispatch({ effects: clearDiffEffect.of() });
    this.currentDiff = null;
  }
}

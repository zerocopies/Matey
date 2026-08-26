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
import { oneDark } from '@codemirror/theme-one-dark';
import { bracketMatching, syntaxHighlighting, defaultHighlightStyle, language } from '@codemirror/language';
import { keymap, highlightActiveLine, highlightActiveLineGutter, lineNumbers } from '@codemirror/view';

import { readFile, writeFile } from './matey-fs-module.js';
import { AgentOrchestrator } from './matey-agent.js';
import { diffField, addDiffEffect, clearDiffEffect } from './matey-diff.js';

const BINARY_REGEX = /[\x00-\x08\x0E-\x1F\x7F]/;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

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
    this.currentDiff = null;

    injectFloatingActionStyle();
    this.initHeaderUI();
    this.initEditor();
    this.initGlobalShortcuts();
  }

  initHeaderUI() {
    const headerHTML = `
      <div id="ide-header" style="display:flex;align-items:center;justify-content:space-between;background:#0D0D0D;border-bottom:1px solid #262626;padding:8px 12px;font-family:sans-serif;font-size:13px;color:#e5e5e5;min-height:41px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;gap:8px;overflow:hidden;min-width:0;flex:1;">
          <span id="ide-lang-badge" style="background:#312e81;color:#a5b4fc;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;white-space:nowrap;">TXT</span>
          <span id="ide-file-path" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#a3a3a3;font-family:monospace;min-width:0;flex:1;">No file open</span>
          <span id="ide-dirty-dot" style="display:none;color:#f59e0b;font-size:14px;line-height:1;white-space:nowrap;">\u25CF</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <button id="ide-btn-save" title="Save (Cmd+S)" style="background:#4f46e5;color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;">Save</button>
          <button id="ide-btn-saveas" title="Save As" style="background:#262626;color:#d4d4d4;border:1px solid #404040;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;">Save As</button>
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

    this.elBtnSave = document.getElementById('ide-btn-save');
    this.elBtnSaveAs = document.getElementById('ide-btn-saveas');
    this.elBtnDelete = document.getElementById('ide-btn-delete');

    this.elBtnSave.addEventListener('click', () => this.saveFile());
    this.elBtnSaveAs.addEventListener('click', () => this.saveFileAs());
    this.elBtnDelete.addEventListener('click', () => this.deleteCurrentFile());
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
      oneDark,
      diffField,
      history(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      lineNumbers(),
      autocompletion(),
      language,
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
        }
      }),
    ];
  }

  initEditor() {
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
  }

  setDirty(state) {
    if (this.isReadOnly) return;
    this.isDirty = state;
    this.elDirtyDot.style.display = state ? 'inline' : 'none';
  }

  setReadOnly(state) {
    this.isReadOnly = state;
    this.view.dispatch({
      effects: this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(state)),
    });
  }

  setWarningMessage(message) {
    this.isReadOnly = true;
    this.setDirty(false);
    this.view.dispatch({
      effects: this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(true)),
    });
    const warningText = `// ${message}\n// This file is read-only due to size or binary content.`;
    this.view.setState(EditorState.create({
      doc: warningText,
      extensions: this.buildBaseExtensions(),
    }));
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

      const tr = this.view.state.update({
        changes: { from: 0, to: this.view.state.doc.length, insert: content },
      });
      this.view.dispatch(tr);

      this.view.dispatch({
        effects: this.languageCompartment.reconfigure(langExt),
      });

      this.setDirty(false);
    } catch (e) {
      console.error('Failed to open file:', e);
      this.activeFilePath = filePath;
      this.elFilePath.innerText = `${filePath} (error)`;
      this.elLangBadge.innerText = 'ERR';
      this.setReadOnly(true);
      const errText = `// Error: Could not open ${filePath}\n// ${e.message}`;
      this.view.setState(EditorState.create({
        doc: errText,
        extensions: this.buildBaseExtensions(),
      }));
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

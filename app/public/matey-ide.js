import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { readFile, writeFile } from './matey-fs-module.js';
import { AgentOrchestrator } from './matey-agent.js';
import { diffField, addDiffEffect, clearDiffEffect } from './matey-diff.js';

export class MateyIDE {
  constructor(containerId, provider) {
    this.activeFilePath = null;
    this.agent = new AgentOrchestrator(provider);
    this.view = new EditorView({
      state: EditorState.create({ doc: '', extensions: [basicSetup, javascript(), diffField] }),
      parent: document.getElementById(containerId)
    });
  }

  async openFile(filePath) {
    this.activeFilePath = filePath;
    try {
      const content = await readFile(filePath);
      this.view.setState(EditorState.create({ doc: content, extensions: [basicSetup, javascript(), diffField] }));
    } catch (e) { 
      console.error('Failed to open:', e); 
      // If file doesn't exist, open blank state
      this.view.setState(EditorState.create({ doc: '', extensions: [basicSetup, javascript(), diffField] }));
    }
  }

  async saveFile() {
    if (!this.activeFilePath) return;
    await writeFile(this.activeFilePath, this.view.state.doc.toString());
    this.view.dispatch({ effects: clearDiffEffect.of() });
  }

  async askAgent(prompt) {
    await this.agent.executeTask(prompt, this.activeFilePath, (diff) => {
      const currentDoc = this.view.state.doc.toString();
      const startIndex = currentDoc.indexOf(diff.search.trim());
      
      if (startIndex !== -1) {
        const fromLine = this.view.state.doc.lineAt(startIndex).number;
        const searchLines = diff.search.trim().split('\n').length;
        
        this.view.dispatch({ 
          effects: addDiffEffect.of({ fromLine, toLine: fromLine + searchLines - 1, type: 'remove' }) 
        });
        
        if (confirm(`Agent proposes replacement:\n\n${diff.replace}\n\nAccept?`)) {
          this.view.dispatch({
            changes: { from: startIndex, to: startIndex + diff.search.trim().length, insert: diff.replace.trim() },
            effects: clearDiffEffect.of()
          });
        }
      } else {
        console.warn("Agent search block did not match current code.");
      }
    });
  }
}

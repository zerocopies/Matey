export class CommandPalette {
  constructor(ideInstance) {
    this.ide = ideInstance;
    this.initUI();
    this.attachListeners();
  }

  initUI() {
    const paletteHTML = `
      <div id="cmd-palette-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
        <div style="background:#1e1e1e; padding:16px; border-radius:12px; width:90%; max-width:400px; border:1px solid #333;">
          <p style="color:#aaa; margin:0 0 8px 0; font-size:12px; font-family:monospace;">Agent Command</p>
          <input type="text" id="cmd-palette-input" placeholder="Speak or type..." style="width:100%; padding:12px; background:#000; color:#fff; border:1px solid #444; border-radius:6px; font-size:16px;" />
          <div style="display:flex; justify-content:space-between; margin-top:12px;">
            <button id="cmd-palette-cancel" style="padding:8px 16px; background:transparent; color:#fff; border:none;">Cancel</button>
            <button id="cmd-palette-submit" style="padding:8px 16px; background:#4f46e5; color:#fff; border:none; border-radius:6px; font-weight:bold;">Send</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', paletteHTML);
    this.overlay = document.getElementById('cmd-palette-overlay');
    this.input = document.getElementById('cmd-palette-input');
  }

  attachListeners() {
    const micBtn = document.getElementById('toolbar-mic-btn');
    if (micBtn) {
      micBtn.addEventListener('click', async () => {
        this.openPalette("Listening...");
        if (typeof window.runLocalSTT === 'function') {
          this.input.value = await window.runLocalSTT();
        } else {
          this.input.value = "Error: window.runLocalSTT not found.";
        }
      });
    }
    
    document.getElementById('cmd-palette-submit').addEventListener('click', () => this.submitCommand());
    this.input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.submitCommand(); });
    document.getElementById('cmd-palette-cancel').addEventListener('click', () => this.closePalette());
  }

  openPalette(placeholder = "") {
    this.overlay.style.display = 'flex';
    this.input.value = '';
    this.input.placeholder = placeholder;
    this.input.focus();
  }

  closePalette() { 
    this.overlay.style.display = 'none'; 
  }

  submitCommand() {
    const text = this.input.value.trim();
    if (text) { 
      this.ide.askAgent(text); 
      this.closePalette(); 
    }
  }
}

export class MateyCoachDB {
  constructor() {
    this.dbName = 'matey-coach-vault';
    this.version = 1;
    this.storeName = 'coach_history';
    this.db = null;
    this.init();
  }

  init() {
    try {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('stage', 'stage', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
      };
      req.onerror = (e) => {
        console.warn('[MateyCoachDB] Init failed:', e.target.error);
      };
    } catch (e) {
      console.warn('[MateyCoachDB] Init error:', e);
    }
  }

  _tx(mode) {
    if (!this.db) return null;
    try {
      return this.db.transaction(this.storeName, mode).objectStore(this.storeName);
    } catch (e) {
      return null;
    }
  }

  saveTip(tipObj) {
    return new Promise((resolve) => {
      try {
        const store = this._tx('readwrite');
        if (!store) return resolve(null);
        const record = {
          stage: tipObj.stage || 1,
          tipText: tipObj.tipText || '',
          context: tipObj.context || '',
          isStarred: !!tipObj.isStarred,
          createdAt: Date.now()
        };
        const req = store.add(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  getAllTips() {
    return new Promise((resolve) => {
      try {
        const store = this._tx('readonly');
        if (!store) return resolve([]);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  toggleStar(id) {
    return new Promise((resolve) => {
      try {
        const store = this._tx('readwrite');
        if (!store) return resolve(false);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const record = getReq.result;
          if (!record) return resolve(false);
          record.isStarred = !record.isStarred;
          const putReq = store.put(record);
          putReq.onsuccess = () => resolve(record.isStarred);
          putReq.onerror = () => resolve(false);
        };
        getReq.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }
}

export class MateyCoach {
  constructor() {
    this.state = this.loadState();
    this.shownTipIds = new Set(this.state.shownTipIds || []);
    this.pendingTip = null;
    this.dragState = { dragging: false, offsetX: 0, offsetY: 0 };
    this.posKey = 'matey_coach_badge_pos';
    this.db = new MateyCoachDB();
    this.initUI();
  }

  loadState() {
    try {
      const raw = localStorage.getItem('matey_coach_state');
      return raw ? JSON.parse(raw) : { stage: 1, streak: 0, shownTipIds: [] };
    } catch (e) {
      return { stage: 1, streak: 0, shownTipIds: [] };
    }
  }

  saveState() {
    this.state.shownTipIds = Array.from(this.shownTipIds);
    localStorage.setItem('matey_coach_state', JSON.stringify(this.state));
  }

  loadPosition() {
    try {
      const raw = localStorage.getItem(this.posKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { bottom: 160, right: 20 };
  }

  savePosition(pos) {
    localStorage.setItem(this.posKey, JSON.stringify(pos));
  }

  initUI() {
    if (document.getElementById('coach-badge')) return;

    const pos = this.loadPosition();

    const html = `
      <div id="coach-badge" style="position:fixed; bottom:${pos.bottom}px; right:${pos.right}px; width:56px; height:56px; background:var(--accent, #FFD166); border:none; border-radius:50%; display:none; align-items:center; justify-content:center; z-index:200; -webkit-tap-highlight-color:transparent; touch-action:none; cursor:grab; box-shadow:0 4px 12px rgba(0,0,0,0.35); opacity:0; transform:scale(0.8); transition:opacity 0.3s ease, transform 0.3s ease;">
        <span style="font-size:24px; line-height:1; display:block; width:100%; height:100%; display:flex; align-items:center; justify-content:center; pointer-events:none;">💡</span>
      </div>
      <div id="coach-drawer" style="position:fixed; bottom:${pos.bottom}px; right:${pos.right + 66}px; width:300px; max-width:calc(100vw - 80px); background:var(--card-bg, #0D0D0D); border:1px solid var(--border, #2A2A2A); border-radius:16px; padding:18px 20px; color:#FFFFFF; font-family:inherit; font-size:14px; line-height:1.6; box-shadow:0 10px 40px rgba(0,0,0,0.6); z-index:201; display:none; opacity:0; transform:translateY(12px); transition:opacity 0.25s ease, transform 0.25s ease;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
          <div style="font-size:10px; color:var(--accent, #B583FC); font-weight:700; text-transform:uppercase; letter-spacing:0.6px;">Quick Tip</div>
        </div>
        <div id="coach-tip-text" style="color:#e8e8e8; margin-bottom:14px;"></div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <button id="coach-star-btn" type="button" style="background:none; border:1px solid var(--border, #2A2A2A); border-radius:10px; padding:8px 12px; color:#FFD166; font-size:18px; cursor:pointer; display:flex; align-items:center; gap:6px; transition:background 0.15s ease;">
            <span id="coach-star-icon">☆</span>
            <span id="coach-star-label" style="font-size:12px; color:#B3B3B3;">Save</span>
          </button>
          <button id="coach-dismiss-btn" type="button" style="background:var(--accent, #B583FC); border:none; border-radius:10px; padding:8px 14px; color:#1c1c20; font-size:13px; font-weight:600; cursor:pointer; transition:opacity 0.15s ease;">
            Got it
          </button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const badge = document.getElementById('coach-badge');
    const drawer = document.getElementById('coach-drawer');

    if (badge && drawer) {
      badge.style.cursor = 'grab';
      badge.style.userSelect = 'none';

      badge.addEventListener('touchstart', this._onDragStart.bind(this), { passive: false });
      badge.addEventListener('mousedown', this._onDragStart.bind(this), { passive: false });

      badge.removeEventListener('click', this._badgeClick);
      this._badgeClick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (this.dragState.dragging) {
          this.dragState.dragging = false;
          return;
        }
        drawer.style.display = 'flex';
        requestAnimationFrame(() => {
          drawer.style.opacity = '1';
          drawer.style.transform = 'translateY(0)';
        });
      };
      badge.addEventListener('click', this._badgeClick);

      const dismissBtn = document.getElementById('coach-dismiss-btn');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => this.dismissCurrentTip());
      }

      const starBtn = document.getElementById('coach-star-btn');
      if (starBtn) {
        starBtn.addEventListener('click', () => this._toggleStarUI());
      }

      document.addEventListener('click', this._outsideClick);
      this._outsideClick = (e) => {
        const badge = document.getElementById('coach-badge');
        if (badge && !badge.contains(e.target) && drawer && !drawer.contains(e.target)) {
          if (this.pendingTip) {
            this.dismissCurrentTip();
          } else {
            if (drawer) {
              drawer.style.opacity = '0';
              drawer.style.transform = 'translateY(12px)';
              setTimeout(() => { drawer.style.display = 'none'; }, 250);
            }
          }
        }
      };
    }
  }

  _onDragStart(e) {
    if (e.type === 'touchstart') {
      e.preventDefault();
      this._handleDrag(e.touches[0], 'touch');
    } else {
      e.preventDefault();
      this._handleDrag(e, 'mouse');
    }
  }

  _handleDrag(startPoint, mode) {
    const badge = document.getElementById('coach-badge');
    if (!badge) return;

    this.dragState.dragging = false;
    let startX, startY;

    if (mode === 'touch') {
      startX = startPoint.clientX;
      startY = startPoint.clientY;
    } else {
      startX = startPoint.clientX;
      startY = startPoint.clientY;
    }

    const startX_pct = startX;
    const startY_pct = startY;
    const badgeRect = badge.getBoundingClientRect();
    const offsetX = startX_pct - badgeRect.left;
    const offsetY = startY_pct - badgeRect.top;

    const moveHandler = (moveEvent) => {
      moveEvent.preventDefault();
      let clientX, clientY;
      if (mode === 'touch') {
        clientX = moveEvent.touches[0].clientX;
        clientY = moveEvent.touches[0].clientY;
      } else {
        clientX = moveEvent.clientX;
        clientY = moveEvent.clientY;
      }

      const newX = clientX - offsetX;
      const newY = clientY - offsetY;
      const badgeWidth = 26;
      const badgeHeight = 26;

      let left = newX;
      let top = newY;

      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      if (left < 8) left = 8;
      if (left > viewportWidth - badgeWidth - 8) left = viewportWidth - badgeWidth - 8;
      if (top < 8) top = 8;
      if (top > viewportHeight - badgeHeight - 8) top = viewportHeight - badgeHeight - 8;

      badge.style.left = left + 'px';
      badge.style.right = 'auto';
      badge.style.bottom = 'auto';
      badge.style.top = top + 'px';
      badge.style.transform = 'none';

      this.dragState.dragging = true;
    };

    const endHandler = (endEvent) => {
      const badge = document.getElementById('coach-badge');
      if (!badge) return;

      const rect = badge.getBoundingClientRect();
      const pos = {
        bottom: Math.round(window.innerHeight - rect.bottom),
        right: Math.round(window.innerWidth - rect.right)
      };
      if (pos.bottom < 8) pos.bottom = 20;
      if (pos.right < 8) pos.right = 20;
      this.savePosition(pos);

      badge.style.bottom = pos.bottom + 'px';
      badge.style.right = pos.right + 'px';
      badge.style.left = 'auto';
      badge.style.top = 'auto';
      badge.style.transform = 'none';

      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', endHandler);
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('touchend', endHandler);
    };

    document.addEventListener('mousemove', moveHandler, { passive: false });
    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', endHandler);
  }

  show(tipId, message) {
    if (this.shownTipIds.has(tipId)) return;
    this.pendingTip = { tipId, message, isStarred: false };
    if (!document.getElementById('coach-badge')) this.initUI();

    const badge = document.getElementById('coach-badge');
    const drawer = document.getElementById('coach-drawer');
    const tipText = document.getElementById('coach-tip-text');
    const starIcon = document.getElementById('coach-star-icon');
    const starLabel = document.getElementById('coach-star-label');

    if (badge) {
      const pos = this.loadPosition();
      badge.style.bottom = pos.bottom + 'px';
      badge.style.right = pos.right + 'px';
      badge.style.display = 'flex';
      requestAnimationFrame(() => {
        badge.style.opacity = '1';
        badge.style.transform = 'scale(1)';
      });

      if (drawer && tipText) {
        tipText.innerText = message;
        drawer.style.display = 'flex';
        requestAnimationFrame(() => {
          drawer.style.opacity = '1';
          drawer.style.transform = 'translateY(0)';
        });
      }

      if (starIcon) starIcon.textContent = '☆';
      if (starLabel) starLabel.textContent = 'Save';
      this._currentStarred = false;
    }
  }

  _toggleStarUI() {
    this._currentStarred = !this._currentStarred;
    const starIcon = document.getElementById('coach-star-icon');
    const starLabel = document.getElementById('coach-star-label');
    if (starIcon) starIcon.textContent = this._currentStarred ? '★' : '☆';
    if (starLabel) starLabel.textContent = this._currentStarred ? 'Saved' : 'Save';
  }

  async dismissCurrentTip() {
    const tip = this.pendingTip;
    if (tip) {
      try {
        await this.db.saveTip({
          stage: this.state.stage,
          tipText: tip.message,
          context: tip.tipId,
          isStarred: this._currentStarred || false
        });
      } catch (e) {
        console.warn('[MateyCoach] Failed to save tip:', e);
      }
      this.shownTipIds.add(tip.tipId);
      this.saveState();
    }

    const badge = document.getElementById('coach-badge');
    const drawer = document.getElementById('coach-drawer');

    if (drawer) {
      drawer.style.opacity = '0';
      drawer.style.transform = 'translateY(12px)';
    }
    if (badge) {
      badge.style.opacity = '0';
      badge.style.transform = 'scale(0.8)';
    }

    setTimeout(() => {
      if (badge) badge.style.display = 'none';
      if (drawer) drawer.style.display = 'none';
    }, 300);

    this.pendingTip = null;
    this._currentStarred = false;
  }

  // ---- STAGE DEFINITIONS ----

  analyzeStage1_Specificity(text) {
    const vague = ['something', 'stuff', 'whatever', 'anything', 'things', 'it', 'this thing'];
    const words = text.trim().split(/\s+/);
    const hasVague = vague.some(v => text.toLowerCase().includes(v));
    const tooShort = words.length < 5;
    if (tooShort || hasVague) {
      return { pass: false, tipId: 'stage1-vague', tip: "Quick tip: the more specific you are (what exactly, which one, how many), the better the answer you'll get back." };
    }
    return { pass: true };
  }

  analyzeStage2_ContextUpfront(text) {
    const startsWithBareAsk = /^(do|make|fix|write|create|add|change)\b/i.test(text.trim());
    const hasContextWords = /(because|since|so that|for my|i'm working on|i need this for)/i.test(text);
    if (startsWithBareAsk && !hasContextWords) {
      return { pass: false, tipId: 'stage2-context', tip: "Next time you can lead with a little context first — like what you're trying to achieve — before the actual ask. It helps a lot." };
    }
    return { pass: true };
  }

  analyzeStage3_OneClearAsk(text) {
    const andCount = (text.match(/\band then\b|\balso\b|\bplus\b/gi) || []).length;
    const questionMarks = (text.match(/\?/g) || []).length;
    if (andCount >= 2 || questionMarks >= 2) {
      return { pass: false, tipId: 'stage3-bundled', tip: "By the way, breaking this into separate messages — one ask at a time — usually gets you cleaner results than bundling several requests together." };
    }
    return { pass: true };
  }

  analyzeStage4_DesiredOutcome(text) {
    const hasOutcome = /(so that|so it|the goal is|result should|end up with|i want it to)/i.test(text);
    if (!hasOutcome && text.split(/\s+/).length > 8) {
      return { pass: false, tipId: 'stage4-outcome', tip: "Try describing what you want the end result to look or feel like, not just the steps — it gives you a much clearer target to aim for." };
    }
    return { pass: true };
  }

  analyzeStage5_Iterating(text, previousReply) {
    if (!previousReply) return { pass: true };
    const vagueFeedback = /^(no|wrong|try again|that's not it|nope)\.?$/i.test(text.trim());
    if (vagueFeedback) {
      return { pass: false, tipId: 'stage5-feedback', tip: "Quick tip: instead of just 'try again', pointing out exactly what was wrong or what you'd change gets you there faster." };
    }
    return { pass: true };
  }

  // ---- MAIN ENTRY POINT ----

  evaluate(text, { previousReply } = {}) {
    if (!text || text.trim().split(/\s+/).length < 3) return;

    const stageAnalyzers = [
      this.analyzeStage1_Specificity.bind(this),
      this.analyzeStage2_ContextUpfront.bind(this),
      this.analyzeStage3_OneClearAsk.bind(this),
      this.analyzeStage4_DesiredOutcome.bind(this),
      (t) => this.analyzeStage5_Iterating(t, previousReply),
    ];

    const currentStage = Math.min(this.state.stage, 5);
    const result = stageAnalyzers[currentStage - 1](text);
    if (!result) return;

    if (!result.pass) {
      this.show(result.tipId, result.tip);
      this.state.streak = 0;
    } else {
      this.state.streak = (this.state.streak || 0) + 1;
      if (this.state.streak >= 4 && this.state.stage < 5) {
        this.state.stage += 1;
        this.state.streak = 0;
      }
    }
    this.saveState();
  }

  // ---- GENERIC ATTACH API ----

  /** Record a user prompt from any UI (agent chat, etc.) and feed it through
   *  the stage/streak evaluator. Safe no-op for empty/very short input. */
  recordPrompt(text) {
    if (!text || typeof text !== 'string') return;
    try {
      this.evaluate(text, {});
    } catch (e) {
      /* Never break the caller if evaluation throws */
      if (this.show) {
        try { this.show('record-prompt-error', 'Coach evaluation paused.'); } catch (_) {}
      }
      console.warn('[MateyCoach] recordPrompt evaluation failed:', e);
    }
  }

  attach(inputEl, { onSubmitEvent = 'keydown', getPreviousReply = () => null } = {}) {
    if (!inputEl) return;
    inputEl.addEventListener(onSubmitEvent, (e) => {
      if (onSubmitEvent === 'keydown' && e.key !== 'Enter') return;
      const text = inputEl.value || inputEl.innerText || '';
      this.evaluate(text, { previousReply: getPreviousReply() });
    });
  }
}

export const mateyCoach = new MateyCoach();
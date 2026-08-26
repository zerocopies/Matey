export class MateyCoach {
  constructor() {
    this.state = this.loadState();
    this.shownTipIds = new Set(this.state.shownTipIds || []);
    this.pendingTip = null;
    this.dragState = { dragging: false, offsetX: 0, offsetY: 0 };
    this.posKey = 'matey_coach_badge_pos';
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
      <div id="coach-badge" style="position:fixed; bottom:${pos.bottom}px; right:${pos.right}px; width:26px; height:26px; background:transparent; border:none; border-radius:50%; display:none; align-items:center; justify-content:center; z-index:200; -webkit-tap-highlight-color:transparent; touch-action:none; cursor:grab; box-shadow:0 1px 3px rgba(0,0,0,0.15);">
        <span style="font-size:16px; line-height:1; display:block; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">💡</span>
        <div id="coach-tooltip" style="position:absolute; bottom:40px; right:0; transform:translateX(0); background:#0D0D0D; border:1px solid #2A2A2A; border-radius:12px; padding:14px 16px; min-width:220px; max-width:280px; color:#FFFFFF; font-family:inherit; font-size:13px; line-height:1.5; color:#B3B3B3; display:none; box-shadow:0 10px 30px rgba(0,0,0,0.5); z-index:201; text-align:left;">
          <div style="font-size:10px; color:#B583FC; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">Quick Tip</div>
          <div id="coach-tip-text"></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const badge = document.getElementById('coach-badge');
    const tooltip = document.getElementById('coach-tooltip');

    if (badge && tooltip) {
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
        const tip = this.pendingTip;
        if (tip) {
          const tipText = document.getElementById('coach-tip-text');
          if (tipText) tipText.innerText = tip.message;
          tooltip.style.display = tooltip.style.display === 'block' ? 'none' : 'block';
          if (tooltip.style.display === 'block') {
            this.shownTipIds.add(tip.tipId);
            this.saveState();
            clearTimeout(this._tooltipTimer);
            this._tooltipTimer = setTimeout(() => {
              tooltip.style.display = 'none';
            }, 30000);
          }
        }
      };
      badge.addEventListener('click', this._badgeClick);

      document.addEventListener('click', this._outsideClick);
      this._outsideClick = () => {
        if (tooltip) tooltip.style.display = 'none';
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
    this.pendingTip = { tipId, message };
    if (!document.getElementById('coach-badge')) this.initUI();

    const badge = document.getElementById('coach-badge');
    if (badge) {
      const pos = this.loadPosition();
      badge.style.bottom = pos.bottom + 'px';
      badge.style.right = pos.right + 'px';
      badge.style.display = 'flex';
      clearTimeout(this._autoHideTimer);
      this._autoHideTimer = setTimeout(() => {
        if (this.pendingTip && this.pendingTip.tipId === tipId) {
          badge.style.display = 'none';
          this.pendingTip = null;
        }
      }, 60000);
    }
  }

  hide() {
    clearTimeout(this._autoHideTimer);
    clearTimeout(this._tooltipTimer);
    const badge = document.getElementById('coach-badge');
    const tooltip = document.getElementById('coach-tooltip');
    if (badge) badge.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
    this.pendingTip = null;
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
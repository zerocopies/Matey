export class MateyCoach {
  constructor() {
    this.state = this.loadState();
    this.shownTipIds = new Set(this.state.shownTipIds || []);
    this.pendingTip = null;
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

  initUI() {
    if (document.getElementById('coach-badge')) return;

    const html = `
      <div id="coach-badge" style="position:fixed; bottom:200px; right:20px; width:32px; height:32px; background:#F2C94C; border:2px solid #0D0D0D; border-radius:50%; box-shadow:0 2px 8px rgba(0,0,0,0.3); cursor:pointer; display:none; align-items:center; justify-content:center; z-index:200; -webkit-tap-highlight-color:transparent; touch-action:manipulation;">
        <span style="font-size:18px; line-height:1;">💡</span>
        <div id="coach-tooltip" style="position:absolute; bottom:48px; right:0; background:#0D0D0D; border:1px solid #2A2A2A; border-radius:12px; padding:14px 16px; min-width:240px; max-width:300px; color:#FFFFFF; font-family:inherit; font-size:13px; line-height:1.5; color:#B3B3B3; display:none; box-shadow:0 10px 30px rgba(0,0,0,0.5); z-index:201; text-align:right;">
          <div style="font-size:10px; color:#F2C94C; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">Quick Tip</div>
          <div id="coach-tip-text"></div>
          <div style="position:absolute; top:100%; right:12px; width:0; height:0; border-left:6px transparent; border-right:6px transparent; border-top:6px solid #2A2A2A;"></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const badge = document.getElementById('coach-badge');
    const tooltip = document.getElementById('coach-tooltip');
    if (badge && tooltip) {
      badge.removeEventListener('click', this._badgeClick);
      this._badgeClick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const tip = this.pendingTip;
        if (tip) {
          const tipText = document.getElementById('coach-tip-text');
          if (tipText) tipText.innerText = tip.message;
          tooltip.style.display = tooltip.style.display === 'block' ? 'none' : 'block';
          if (tooltip.style.display === 'block') {
            this.shownTipIds.add(tip.tipId);
            this.saveState();
            clearTimeout(this._badgeTimer);
            this._badgeTimer = setTimeout(() => {
              tooltip.style.display = 'none';
              badge.style.display = 'none';
              this.pendingTip = null;
            }, 20000);
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

  show(tipId, message) {
    if (this.shownTipIds.has(tipId)) return;
    this.pendingTip = { tipId, message };
    if (!document.getElementById('coach-badge')) this.initUI();

    const badge = document.getElementById('coach-badge');
    if (badge) {
      badge.style.display = 'flex';
      clearTimeout(this._autoHideTimer);
      this._autoHideTimer = setTimeout(() => {
        if (this.pendingTip && this.pendingTip.tipId === tipId) {
          badge.style.display = 'none';
          this.pendingTip = null;
        }
      }, 5000);
    }
  }

  hide() {
    clearTimeout(this._autoHideTimer);
    clearTimeout(this._badgeTimer);
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
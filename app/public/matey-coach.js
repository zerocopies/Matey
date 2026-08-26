export class MateyCoach {
  constructor() {
    this.state = this.loadState();
    this.shownTipIds = new Set(this.state.shownTipIds || []);
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
    if (document.getElementById('coach-toast')) return;
    const html = `
      <div id="coach-toast" style="position:fixed; top:140px; left:16px; right:16px; max-width:340px; background:#0D0D0D; border:1px solid #2A2A2A; border-radius:16px; padding:16px; color:#FFFFFF; font-family:inherit; transform:translateY(-150%); transition:transform 0.35s cubic-bezier(0.175,0.885,0.32,1.275); z-index:10001; box-shadow:0 10px 30px rgba(0,0,0,0.5); display:flex; gap:12px; align-items:start;">
        <div style="font-size:20px;">💡</div>
        <div style="flex:1;">
          <div style="font-size:11px; color:#F2C94C; font-weight:700; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.6px;">Quick Tip</div>
          <div id="coach-message" style="font-size:14px; line-height:1.4; color:#B3B3B3;"></div>
        </div>
        <button id="coach-close" style="background:none; border:none; color:#6B6B6B; font-size:20px; cursor:pointer; padding:0; line-height:1; -webkit-tap-highlight-color:transparent; touch-action:manipulation;">✕</button>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const closeBtn = document.getElementById('coach-close');
    if (closeBtn) {
      closeBtn.removeEventListener('click', this._closeHandler);
      this._closeHandler = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.hide();
      };
      closeBtn.addEventListener('click', this._closeHandler);
    }
  }

  show(tipId, message) {
    if (this.shownTipIds.has(tipId)) return;
    this.shownTipIds.add(tipId);
    this.saveState();
    if (!document.getElementById('coach-message')) this.initUI();
    const toast = document.getElementById('coach-toast');
    const msg = document.getElementById('coach-message');
    if (msg) msg.innerText = message;
    if (toast) {
      toast.style.transform = 'translateY(0)';
      clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => this.hide(), 9000);
    }
  }

  hide() {
    clearTimeout(this._hideTimer);
    const el = document.getElementById('coach-toast');
    if (el) el.style.transform = 'translateY(-150%)';
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
      return { pass: false, tipId: 'stage4-outcome', tip: "Try describing what you want the end result to look or feel like, not just the steps — it gives a much clearer target to aim for." };
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

/* Matey Prompt Coach — 5-stage skill progression
   Stages: Specificity → Context → One Ask → Outcome → Iterate
   Progression: detect improvement in current stage, then quietly advance
   Delivery: one dismissible banner at natural pauses, never repeats
*/
(function () {
  'use strict';

  var STATE_KEY = 'matey-coach-state';
  var PROMPT_LOG_KEY = 'matey-coach-prompts';
  var MIN_PROMPTS_BEFORE_TIPS = 3;
  var MIN_INTERVAL = 40000;

  var state = {
    stage: 0,
    lastTipTime: 0,
    tipsShown: []
  };

  /* ---- State persistence ---- */
  function loadState() {
    try {
      var s = localStorage.getItem(STATE_KEY);
      if (s) {
        var parsed = JSON.parse(s);
        state.stage = typeof parsed.stage === 'number' ? parsed.stage : 0;
        state.lastTipTime = typeof parsed.lastTipTime === 'number' ? parsed.lastTipTime : 0;
        state.tipsShown = Array.isArray(parsed.tipsShown) ? parsed.tipsShown : [];
      }
    } catch (e) {}
  }
  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function loadPrompts() {
    try { return JSON.parse(localStorage.getItem(PROMPT_LOG_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function savePrompts(arr) {
    try { localStorage.setItem(PROMPT_LOG_KEY, JSON.stringify(arr.slice(-30))); } catch (e) {}
  }

  /* ---- 5-Stage Skill Progression ---- */
  var STAGES = [
    {
      id: 'specificity',
      detect: function (text) {
        var t = text.trim().toLowerCase();
        var words = t.split(/\s+/).filter(Boolean);
        var vagueStarts = /^(help|do|fix|make|give|write|tell|show|explain)\b/;
        var vagueOnly = /^(help|fix it|do something|make it|give me)\s*$/i;
        return words.length < 10 || vagueStarts.test(t) && words.length < 15 || vagueOnly.test(text.trim());
      },
      improve: function (text) {
        var words = text.trim().split(/\s+/).filter(Boolean);
        if (words.length >= 10) return true;
        var vagueStarts = /^(help|do|fix|make|give|write|tell|show|explain)\b/;
        return !vagueStarts.test(text.trim().toLowerCase());
      },
      tip: "Hey, I noticed that was pretty short. The more you tell me about what you need, the better I can help you.",
      example: "Instead of 'help me' try 'I need to write a quick summary of my meeting notes for my team.'"
    },
    {
      id: 'context',
      detect: function (text) {
        var t = text.trim().toLowerCase();
        var words = t.split(/\s+/).filter(Boolean);
        if (words.length < 10) return false;
        var contextWords = ['context', 'background', 'situation', 'for ', 'need', 'want', 'audience', 'purpose', 'trying', 'working', 'goal', 'project', 'team', 'client', 'deadline'];
        var hasContext = contextWords.some(function (w) { return t.indexOf(w) !== -1; });
        return words.length >= 10 && words.length < 25 && !hasContext;
      },
      improve: function (text) {
        var t = text.toLowerCase();
        var contextWords = ['context', 'background', 'situation', 'for ', 'need', 'want', 'audience', 'purpose', 'trying', 'working', 'goal', 'project', 'team', 'client', 'deadline'];
        var hasContext = contextWords.some(function (w) { return t.indexOf(w) !== -1; });
        return hasContext;
      },
      tip: "A bit of background goes a long way. Just telling me what you're working on or who it's for helps me give you something that actually fits.",
      example: "Like 'I'm writing a blog post for developers' or 'This is for a client presentation.'"
    },
    {
      id: 'one_ask',
      detect: function (text) {
        var sentences = text.trim().split(/[.!?]+/).filter(function (s) { return s.trim().length > 3; });
        return sentences.length >= 3;
      },
      improve: function (text) {
        var sentences = text.trim().split(/[.!?]+/).filter(function (s) { return s.trim().length > 3; });
        return sentences.length <= 2;
      },
      tip: "You had a few ideas in there — that's fine! For faster, more focused answers, try asking one thing at a time. I'll pick up right where we left off.",
      example: "If you need both a summary and action items, send them in two messages."
    },
    {
      id: 'outcome',
      detect: function (text) {
        var t = text.toLowerCase();
        var outcomeWords = ['format', 'length', 'tone', 'style', 'like', 'similar to', 'example', 'bullet', 'list', 'table', 'short', 'long', 'brief', 'detailed', 'casual', 'formal', 'friendly', 'professional'];
        var startsOpen = (t.indexOf('how') === 0 || t.indexOf('what') === 0 || t.indexOf('can you') !== -1 || t.indexOf('could you') !== -1);
        return startsOpen && !outcomeWords.some(function (w) { return t.indexOf(w) !== -1; });
      },
      improve: function (text) {
        var t = text.toLowerCase();
        var outcomeWords = ['format', 'length', 'tone', 'style', 'like', 'similar to', 'example', 'bullet', 'list', 'table', 'short', 'long', 'brief', 'detailed', 'casual', 'formal', 'friendly', 'professional'];
        return outcomeWords.some(function (w) { return t.indexOf(w) !== -1; });
      },
      tip: "If you know what you want it to look like, just tell me. 'Give me 3 bullet points' or 'write a short email' — I'll match that exactly.",
      example: "Try saying 'in 3 quick bullet points' or 'as a brief email to my team.'"
    },
    {
      id: 'iterate',
      detect: function (text) {
        var prompts = loadPrompts();
        if (prompts.length < 2) return false;
        var prev = prompts[prompts.length - 2];
        if (!prev || !prev.text) return false;
        var prevWords = prev.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
        var curWords = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (prevWords.length === 0 || curWords.length === 0) return false;
        var overlap = prevWords.filter(function (w) { return curWords.indexOf(w) !== -1; }).length;
        var similarity = overlap / Math.max(prevWords.length, curWords.length);
        return similarity > 0.6 && prev.text.trim().length > text.trim().length;
      },
      improve: function (text) {
        var t = text.toLowerCase();
        var refineWords = ['make it', 'more', 'less', 'change', 'instead', 'but', 'however', 'tweak', 'adjust', 'better', 'shorter', 'longer', 'clearer'];
        return refineWords.some(function (w) { return t.indexOf(w) !== -1; });
      },
      tip: "You don't need to say everything again. Just tell me what to change from the last response, and I'll adjust it right away.",
      example: "Like 'make that more concise' or 'try a friendlier tone this time.'"
    }
  ];

  /* ---- Prompt logging & analysis ---- */
  function logPrompt(text) {
    var prompts = loadPrompts();
    prompts.push({ text: text, time: Date.now() });
    savePrompts(prompts);
  }

  function checkImprovement(currentStage) {
    var prompts = loadPrompts();
    if (prompts.length < 3) return false;
    var stage = STAGES[currentStage];
    if (!stage || !stage.improve) return false;
    var recent = prompts.slice(-3);
    var improved = recent.map(function (p) { return stage.improve(p.text); });
    return improved.filter(Boolean).length >= 2;
  }

  function maybeAdvanceStage() {
    var currentStage = state.stage;
    if (currentStage >= STAGES.length - 1) return false;
    if (!checkImprovement(currentStage)) return false;
    state.stage++;
    saveState();
    return true;
  }

  function currentStageInfo() {
    return STAGES[Math.min(state.stage, STAGES.length - 1)];
  }

  function maybeShowTip(text) {
    logPrompt(text);

    var prompts = loadPrompts();
    if (prompts.length < MIN_PROMPTS_BEFORE_TIPS) return;

    if (Date.now() - state.lastTipTime < MIN_INTERVAL) return;

    maybeAdvanceStage();

    var stage = currentStageInfo();
    if (!stage || !stage.detect || !stage.tip) return;

    if (state.tipsShown.indexOf(stage.id) !== -1) return;

    if (!stage.detect(text)) return;

    state.tipsShown.push(stage.id);
    state.lastTipTime = Date.now();
    saveState();

    showCoachBanner(stage.tip, stage.example);
  }

  /* ---- Banner display ---- */
  function showCoachBanner(tipText, exampleText) {
    removeExistingBanner();

    var banner = document.createElement('div');
    banner.className = 'coach-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    var icon = document.createElement('span');
    icon.className = 'coach-banner-icon';
    icon.textContent = '💡';

    var content = document.createElement('div');
    content.className = 'coach-banner-content';

    var tip = document.createElement('div');
    tip.className = 'coach-banner-tip';
    tip.textContent = tipText;

    var example = document.createElement('div');
    example.className = 'coach-banner-example';
    example.textContent = exampleText;

    content.appendChild(tip);
    content.appendChild(example);

    var dismiss = document.createElement('button');
    dismiss.className = 'coach-banner-dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss tip');
    dismiss.innerHTML = '×';

    var dismissFn = function () {
      banner.classList.add('coach-banner-hiding');
      setTimeout(function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      }, 200);
    };

    dismiss.addEventListener('click', dismissFn);

    banner.appendChild(icon);
    banner.appendChild(content);
    banner.appendChild(dismiss);

    var target = document.querySelector('.agent-chat') ||
                 document.querySelector('.content') ||
                 document.querySelector('.md-composer') ||
                 document.body;

    target.insertBefore(banner, target.firstChild);

    setTimeout(function () {
      var closeFn = function () {
        dismissFn();
        document.removeEventListener('touchstart', closeFn);
        document.removeEventListener('click', closeFn);
      };
      setTimeout(closeFn, 12000);
    }, 100);
  }

  function removeExistingBanner() {
    var existing = document.querySelector('.coach-banner');
    if (existing) {
      existing.classList.add('coach-banner-hiding');
      setTimeout(function () {
        if (existing.parentNode) existing.parentNode.removeChild(existing);
      }, 200);
    }
  }

  /* ---- Public API ---- */
  function recordPrompt(text) {
    if (typeof MateyBehavior !== 'undefined' && typeof MateyBehavior.record === 'function') {
      MateyBehavior.record('user_prompt', { text: text });
    }
    maybeShowTip(text);
  }

  function resetCoach() {
    state.stage = 0;
    state.lastTipTime = 0;
    state.tipsShown = [];
    saveState();
    savePrompts([]);
  }

  function getState() {
    return { stage: state.stage, tipsShown: state.tipsShown, promptCount: loadPrompts().length };
  }

  var api = {
    recordPrompt: recordPrompt,
    resetCoach: resetCoach,
    getState: getState,
    STAGES: STAGES
  };

  if (typeof window !== 'undefined') {
    window.MateyCoach = api;
  }

  loadState();

  /* ---- Auto-hook into MateyBehavior if available ---- */
  if (typeof window !== 'undefined' && window.MateyBehavior && typeof MateyBehavior.record === 'function') {
  var origRecord = MateyBehavior.record;
  var inAutoHook = false;
  MateyBehavior.record = function (type, data) {
    origRecord(type, data);
    if (inAutoHook) return;
    if (type === 'user_prompt' && data && data.text) {
      inAutoHook = true;
      recordPrompt(data.text);
      inAutoHook = false;
    }
  };
  }

  /* ---- Auto-hook into input events across the app ---- */
  function hookInputs() {
    var submitBtn = document.getElementById('md-send');
    if (submitBtn && !submitBtn.hasAttribute('data-coach-wired')) {
      submitBtn.setAttribute('data-coach-wired', 'true');
      submitBtn.addEventListener('click', function () {
        var input = document.getElementById('md-compose-input');
        if (input && input.value.trim()) {
          recordPrompt(input.value.trim());
        }
      });
    }

    var journalSave = document.getElementById('journal-save-btn');
    if (journalSave && !journalSave.hasAttribute('data-coach-wired')) {
      journalSave.setAttribute('data-coach-wired', 'true');
      journalSave.addEventListener('click', function () {
        var contentInput = document.getElementById('journal-content-input');
        if (contentInput && contentInput.value.trim()) {
          recordPrompt(contentInput.value.trim());
        }
        var titleInput = document.getElementById('journal-title-input');
        if (titleInput && titleInput.value.trim()) {
          recordPrompt(titleInput.value.trim());
        }
      });
    }

    var votsSave = document.getElementById('vots-save-btn');
    if (votsSave && !votsSave.hasAttribute('data-coach-wired')) {
      votsSave.setAttribute('data-coach-wired', 'true');
      votsSave.addEventListener('click', function () {
        var textArea = document.getElementById('vots-textarea');
        if (textArea && textArea.value.trim()) {
          recordPrompt(textArea.value.trim());
        }
      });
    }

    var mdSend = document.getElementById('md-send');
    if (mdSend && !mdSend.hasAttribute('data-coach-wired-md')) {
      mdSend.setAttribute('data-coach-wired-md', 'true');
      mdSend.addEventListener('click', function () {
        var input = document.getElementById('md-compose-input');
        if (input && input.value.trim()) {
          recordPrompt(input.value.trim());
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookInputs);
  } else {
    hookInputs();
  }

  /* ---- Also hook into keypress for Enter submission ---- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      var active = document.activeElement;
      if (active && active.tagName === 'TEXTAREA' && active.value.trim()) {
        recordPrompt(active.value.trim());
      }
    }
  });

})();

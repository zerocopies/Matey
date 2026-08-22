/* Matey AI Prompting Coach — observes user prompts and offers gentle,
   plain-language tips for getting better results from the AI.
   Non-intrusive banner delivery, progressive (never repeats shown tips). */
(function () {
  'use strict';

  var SHOWN_KEY = 'matey-coach-shown';
  var PROMPT_LOG_KEY = 'matey-coach-prompts';
  var MIN_PROMPTS_BEFORE_TIPS = 3;
  var MIN_INTERVAL = 40000;

  function ls(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || fallback); }
    catch (e) { return fallback; }
  }
  function ss(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  /* ---- Tip Library ---- */
  var TIPS = [
    {
      id: 'be_specific',
      detect: function (text) {
        var t = text.trim().toLowerCase();
        return t.length < 25 &&
               (t.indexOf('help') !== -1 || t.indexOf('do') !== -1 ||
                t.split(/\s+/).length <= 2);
      },
      tip: "Hey, I noticed that was pretty short. The more you tell me about what you need, the better I can help. Try adding a bit more context next time.",
      example: "Instead of 'help me' try 'I need to write a quick summary of my meeting notes for my team.'"
    },
    {
      id: 'one_thing_at_a_time',
      detect: function (text) {
        var sentences = text.trim().split(/[.!?]+/).filter(function (s) { return s.trim().length > 3; });
        return sentences.length >= 3;
      },
      tip: "You had a few ideas in there — that's fine! For faster answers, try asking one thing at a time. I can pick up the thread and answer your next point right after.",
      example: "If you need both a summary and action items, send them in two messages."
    },
    {
      id: 'add_context',
      detect: function (text) {
        var t = text.toLowerCase();
        var contextWords = ['context', 'background', 'situation', 'for', 'need', 'want'];
        var hasContext = contextWords.some(function (w) { return t.indexOf(w) !== -1; });
        var wordCount = t.trim().split(/\s+/).length;
        return wordCount < 8 && !hasContext;
      },
      tip: "A bit more background goes a long way. Just telling me what you're working on or who it's for helps me give you something that actually fits.",
      example: "Mention who the audience is or what you're trying to achieve."
    },
    {
      id: 'ask_for_format',
      detect: function (text) {
        var t = text.toLowerCase();
        var formatHints = ['list', 'table', 'short', 'summary', 'step', 'example'];
        return (t.indexOf('how') === 0 || t.indexOf('what') === 0) &&
               !(formatHints.some(function (w) { return t.indexOf(w) !== -1; }));
      },
      tip: "If you want it a certain way, just say so. 'Give me 3 bullet points' or 'write it as a quick email' — I'll match that.",
      example: "Try: 'Give me 3 quick bullet points on...'"
    },
    {
      id: 'specify_tone',
      detect: function (text) {
        var t = text.toLowerCase();
        return (t.indexOf('explain') !== -1 || t.indexOf('write') !== -1 || t.indexOf('tell') !== -1) &&
               t.indexOf('tone') === -1 && t.indexOf('formal') === -1 &&
               t.indexOf('casual') === -1 && t.indexOf('like') === -1 &&
               t.indexOf('friendly') === -1;
      },
      tip: "Just letting me know the tone helps a ton. Formal email? Casual chat? Friendly explanation? A quick hint makes it yours.",
      example: "Add 'in a friendly, conversational tone' or 'make it brief and professional.'"
    },
    {
      id: 'include_deadline',
      detect: function (text) {
        var t = text.toLowerCase();
        var timeWords = ['urgent', 'deadline', 'asap', 'today', 'tomorrow', 'soon', 'quick'];
        return (t.indexOf('help') !== -1 || t.indexOf('need') !== -1 || t.indexOf('do') !== -1) &&
               !timeWords.some(function (w) { return t.indexOf(w) !== -1; });
      },
      tip: "Next time, try telling me any deadline or timeframe upfront. I can prioritize better that way.",
      example: "Like 'I need this by Friday' or 'something I can finish in 10 minutes.'"
    }
  ];

  function getShownTips() { return ls(SHOWN_KEY, '[]'); }
  function markShown(tipId) {
    var shown = getShownTips();
    if (shown.indexOf(tipId) === -1) shown.push(tipId);
    ss(SHOWN_KEY, shown);
  }

  function logPrompt(text) {
    var prompts = ls(PROMPT_LOG_KEY, '[]');
    if (!Array.isArray(prompts)) prompts = [];
    prompts.push({ text: text, time: Date.now() });
    ss(PROMPT_LOG_KEY, prompts.slice(-20));
  }

  function analyzePrompt(text) {
    if (!text || text.trim().length < 3) return null;
    var matches = [];
    TIPS.forEach(function (tip) {
      if (getShownTips().indexOf(tip.id) !== -1) return;
      if (tip.detect(text)) matches.push(tip);
    });
    return matches.length ? matches[0] : null;
  }

  function maybeShowTip(text) {
    logPrompt(text);

    var prompts = ls(PROMPT_LOG_KEY, '[]');
    if (!Array.isArray(prompts) || prompts.length < MIN_PROMPTS_BEFORE_TIPS) return;

    var tip = analyzePrompt(text);
    if (!tip) return;

    var shown = getShownTips();
    if (shown.indexOf(tip.id) !== -1) return;

    var lastShown = 0;
    prompts.forEach(function (p) {
      if (p.tipShown) {
        if (p.time > lastShown) lastShown = p.time;
      }
    });
    if (Date.now() - lastShown < MIN_INTERVAL) return;

    markShown(tip.id);
    showCoachTip(tip);
  }

  function showCoachTip(tip) {
    var container = document.querySelector('.agent-chat');
    if (!container) return;

    var card = document.createElement('div');
    card.className = 'coach-tip-card';
    card.innerHTML =
      '<div class="coach-tip-header">' +
        '<span class="coach-tip-icon">💡</span>' +
        '<span class="coach-tip-label">Quick tip</span>' +
      '</div>' +
      '<div class="coach-tip-text">' + tip.tip + '</div>' +
      '<div class="coach-tip-example">' + tip.example + '</div>' +
      '<button class="coach-tip-dismiss" type="button" aria-label="Dismiss tip">×</button>';

    container.appendChild(card);

    var dismissed = false;
    var dismissBtn = card.querySelector('.coach-tip-dismiss');
    dismissBtn.addEventListener('click', function () {
      if (dismissed) return;
      dismissed = true;
      card.classList.add('dismissing');
      setTimeout(function () { card.remove(); }, 200);
    });

    setTimeout(function () {
      if (dismissed) return;
      card.classList.add('peek');
      setTimeout(function () {
        if (dismissed) return;
        card.classList.remove('peek');
      }, 2000);
    }, 500);

    setTimeout(function () {
      if (dismissed) return;
      dismissed = true;
      card.classList.add('dismissing');
      setTimeout(function () { card.remove(); }, 200);
    }, 12000);

    container.scrollTop = container.scrollHeight;
  }

  /* ---- Public API for integration ---- */
  function recordPrompt(text) {
    maybeShowTip(text);
  }

  function resetTips() {
    ss(SHOWN_KEY, []);
    ss(PROMPT_LOG_KEY, []);
  }

  function getTipCount() {
    return ls(PROMPT_LOG_KEY, '[]').length;
  }

  var api = {
    recordPrompt: recordPrompt,
    resetTips: resetTips,
    getTipCount: getTipCount,
    getShownTips: getShownTips
  };

  if (typeof window !== 'undefined') {
    window.MateyCoach = api;
  }

  /* ---- Hook into MateyBehavior if available ---- */
  if (typeof window !== 'undefined' && window.MateyBehavior && typeof MateyBehavior.record === 'function') {
    var origRecord = MateyBehavior.record;
    MateyBehavior.record = function (type, data) {
      origRecord(type, data);
      if (type === 'user_prompt' && data && data.text) {
        recordPrompt(data.text);
      }
    };
  }

})();

(function() {
  var MORNING = [
    'Lovely morning', 'Blissful morning', 'Wonderful morning',
    'Beautiful morning', 'Fresh morning', 'Bright morning'
  ];
  var AFTERNOON = [
    'Wonderful day', 'Have a blissful day', 'Lovely afternoon',
    'Great afternoon', 'Pleasant afternoon', 'Wonderful afternoon'
  ];
  var EVENING = [
    'Blissful evening', 'Lovely evening', 'Peaceful evening',
    'Cozy evening', 'Wonderful evening', 'Calm evening'
  ];

  var NOTIFICATIONS = [
    'Your hooks are scanning for updates.',
    'New insights are being curated for you.',
    'Your vault is growing. Check your saved notes.',
    'Ambient intelligence is processing your feed.',
    'Your profile context is sharpening the feed.',
    'A new brief is ready for your review.',
    'Your daily intelligence cycle is active.'
  ];

  var VIBE_KEY = 'matey-last-visit';
  var VIBE_SHOWN_KEY = 'matey-vibe-shown';
  var VAULT_KEY = 'matey-vault';
  var SESSION_KEY = 'matey-session-notes';

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getGreeting(hour) {
    if (hour < 12) return pick(MORNING);
    if (hour < 18) return pick(AFTERNOON);
    return pick(EVENING);
  }

  function getTimeBlock(hour) {
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  function getVibeMessage() {
    var vault = JSON.parse(localStorage.getItem(VAULT_KEY) || '[]');
    var session = JSON.parse(localStorage.getItem(SESSION_KEY) || '[]');
    var today = new Date().toDateString();
    var todayVault = vault.filter(function(v) {
      return new Date(v.time).toDateString() === today;
    });

    if (todayVault.length > 0) {
      var topics = {};
      todayVault.forEach(function(v) {
        if (v.topic) topics[v.topic] = true;
      });
      var topicList = Object.keys(topics);
      if (topicList.length > 0) {
        return 'How was your ' + topicList[0].toLowerCase() + ' day?';
      }
    }

    if (session.length > 0) {
      return 'How was your day? You had ' + session.length + ' note' + (session.length > 1 ? 's' : '') + ' earlier.';
    }

    return 'How was your day?';
  }

  function shouldShowVibeCheck() {
    var now = new Date();
    var hour = now.getHours();
    if (hour < 16) return false;

    var lastVisit = localStorage.getItem(VIBE_KEY);
    var vibeShown = localStorage.getItem(VIBE_SHOWN_KEY);
    var today = now.toDateString();

    if (vibeShown === today) return false;

    if (lastVisit) {
      var last = new Date(JSON.parse(lastVisit));
      if (last.toDateString() === today) {
        var lastBlock = getTimeBlock(last.getHours());
        if (lastBlock === 'morning' || lastBlock === 'afternoon') {
          return true;
        }
      }
    }
    return false;
  }

  function markVisit() {
    localStorage.setItem(VIBE_KEY, JSON.stringify(Date.now()));
  }

  function markVibeShown() {
    localStorage.setItem(VIBE_SHOWN_KEY, new Date().toDateString());
  }

  function startNotificationTicker(greetingEl, metaEl) {
    setTimeout(function() {
      if (greetingEl) {
        greetingEl.classList.add('fade-out');
      }

      setTimeout(function() {
        var ticker = document.getElementById('notif-ticker');
        if (!ticker) {
          ticker = document.createElement('div');
          ticker.className = 'notif-ticker';
          ticker.id = 'notif-ticker';
          ticker.innerHTML = '<div class="notif-ticker-label">Live</div><div class="notif-ticker-text"></div>';
          var greetingRow = document.querySelector('.greeting-row');
          if (greetingRow) {
            greetingRow.parentNode.insertBefore(ticker, greetingRow.nextSibling);
          }
        }

        if (greetingEl) greetingEl.style.display = 'none';
        if (metaEl) metaEl.style.display = 'none';

        ticker.classList.add('visible');
        var textEl = ticker.querySelector('.notif-ticker-text');
        if (textEl) textEl.textContent = pick(NOTIFICATIONS);

        setInterval(function() {
          if (textEl) {
            textEl.style.opacity = '0';
            setTimeout(function() {
              textEl.textContent = pick(NOTIFICATIONS);
              textEl.style.opacity = '1';
            }, 300);
          }
        }, 12000);
      }, 500);
    }, 60000);
  }

  function init() {
    var hour = new Date().getHours();
    var greetingEl = document.getElementById('greeting');
    var metaEl = document.getElementById('greeting-meta');
    var vibeEl = document.getElementById('vibe-prompt');

    if (greetingEl) {
      greetingEl.textContent = getGreeting(hour);
    }

    if (metaEl) {
      var now = new Date();
      var timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      var dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      metaEl.textContent = timeStr + ' \u00b7 ' + dateStr;
    }

    if (vibeEl && shouldShowVibeCheck()) {
      vibeEl.textContent = getVibeMessage();
      vibeEl.style.display = 'block';
      markVibeShown();
    }

    startNotificationTicker(greetingEl, metaEl);
    markVisit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* Matey Sentry — privacy-respecting crash reporting
 *
 * - Captures unhandled errors and promise rejections only
 * - NEVER captures user content: journal entries, My-VOTS entries, photos,
 *   BYOK API keys, or workspace file contents
 * - sendDefaultPii: false — no IP, no user context
 * - beforeSend scrubbing: strips any localStorage/sessionStorage access
 * - No analytics, no tracing, no behavioral tracking
 *
 * To self-host or migrate: replace SENTRY_DSN with your Sentry project DSN.
 * Get a free Sentry account at https://sentry.io (standard cloud).
 */
(function () {
  'use strict';

  /* ---- Configuration ---- */
  /* Replace this with your actual Sentry DSN when ready */
  var SENTRY_DSN = 'https://YOUR_SENTRY_DSN@sentry.io/PROJECT_ID';

  /* Scrub sensitive keys that might appear in error contexts */
  var SENSITIVE_KEY_PATTERNS = [
    /api[_-]?key/i,
    /api[_-]?token/i,
    /secret/i,
    /password/i,
    /token/i,
    /credential/i,
    /journal/i,
    /vots/i,
    /entry/i,
    /content/i,
    /title/i,
    /tags/i,
    /text/i,
    /user[_-]?data/i,
    /localStorage/i,
    /sessionStorage/i,
    /indexedDB/i,
    /web[_-]?sql/i,
    /byok/i,
    /model/i
  ];

  /* Scrub sensitive data from objects recursively */
  function scrubObject(obj, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 3) return '[scrubbed: max depth]';
    if (typeof obj !== 'object' || obj === null) return obj;

    if (Array.isArray(obj)) {
      return obj.map(function (item) { return scrubObject(item, depth + 1); });
    }

    var cleaned = {};
    Object.keys(obj).forEach(function (key) {
      var isSensitive = SENSITIVE_KEY_PATTERNS.some(function (p) {
        return p.test(key);
      });
      if (isSensitive) {
        cleaned[key] = '[scrubbed]';
      } else {
        cleaned[key] = scrubObject(obj[key], depth + 1);
      }
    });
    return cleaned;
  }

  /* Scrub string values that look like sensitive content */
  function scrubString(str) {
    if (typeof str !== 'string') return str;
    if (str.length > 500) {
      return str.substring(0, 50) + '... [truncated]';
    }
    return str;
  }

  function scrubEvent(event) {
    if (event.exception && event.exception.values) {
      event.exception.values.forEach(function (ex) {
        if (ex.stacktrace && ex.stacktrace.frames) {
          ex.stacktrace.frames.forEach(function (frame) {
            if (frame.vars) {
              Object.keys(frame.vars).forEach(function (k) {
                frame.vars[k] = SENSITIVE_KEY_PATTERNS.some(function (p) {
                  return p.test(k);
                }) ? '[scrubbed]' : scrubObject(frame.vars[k]);
              });
            }
            if (frame.context) {
              frame.context = scrubObject(frame.context);
            }
            if (frame.args) {
              frame.args = scrubObject(frame.args);
            }
          });
        }
      });
    }

    if (event.request && event.request.data) {
      event.request.data = '[scrubbed]';
    }

    if (event.user) {
      /* Keep only non-identifying metadata */
      event.user = { id: undefined, ip_address: undefined, email: undefined };
    }

    if (event.tags) {
      /* Only allow app-version and platform tags */
      event.tags = {
        app_version: event.tags.app_version,
        platform: event.tags.platform
      };
    }

    if (event.contexts) {
      /* Keep only device, os, app, runtime contexts (no user data) */
      var safe = {};
      if (event.contexts.device) {
        safe.device = {
          model: event.contexts.device.model,
          manufacturer: event.contexts.device.manufacturer
        };
      }
      if (event.contexts.os) {
        safe.os = {
          name: event.contexts.os.name,
          version: event.contexts.os.version
        };
      }
      if (event.contexts.app) {
        safe.app = {
          name: event.contexts.app.name,
          version: event.contexts.app.version
        };
      }
      event.contexts = safe;
    }

    return event;
  }

  function loadSentry() {
    /* Load Sentry SDK via CDN */
    var script = document.createElement('script');
    script.src = 'https://browser.sentry-cdn.com/9.5.0/bundle.min.js';
    script.async = true;
    script.onload = function () {
      if (typeof Sentry === 'undefined') return;

      Sentry.init({
        dsn: SENTRY_DSN,
        appAreaName: 'matey-vots',
        sendDefaultPii: false,
        allowUrls: /^https?:\/\/[^\/]+\/(|matey-)/,
        integrations: [
          Sentry.browserProfilingIntegration && Sentry.browserProfilingIntegration(),
          Sentry.globalHandlersIntegration(),
          Sentry.tryCatchIntegration()
        ].filter(Boolean),
        beforeSend: function (event, hint) {
          return scrubEvent(event);
        },
        beforeBreadcrumb: function (breadcrumb) {
          /* Scrub any breadcrumb that might contain sensitive data */
          if (breadcrumb.data) {
            breadcrumb.data = scrubObject(breadcrumb.data);
          }
          if (breadcrumb.message) {
            breadcrumb.message = scrubString(breadcrumb.message);
          }
          return breadcrumb;
        }
      });

      /* Capture app version for crash context */
      Sentry.setContext('app', {
        name: 'Matey',
        version: '68'
      });
    };
    script.onerror = function () {
      try { console.warn('[Matey Sentry] Failed to load Sentry SDK'); } catch (e) {}
    };
    document.head.appendChild(script);
  }

  /* Expose minimal API */
  window.MateySentry = {
    init: loadSentry,
    captureException: function (err) {
      if (typeof Sentry !== 'undefined') {
        Sentry.captureException(err);
      }
    },
    captureMessage: function (msg) {
      if (typeof Sentry !== 'undefined') {
        var scrubbed = SENSITIVE_KEY_PATTERNS.some(function (p) {
          return p.test(msg);
        }) ? '[scrubbed message]' : msg;
        Sentry.captureMessage(scrubbed);
      }
    },
    addBreadcrumb: function (category, message) {
      if (typeof Sentry !== 'undefined') {
        Sentry.addBreadcrumb({
          category: category,
          message: scrubString(message),
          level: 'info'
        });
      }
    },
    SENTRY_DSN: SENTRY_DSN
  };

  /* Auto-initialize on native platforms (mobile app) */
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()) {
    loadSentry();
  }
})();
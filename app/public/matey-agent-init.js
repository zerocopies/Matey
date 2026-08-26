/* Matey Agent Init — initializes the IDE and command palette on the Agent page
 * This script must be loaded AFTER the bundled matey-agent-bundle.js
 * since it depends on window.MateyIDE, window.CommandPalette, etc.
 */
(function () {
  'use strict';

  function initAgentIDE() {
    // Check if the agent bundle loaded successfully
    if (typeof window.MateyIDE === 'undefined' || typeof window.CommandPalette === 'undefined') {
      console.warn('[MateyAgentInit] Agent modules not available yet, retrying...');
      setTimeout(initAgentIDE, 100);
      return;
    }

    // Check if Capacitor Filesystem is available (from bundle)
    if (typeof window.Capacitor === 'undefined' || !window.Capacitor.Plugins) {
      console.warn('[MateyAgentInit] Capacitor not available');
    }

    // Check for CapacitorSAF bridge (provided by matey-saf.js)
    if (!window.CapacitorSAF) {
      console.warn('[MateyAgentInit] CapacitorSAF bridge not found — USB mode unavailable');
    }

    // Initialize the IDE if the container exists
    var ide = null;
    if (document.getElementById('ide-container')) {
      var apiKey = localStorage.getItem('matey_openai_key') || '';
      if (apiKey) {
        ide = new window.MateyIDE('ide-container', { apiKey: apiKey, baseUrl: 'https://api.openai.com', model: 'gpt-4o' });
      } else {
        // Try to get provider from MateyByok
        if (window.MateyByok && window.MateyByok.hasProviders()) {
          var provider = window.MateyByok.getProvider('text');
          if (provider) {
            ide = new window.MateyIDE('ide-container', provider);
          }
        }
      }

      if (ide) {
        // Wire up the command palette
        var palette = new window.CommandPalette(ide);
        window.MateyCmd = window.MateyCmd || {};
        window.MateyCmd.palette = palette;
        window.MateyCmd.ide = ide;

        console.log('[MateyAgentInit] IDE and Command Palette initialized');

        // If there's a pending command (e.g., from URL hash), process it
        var hash = window.location.hash || '';
        if (hash.indexOf('#agent:') === 0) {
          var cmd = decodeURIComponent(hash.substring(7));
          setTimeout(function () {
            ide.askAgent(cmd);
          }, 100);
        }
      } else {
        console.warn('[MateyAgentInit] No API key found — IDE not initialized');
        var chat = document.getElementById('agent-chat');
        if (chat) {
          var msg = document.createElement('div');
          msg.className = 'agent-msg agent-system';
          msg.style.cssText = 'padding:12px; margin:8px; background:#1a1a2e; border-radius:8px; color:#e0e0e0;';
          msg.textContent = 'No AI provider configured. Please add an OpenAI-compatible API key in Settings.';
          chat.appendChild(msg);
        }
      }
    } else {
      // Agent page without IDE container — wire up command palette to existing chat
      if (typeof window.CommandPalette !== 'undefined') {
        var stubIDE = {
          askAgent: function (prompt) {
            var event = new CustomEvent('matey-agent:ask', { detail: { prompt: prompt } });
            window.dispatchEvent(event);
          }
        };
        var palette = new window.CommandPalette(stubIDE);
        window.MateyCmd = palette;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(initAgentIDE, 100);
    });
  } else {
    setTimeout(initAgentIDE, 100);
  }

  // Expose for debugging
  window.MateyAgentInit = { init: initAgentIDE };
})();

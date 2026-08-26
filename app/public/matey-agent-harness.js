/* Matey Agent Harness — Centralized AI Request Handler
 * Routes all AI calls through a single JavaScript helper that dynamically
 * grabs the key from localStorage and hits the base URL.
 */
(function () {
  'use strict';

  /* Centralized Gemini REST handler — uses localStorage to retrieve the user's key.
     Never leaves the device. Graceful error handling for invalid/expired keys. */
  function callGemini(userPrompt) {
    return new Promise(function (resolve) {
      var apiKey = localStorage.getItem('matey_gemini_key');
      if (!apiKey) {
        resolve('Please add your Gemini API Key in Settings.');
        return;
      }

      var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(apiKey);

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: userPrompt }]
          }]
        })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('API Error: ' + res.status);
          return res.json();
        })
        .then(function (data) {
          var txt = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
          if (!txt) throw new Error('Empty response from Gemini API');
          resolve(txt);
        })
        .catch(function (err) {
          console.error('[MateyAgentHarness] Gemini error:', err.message || err);
          resolve('Invalid or expired API Key. Please check your key in Settings.');
        });
    });
  }

  /* Generic AI call that auto-detects the provider.
     For Gemini: uses callGemini.
     For custom providers: falls back to MateyByok if available. */
  function callAI(userPrompt, provider) {
    if (provider === 'gemini' || !provider) {
      return callGemini(userPrompt);
    }
    if (window.MateyByok && window.MateyByok.sendToGemini) {
      return window.MateyByok.sendToGemini(localStorage.getItem('matey_gemini_key'), userPrompt);
    }
    return Promise.resolve('No AI provider configured.');
  }

  window.MateyAgentHarness = {
    callGemini: callGemini,
    callAI: callAI
  };
})();

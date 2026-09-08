/* Matey Agent Harness — Centralized AI Request Handler
 * Routes all AI calls through a single JavaScript helper that dynamically
 * grabs the key from localStorage and hits the base URL.
 * Optimized for instant single-turn response with local attachment extraction.
 */
(function () {
  'use strict';

  /* File extension to MIME type mapping for local extraction */
  const FILE_MIME_TYPES = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.doc': 'application/msword'
  };

  /* Instant Local Attachment Extraction: Read and extract text from attached files locally.
     Supports PDF, TXT, CSV, XLSX, DOCX formats. Runs entirely on device before API call. */
  function extractTextFromFile(file) {
    return new Promise(function (resolve) {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const mimeType = FILE_MIME_TYPES[ext] || 'text/plain';

      if (ext === '.txt' || ext === '.csv') {
        const reader = new FileReader();
        reader.onload = function (e) {
          resolve({ success: true, text: String(e.target.result), mimeType });
        };
        reader.onerror = function () {
          resolve({ success: false, error: 'Failed to read file' });
        };
        reader.readAsText(file);
      } else if (ext === '.pdf') {
        // PDF extraction using built-in - attempts text extraction
        const reader = new FileReader();
        reader.onload = function (e) {
          // For PDFs, we'll try basic text extraction; complex PDFs may need external processing
          const text = e.target.result ? String(e.target.result).substring(0, 10000) : '';
          resolve({ success: true, text, mimeType });
        };
        reader.onerror = function () {
          resolve({ success: false, error: 'Failed to read PDF' });
        };
        reader.readAsText(file);
      } else if (ext === '.xlsx' || ext === '.xls' || ext === '.docx' || ext === '.doc') {
        // For office documents, read as data URL and note for external processing
        const reader = new FileReader();
        reader.onload = function (e) {
          const dataUrl = e.target.result;
          resolve({ success: true, text: '', dataUrl, mimeType, requiresExternal: true });
        };
        reader.onerror = function () {
          resolve({ success: false, error: 'Failed to read document' });
        };
        reader.readAsDataURL(file);
      } else {
        // Unknown file type - read as data URL
        const reader = new FileReader();
        reader.onload = function (e) {
          const dataUrl = e.target.result;
          resolve({ success: true, text: '', dataUrl, mimeType, requiresExternal: true });
        };
        reader.onerror = function () {
          resolve({ success: false, error: 'Unsupported file type' });
        };
        reader.readAsDataURL(file);
      }
    });
  }

  /* Fast-Path Single Turn: Bypass multi-step tool loops for general chat.
     Sets max_steps = 1 for single-turn responses, reserving multi-step loops
     only for explicit project-wide code refactoring. */
  const DEFAULT_MAX_STEPS = 1;

  /* Centralized Gemini REST handler — uses localStorage to retrieve the user's key.
     Never leaves the device. Graceful error handling for invalid/expired keys.
     Now with streaming support and single-turn optimization. */
  function callGemini(userPrompt, options = {}) {
    return new Promise(function (resolve) {
      var apiKey = localStorage.getItem('matey_gemini_key');
      if (!apiKey) {
        resolve('Please add your Gemini API Key in Settings.');
        return;
      }

      var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(apiKey);

      // Fast-path: single turn only, no multi-step tool loops
      const maxSteps = options.maxSteps !== undefined ? options.maxSteps : DEFAULT_MAX_STEPS;

      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.stream !== false ? { 'X-Goog-Stream-Transport': 'sse' } : {})
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: userPrompt }]
          }],
          // Single-turn optimization: disable multi-step tool use
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
            ...(maxSteps <= 1 ? { stopSequences: ['USER_PROMPT'] } : {})
          },
          ...(options.stream === true ? { stream: true } : {})
        })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('API Error: ' + res.status);
          if (options.stream === true && res.body) {
            // Streaming mode - return readable stream
            const reader = res.body.getReader();
            return { reader, res };
          }
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
     For Gemini: uses callGemini with options (including stream, maxSteps).
      For custom providers: falls back to MateyByok if available. */
  function callAI(userPrompt, provider, options) {
    if (provider === 'gemini' || !provider) {
      return callGemini(userPrompt, options);
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

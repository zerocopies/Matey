/* MateyProviderPresets — auto-detect provider from API key, fetch supported models.
 * Each preset knows its auth header, default URL, and model endpoint.
 * Universal Provider Map: auto-hide Base URL per provider, auto-fetch model lists,
 * users can free-type any model name — no hardcoded static model lists. */
(function () {
  'use strict';

  var PRESETS = [
    {
      id: 'anthropic', name: 'Anthropic (Claude)', priority: 100,
      pattern: /^sk-ant-/,
      baseUrl: 'https://api.anthropic.com/v1',
      authHeader: function (key) { return { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' }; },
      modelEndpoint: '/v1/models', modelPath: 'data', idField: 'id',
      chatEndpoint: '/v1/messages',
      defaultModel: 'claude-3-5-haiku-20241022',
      fastOptions: ['claude-3-5-haiku-20241022', 'claude-3-haiku-20240307'],
      heavyOptions: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
      capabilities: ['text', 'vision'],
      transformRequest: function (body) { return body; },
      parseModels: function (j) { return (j.data || []).map(function (m) { return m.id; }); }
    },
    {
      id: 'openai', name: 'OpenAI', priority: 90,
      pattern: /^sk-/,
      baseUrl: 'https://api.openai.com/v1',
      authHeader: function (key) { return { 'Authorization': 'Bearer ' + key }; },
      modelEndpoint: '/v1/models', modelPath: 'data', idField: 'id',
      chatEndpoint: '/v1/chat/completions',
      defaultModel: 'gpt-4o-mini',
      fastOptions: ['gpt-4o-mini', 'gpt-4o-mini-2024-07-18'],
      heavyOptions: ['gpt-4o', 'gpt-4-turbo'],
      capabilities: ['text', 'vision'],
      parseModels: function (j) { return (j.data || []).map(function (m) { return m.id; }); }
    },
    {
      id: 'gemini', name: 'Google Gemini', priority: 95,
      pattern: /^AIza/,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      authHeader: function (key) { return {}; },  // key passed as query param
      authQueryParam: 'key',
      modelEndpoint: '/v1beta/models', modelPath: 'models', idField: 'name',
      chatEndpoint: '',  // Gemini uses :generateContent on model-specific URL
      defaultModel: 'gemini-1.5-flash',
      fastOptions: ['gemini-1.5-flash', 'gemini-1.5-flash-8b'],
      heavyOptions: ['gemini-1.5-pro', 'gemini-1.0-pro'],
      capabilities: ['text', 'vision'],
      parseModels: function (j) { return (j.models || []).map(function (m) { return m.name; }); }
    },
    {
      id: 'groq', name: 'Groq', priority: 85,
      pattern: /^gsk_/,
      baseUrl: 'https://api.groq.com/openai/v1',
      authHeader: function (key) { return { 'Authorization': 'Bearer ' + key }; },
      modelEndpoint: '/v1/models', modelPath: 'data', idField: 'id',
      chatEndpoint: '/v1/chat/completions',
      defaultModel: 'llama-3.3-70b-versatile',
      fastOptions: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
      heavyOptions: ['llama-3.1-70b-versatile'],
      capabilities: ['text'],
      parseModels: function (j) { return (j.data || []).map(function (m) { return m.id; }); }
    },
    {
      id: 'xai', name: 'xAI (Grok)', priority: 85,
      pattern: /^xai-/,
      baseUrl: 'https://api.x.ai/v1',
      authHeader: function (key) { return { 'Authorization': 'Bearer ' + key }; },
      modelEndpoint: '/v1/models', modelPath: 'data', idField: 'id',
      chatEndpoint: '/v1/chat/completions',
      defaultModel: 'grok-beta',
      fastOptions: ['grok-beta'],
      heavyOptions: ['grok-2'],
      capabilities: ['text', 'vision'],
      parseModels: function (j) { return (j.data || []).map(function (m) { return m.id; }); }
    },
    {
      id: 'perplexity', name: 'Perplexity', priority: 80,
      pattern: /^pplx-/,
      baseUrl: 'https://api.perplexity.ai',
      authHeader: function (key) { return { 'Authorization': 'Bearer ' + key }; },
      modelEndpoint: '',  // Perplexity doesn't have a models endpoint
      chatEndpoint: '/chat/completions',
      defaultModel: 'llama-3.1-sonar-small-128k-online',
      fastOptions: ['llama-3.1-sonar-small-128k-online'],
      heavyOptions: ['llama-3.1-sonar-large-128k-online'],
      capabilities: ['text'],
      parseModels: function (j) { return []; }
    },
    {
      id: 'huggingface', name: 'HuggingFace', priority: 70,
      pattern: /^(hf_|api)/,
      baseUrl: 'https://api-inference.huggingface.co/models',
      authHeader: function (key) { return { 'Authorization': 'Bearer ' + key }; },
      modelEndpoint: '',
      chatEndpoint: '',
      defaultModel: '',
      capabilities: ['text'],
      parseModels: function (j) { return []; }
    },
    {
      id: 'cohere', name: 'Cohere', priority: 75,
      pattern: /^(cohere_|COHERE_)/,
      baseUrl: 'https://api.cohere.com/v1',
      authHeader: function (key) { return { 'Authorization': 'Bearer ' + key }; },
      modelEndpoint: '/v1/models', modelPath: 'models', idField: 'name',
      chatEndpoint: '/chat',
      defaultModel: 'command-r-plus',
      fastOptions: ['command-r'],
      heavyOptions: ['command-r-plus'],
      capabilities: ['text'],
      parseModels: function (j) { return (j.models || []).map(function (m) { return m.name; }); }
    },
    {
      id: 'replicate', name: 'Replicate', priority: 65,
      pattern: /^r8_/,
      baseUrl: 'https://api.replicate.com/v1',
      authHeader: function (key) { return { 'Authorization': 'Token ' + key }; },
      modelEndpoint: '/v1/models', modelPath: 'results', idField: 'name',
      chatEndpoint: '/predictions',
      defaultModel: 'meta/meta-llama-3.1-405b-instruct',
      fastOptions: ['meta/meta-llama-3.1-70b-instruct'],
      heavyOptions: ['meta/meta-llama-3.1-405b-instruct'],
      capabilities: ['text'],
      parseModels: function (j) { return (j.results || []).map(function (m) { return m.name; }); }
    },
    {
      id: 'ollama', name: 'Ollama (local)', priority: 10,
      pattern: /^ollama$|^local$|^none$/i,
      baseUrl: 'http://localhost:11434',
      authHeader: function (key) { return {}; },
      modelEndpoint: '/api/tags', modelPath: 'models', idField: 'name',
      chatEndpoint: '/api/chat',
      defaultModel: 'llama3.2',
      fastOptions: ['llama3.2', 'qwen2.5:0.5b'],
      heavyOptions: ['llama3.1'],
      capabilities: ['text'],
      parseModels: function (j) { return (j.models || []).map(function (m) { return m.name; }); }
    }
  ];

  function detectProvider(apiKey) {
    if (!apiKey) return null;
    var key = apiKey.trim();
    var best = null;
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].pattern.test(key)) {
        if (!best || PRESETS[i].priority > best.priority) best = PRESETS[i];
      }
    }
    return best;
  }

  function listProviders() {
    return PRESETS.slice().sort(function (a, b) { return b.priority - a.priority; });
  }

  // Universal Provider Map: get preset by ID
  function getPreset(id) {
    return PRESETS.filter(function (p) { return p.id === id; })[0] || null;
  }

  // Universal Provider Map: get all preset IDs/names for UI dropdown
  function getProviderList() {
    return PRESETS.map(function (p) { return { id: p.id, name: p.name, baseUrl: p.baseUrl }; });
  }

  // Auto-fetch model list for a given preset (uses native fetch with CORS bypass)
  function fetchModelsForPreset(preset, apiKey) {
    if (!preset || !preset.modelEndpoint) return Promise.resolve([]);
    var url = preset.baseUrl + preset.modelEndpoint;
    var auth = preset.authHeader(apiKey || '');
    if (preset.authQueryParam) {
      url += (url.indexOf('?') === -1 ? '?' : '&') + preset.authQueryParam + '=' + encodeURIComponent(apiKey || '');
    }
    return fetch(url, { method: 'GET', headers: auth })
      .then(function (r) { if (!r.ok) return []; return r.json(); })
      .then(function (j) { return preset.parseModels ? preset.parseModels(j) : []; })
      .catch(function () { return []; });
  }

  // Auto-hide Base URL: return display-friendly provider name + masked URL
  function getDisplayInfo(preset) {
    if (!preset) return null;
    return {
      id: preset.id,
      name: preset.name,
      baseUrl: preset.baseUrl,
      maskedUrl: preset.baseUrl.replace(/^https?:\/\//, '').split('/')[0],
      supportsModelFetch: !!preset.modelEndpoint
    };
  }

  window.MateyProviderPresets = {
    detect: detectProvider,
    list: listProviders,
    get: getPreset,
    getProviderList: getProviderList,
    fetchModelsForPreset: fetchModelsForPreset,
    getDisplayInfo: getDisplayInfo
  };
})();

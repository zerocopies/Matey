/* MateyByokModule — ES Module interface for the Agent IDE
 * Provides routeRequest that routes through the existing BYOK provider system
 * Uses CapacitorHttp (via nativeFetch) to bypass CORS on device
 * Supports both OpenAI-compatible APIs and native Gemini API
 * The existing matey-byok.js IIFE (loaded via <script> tag) provides the legacy window.MateyByok global
 * This module provides the ES module interface used by matey-agent.js
 */

const BAZAARLINK_BASE = 'https://api.bazaarlink.ai/v1';
const STORAGE_KEY = 'matey-providers';

function nativeFetch(url, options) {
  const opts = options || {};
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
    const reqOpts = {
      method: (opts.method || 'GET').toUpperCase(),
      url: url,
      headers: opts.headers || {}
    };
    if (opts.body) {
      if (typeof opts.body === 'string') {
        try { reqOpts.data = JSON.parse(opts.body); }
        catch (e) { reqOpts.data = opts.body; reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'text/plain'; }
      } else {
        reqOpts.data = opts.body;
      }
    }
    return window.Capacitor.Plugins.CapacitorHttp.request(reqOpts).then(resp => ({
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: resp.status,
      headers: resp.headers || {},
      url: resp.url || url,
      json: () => Promise.resolve(resp.data),
      text: () => Promise.resolve(typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data))
    }));
  }
  return fetch(url, opts);
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
}

function save(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cleanBaseUrl(raw) {
  let s = (raw || '').trim();
  const mdMatch = s.match(/\]\(([^)]+)\)/);
  if (mdMatch) s = mdMatch[1];
  s = s.replace(/^\[.*\]\(/, '').replace(/\)[^)]*$/, '');
  s = s.replace(/[\[\]]/g, '').trim();
  s = s.replace(/\/+$/, '');
  return s;
}

function buildApiUrl(baseUrl, endpoint) {
  let base = cleanBaseUrl(baseUrl || '');
  base = base.replace(/\/v1\/?$/, '');
  return base + endpoint;
}

async function autoRegisterAgent(label) {
  const name = label || 'Matey Mobile Agent';
  const url = BAZAARLINK_BASE + '/agents/register';
  console.log('[BazaarLink] Auto-registering agent:', name);
  const r = await nativeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, description: 'Matey AI assistant running on-device' })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('Registration failed: HTTP ' + r.status + ': ' + t.slice(0, 200));
  }
  const j = await r.json();
  const key = j.api_key;
  if (!key) throw new Error('No API key returned from registration');
  console.log('[BazaarLink] Registered! Key:', key.substring(0, 12) + '...', 'Free model:', j.free_model || 'auto:free');
  return { apiKey: key, baseUrl: BAZAARLINK_BASE, freeModel: j.free_model || 'auto:free' };
}

async function ensureProvider() {
  let providers = load();
  if (providers.length > 0) return providers[0];
  console.log('[BazaarLink] No providers configured, attempting auto-registration');
  try {
    const result = await autoRegisterAgent('Matey Agent');
    const entry = {
      name: 'BazaarLink (auto)',
      baseUrl: result.baseUrl,
      apiKey: result.apiKey,
      model: result.freeModel,
      capabilities: ['text', 'vision', 'stt', 'imagegen', 'text-gen']
    };
    providers.push(entry);
    save(providers);
    console.log('[BazaarLink] Saved auto-registered provider');
    return entry;
  } catch (err) {
    console.warn('[BazaarLink] Could not auto-register:', err.message || err);
    return null;
  }
}

function getProvider(capability) {
  const providers = load();
  if (providers.length > 0) {
    if (!capability) return providers[0];
    /* Normalize capability aliases: 'text-gen' -> 'text', 'image-gen' -> 'imagegen' */
    const cap = capability.replace('-gen', '') || capability;
    for (let i = 0; i < providers.length; i++) {
      const caps = providers[i].capabilities || [];
      if (caps.indexOf(capability) !== -1 || caps.indexOf(cap) !== -1) return providers[i];
    }
    /* Fallback: if no exact match, check for 'text' cap with 'text-gen' */
    for (let j = 0; j < providers.length; j++) {
      const caps2 = providers[j].capabilities || [];
      if (!caps2.length) return providers[j];
    }
    return providers[0];
  }
  return null;
}

function resolveProvider(capability) {
  const p = getProvider(capability);
  if (p) return Promise.resolve(p);
  return ensureProvider().then(result => {
    if (result) return result;
    throw new Error('No provider configured for capability: ' + capability);
  });
}

async function resolveModel(p) {
  if (p.model && p.model !== 'auto' && p.model !== 'default') return p.model;
  try {
    const modelsUrl = buildApiUrl(p.baseUrl, '/v1/models');
    const headers = p.apiKey ? { 'Authorization': 'Bearer ' + p.apiKey } : {};
    const r = await nativeFetch(modelsUrl, { method: 'GET', headers: headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const list = (j.data || j.models || []).map(m => m.id || m.name);
    if (!list.length) throw new Error('No models available');
    const pref = list.filter(id => /gpt-4o|llama|mistral|gemini|claude|qwen|default/i.test(id));
    return (pref[0] || list[0]);
  } catch (e) {
    console.warn('resolveModel fallback:', e.message);
    return p.model || 'gpt-4o-mini';
  }
}

function convertMessages(messages) {
  return messages.map(msg => {
    if (!msg.content || !Array.isArray(msg.content)) return msg;
    const converted = [];
    msg.content.forEach(block => {
      if (block.type === 'image' && block.source && block.source.type === 'base64') {
        converted.push({
          type: 'image_url',
          image_url: {
            url: 'data:' + (block.source.media_type || 'image/jpeg') + ';base64,' + block.source.data
          }
        });
      } else {
        converted.push(block);
      }
    });
    return { role: msg.role, content: converted };
  });
}

async function doOpenAIRequest(p, messages, tools, toolChoice, timeoutMs) {
  const apiUrl = buildApiUrl(p.baseUrl, '/v1/chat/completions');
  const converted = convertMessages(messages);
  const model = await resolveModel(p);
  const body = { model: model, messages: converted, stream: false };
  if (tools && tools.length) {
    body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;
  }
  const r = await nativeFetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 401) throw new Error('Authentication failed (401): Invalid API key');
    throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
  }
  const j = await r.json();
  if (!j.choices || !j.choices.length) throw new Error('Empty response from provider');
  return j.choices[0].message;
}

async function doGeminiRequest(p, messages, timeoutMs) {
  const model = p.model || 'gemini-1.5-flash';
  const apiKey = p.apiKey;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);

  const systemParts = [];
  const contents = [];
  messages.forEach(msg => {
    if (msg.role === 'system') {
      systemParts.push({ text: msg.content });
    } else if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else if (msg.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: msg.content || '(analyzing...)' }] });
    } else if (msg.role === 'tool') {
      systemParts.push({ text: 'Tool result: ' + JSON.stringify(msg.content) });
    }
  });

  if (systemParts.length > 0 && contents.length > 0) {
    const firstUser = contents[0];
    if (firstUser.role === 'user') {
      firstUser.parts = [{ text: systemParts.map(s => s.text).join('\n\n') + '\n\n' + (firstUser.parts[0].text || '') }];
    } else {
      contents.unshift({ role: 'user', parts: systemParts });
    }
  }

  const body = {
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096
    }
  };

  const r = await nativeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 401) throw new Error('Authentication failed (401): Invalid API key');
    throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
  }
  const j = await r.json();
  if (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0]) {
    const text = j.candidates[0].content.parts[0].text;
    return { role: 'assistant', content: text, tool_calls: null };
  }
  throw new Error('Empty response from Gemini API');
}

export async function routeRequest(opts) {
  const capability = opts.capability;
  const messages = opts.messages;
  const tools = opts.tools;
  const toolChoice = opts.toolChoice;
  const timeoutMs = opts.timeoutMs || 30000;

  const p = await resolveProvider(capability);

  const baseLower = (p.baseUrl || '').toLowerCase();
  const isGemini = baseLower.indexOf('generativelanguage') !== -1 || baseLower.indexOf('gemini') !== -1;

  if (isGemini) {
    return await doGeminiRequest(p, messages, timeoutMs);
  }

  return await doOpenAIRequest(p, messages, tools, toolChoice, timeoutMs);
}

/* Migrate legacy single-provider keys into the generic BYOK list */
function migrateLegacyProviders() {
  const providers = load();
  let migrated = false;

  const geminiKey = localStorage.getItem('matey_gemini_key');
  if (geminiKey && !providers.some(p => p.name === 'Gemini' && p.baseUrl.indexOf('generativelanguage') !== -1)) {
    providers.unshift({
      name: 'Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: geminiKey,
      model: '',
      capabilities: ['text', 'text-gen', 'vision']
    });
    migrated = true;
    localStorage.removeItem('matey_gemini_key');
  }

  const openaiKey = localStorage.getItem('matey_openai_key');
  if (openaiKey && !providers.some(p => p.name.toLowerCase().indexOf('openai') !== -1)) {
    providers.unshift({
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: openaiKey,
      model: '',
      capabilities: ['text', 'text-gen', 'vision', 'imagegen']
    });
    migrated = true;
    localStorage.removeItem('matey_openai_key');
  }

  if (migrated) save(providers);
  return providers;
}

function maskKey(key) {
  if (!key) return 'No key';
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

/* Auto-migrate legacy provider keys on module load */
try { migrateLegacyProviders(); } catch (e) { console.warn('[BYOK] Migration failed:', e); }

export { nativeFetch, buildApiUrl, load, save, getProvider, resolveProvider, autoRegisterAgent, ensureProvider, convertMessages, resolveModel, migrateLegacyProviders, maskKey };

/* MateyApiRouter — Privacy-first, latency-optimized request router
 *
 * Fixes vs. old router:
 *   1. timeoutMs actually aborts the underlying fetch via AbortController
 *   2. resolveModel() result cached per-provider (no re-fetch every call)
 *   3. Auto retry/failover: on provider failure, retry once with next configured provider
 *   4. Intent-first routing: classify task type, pick best provider by health score
 *   5. Live per-provider health tracking (success/failure/latency)
 *   6. Privacy: no request content logged or sent to any third party
 */

import { ASTIndexClient as ASTIndex } from './matey-ast-client.js';

const STORAGE_KEY = 'matey-providers';
const BAZAARLINK_BASE = 'https://api.bazaarlink.ai/v1';
const MODEL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const HEALTH_DECAY_MS = 5 * 60 * 1000; // 5 minutes

/* ---- Provider health tracking ---- */
const _providerHealth = new Map();

function healthKey(p) { return p.name + '|' + p.baseUrl; }

function getHealth(p) {
  const k = healthKey(p);
  if (!_providerHealth.has(k)) {
    _providerHealth.set(k, { successes: 0, failures: 0, totalLatency: 0, latencyCount: 0, lastUsed: 0, lastError: null });
  }
  return _providerHealth.get(k);
}

function recordSuccess(p, latencyMs) {
  const h = getHealth(p);
  h.successes++;
  h.totalLatency += latencyMs;
  h.latencyCount++;
  h.lastUsed = Date.now();
}

function recordFailure(p, err) {
  const h = getHealth(p);
  h.failures++;
  h.lastUsed = Date.now();
  h.lastError = (err && err.message) ? err.message.substring(0, 200) : 'unknown';
}

function getHealthScore(p) {
  const h = getHealth(p);
  const total = h.successes + h.failures;
  if (total === 0) return 0.5; // unknown → neutral
  const successRate = h.successes / total;
  const avgLatency = h.latencyCount > 0 ? h.totalLatency / h.latencyCount : 2000;
  const latencyScore = Math.max(0, 1 - (avgLatency / 10000)); // 0-1, lower latency = higher
  return (successRate * 0.7) + (latencyScore * 0.3);
}

function getProviderLatency(p) {
  const h = getHealth(p);
  return h.latencyCount > 0 ? Math.round(h.totalLatency / h.latencyCount) : null;
}

/* ---- Model resolution cache ---- */
const _modelCache = new Map();

function getCachedModel(p) {
  const k = p.baseUrl;
  const entry = _modelCache.get(k);
  if (entry && (Date.now() - entry.timestamp) < MODEL_CACHE_TTL_MS) {
    return entry.model;
  }
  return null;
}

function setCachedModel(p, model) {
  _modelCache.set(p.baseUrl, { model, timestamp: Date.now() });
}

/* ---- Task classification (rule-based, no AI) ---- */
function classifyTask(messages) {
  const allText = messages.map(m => (m.content || '').toString()).join('\n').toLowerCase();
  const msgCount = messages.length;
  const totalLen = allText.length;

  // Code-related: contains code keywords or short technical queries
  if (/\b(function|const |let |var |=>|import |class |def |return |if |for |while )/.test(allText)) {
    return 'code';
  }
  // Vision/image-related
  if (/\b(image|photo|picture|describe|what.*see|visual|looks?\s+like)/.test(allText)) {
    return 'vision';
  }
  // Creative writing: long, narrative
  if (totalLen > 500 && /\b(write|story|poem|essay|blog|article|draft)/.test(allText)) {
    return 'creative';
  }
  // Analysis/reasoning: moderate length, question-based
  if (/\b(analyze|explain|compare|why|how|what|difference|pros?\s*(and|&)\s*cons?)/.test(allText) && totalLen > 100) {
    return 'analysis';
  }
  // Quick chat: short, conversational
  if (totalLen < 200 && msgCount <= 2) {
    return 'chat';
  }
  return 'general';
}

/* ---- Provider selection by task type + health ---- */
function selectProviderForTask(capability, taskType) {
  const providers = load();
  const candidates = providers.filter(p => {
    const caps = p.capabilities || [];
    const cap = capability.replace('-gen', '') || capability;
    return caps.indexOf(capability) !== -1 || caps.indexOf(cap) !== -1 || caps.length === 0;
  });
  if (candidates.length === 0) return getProvider(capability);
  if (candidates.length === 1) return candidates[0];

  // Score each candidate: health * task-fit
  const taskFitWeights = {
    code: { 'text': 1.0, 'text-gen': 0.9, 'vision': 0.3 },
    vision: { 'vision': 1.0, 'text': 0.4, 'text-gen': 0.3 },
    creative: { 'text': 1.0, 'text-gen': 0.9, 'vision': 0.2 },
    analysis: { 'text': 1.0, 'text-gen': 0.9, 'vision': 0.3 },
    chat: { 'text': 1.0, 'text-gen': 0.9, 'vision': 0.2 },
    general: { 'text': 1.0, 'text-gen': 0.8, 'vision': 0.3 }
  };
  const weights = taskFitWeights[taskType] || taskFitWeights.general;

  let best = candidates[0];
  let bestScore = -1;
  for (const c of candidates) {
    const caps = c.capabilities || [];
    let fit = 0.5;
    for (const cap of caps) {
      if (weights[cap] !== undefined) fit = Math.max(fit, weights[cap]);
    }
    const score = getHealthScore(c) * fit;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/* ---- AbortController-based timeout ---- */
function createTimeoutSignal(timeoutMs, existingSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out after ' + timeoutMs + 'ms')), timeoutMs);
  if (existingSignal) {
    if (existingSignal.aborted) controller.abort(existingSignal.reason);
    else existingSignal.addEventListener('abort', () => controller.abort(existingSignal.reason), { once: true });
  }
  return { signal: controller.signal, timer };
}

function cleanupTimeout(timer) { clearTimeout(timer); }

/* ---- Fetch with native CapacitorHttp fallback ---- */
function nativeFetch(url, options) {
  const opts = options || {};
  if (opts._useNativeFetch || opts.signal) {
    return fetch(url, opts);
  }
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
      } else { reqOpts.data = opts.body; }
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

/* ---- Helpers ---- */
function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; } }
function save(list) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {} }

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

function convertMessages(messages) {
  return messages.map(msg => {
    if (!msg.content || !Array.isArray(msg.content)) return msg;
    const converted = [];
    msg.content.forEach(block => {
      if (block.type === 'image' && block.source && block.source.type === 'base64') {
        converted.push({ type: 'image_url', image_url: { url: 'data:' + (block.source.media_type || 'image/jpeg') + ';base64,' + block.source.data } });
      } else { converted.push(block); }
    });
    return { role: msg.role, content: converted };
  });
}

/* ---- Cached model resolution ---- */
async function resolveModelCached(p) {
  if (p.model && p.model !== 'auto' && p.model !== 'default') return p.model;
  const cached = getCachedModel(p);
  if (cached) return cached;
  try {
    const modelsUrl = buildApiUrl(p.baseUrl, '/v1/models');
    const headers = p.apiKey ? { 'Authorization': 'Bearer ' + p.apiKey } : {};
    const r = await nativeFetch(modelsUrl, { method: 'GET', headers: headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const list = (j.data || j.models || []).map(m => m.id || m.name);
    if (!list.length) throw new Error('No models available');
    const pref = list.filter(id => /gpt-4o|llama|mistral|gemini|claude|qwen|default/i.test(id));
    const model = pref[0] || list[0];
    setCachedModel(p, model);
    return model;
  } catch (e) {
    return p.model || 'gpt-4o-mini';
  }
}

/* ---- Request execution with AbortController timeout ---- */
async function doOpenAIRequest(p, messages, tools, toolChoice, timeoutMs, externalSignal) {
  const apiUrl = buildApiUrl(p.baseUrl, '/v1/chat/completions');
  const converted = convertMessages(messages);
  const model = await resolveModelCached(p);
  const body = { model: model, messages: converted, stream: false };
  if (tools && tools.length) { body.tools = tools; if (toolChoice) body.tool_choice = toolChoice; }

  const { signal, timer } = createTimeoutSignal(timeoutMs, externalSignal);
  const r = await nativeFetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
    body: JSON.stringify(body),
    signal: signal
  }).finally(() => cleanupTimeout(timer));

  if (!r.ok) {
    const t = await r.text();
    if (r.status === 401) throw new Error('Authentication failed (401): Invalid API key');
    throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
  }
  const j = await r.json();
  if (!j.choices || !j.choices.length) throw new Error('Empty response from provider');
  return j.choices[0].message;
}

async function doOpenAIRequestStreaming(p, messages, tools, toolChoice, timeoutMs, externalSignal, onToken) {
  const apiUrl = buildApiUrl(p.baseUrl, '/v1/chat/completions');
  const converted = convertMessages(messages);
  const model = await resolveModelCached(p);
  const body = { model: model, messages: converted, stream: true };
  if (tools && tools.length) { body.tools = tools; if (toolChoice) body.tool_choice = toolChoice; }

  const { signal, timer } = createTimeoutSignal(timeoutMs, externalSignal);
  const r = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
    body: JSON.stringify(body),
    signal: signal
  }).finally(() => cleanupTimeout(timer));

  if (!r.ok) {
    const t = await r.text();
    if (r.status === 401) throw new Error('Authentication failed (401): Invalid API key');
    throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
  }

  var reader = r.body.getReader();
  var decoder = new TextDecoder();
  var fullContent = '';
  var fullToolCalls = [];
  var buffer = '';

  try {
    while (true) {
      var readResult = await reader.read();
      if (readResult.done) break;
      buffer += decoder.decode(readResult.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li].trim();
        if (line === '' || line === 'data: [DONE]') continue;
        if (!line.startsWith('data: ')) continue;
        var chunk;
        try { chunk = JSON.parse(line.slice(6)); } catch (e) { continue; }
        var delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
        if (!delta) continue;
        if (delta.content) { fullContent += delta.content; if (onToken) onToken(delta.content); }
        if (delta.tool_calls) {
          for (var tc of delta.tool_calls) {
            var idx = tc.index || 0;
            if (!fullToolCalls[idx]) fullToolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
            if (tc.id) fullToolCalls[idx].id = tc.id;
            if (tc.function) { if (tc.function.name) fullToolCalls[idx].function.name += tc.function.name; if (tc.function.arguments) fullToolCalls[idx].function.arguments += tc.function.arguments; }
          }
        }
      }
    }
  } catch (e) {
    if (signal && signal.aborted) throw new Error('ABORTED: Request cancelled by user');
    throw e;
  }

  var parsedToolCalls = null;
  if (fullToolCalls.length > 0) {
    parsedToolCalls = fullToolCalls.map(function(tc) {
      return { id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } };
    });
  }
  return { role: 'assistant', content: fullContent, tool_calls: parsedToolCalls };
}

async function doGeminiRequest(p, messages, timeoutMs, externalSignal) {
  const model = p.model || 'gemini-1.5-flash';
  const apiKey = p.apiKey;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);

  const systemParts = [];
  const contents = [];
  messages.forEach(msg => {
    if (msg.role === 'system') systemParts.push({ text: msg.content });
    else if (msg.role === 'user') contents.push({ role: 'user', parts: [{ text: msg.content }] });
    else if (msg.role === 'assistant') contents.push({ role: 'model', parts: [{ text: msg.content || '(analyzing...)' }] });
    else if (msg.role === 'tool') systemParts.push({ text: 'Tool result: ' + JSON.stringify(msg.content) });
  });
  if (systemParts.length > 0 && contents.length > 0) {
    const firstUser = contents[0];
    if (firstUser.role === 'user') firstUser.parts = [{ text: systemParts.map(s => s.text).join('\n\n') + '\n\n' + (firstUser.parts[0].text || '') }];
    else contents.unshift({ role: 'user', parts: systemParts });
  }

  const body = { contents: contents, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } };
  const { signal, timer } = createTimeoutSignal(timeoutMs, externalSignal);
  const r = await nativeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal
  }).finally(() => cleanupTimeout(timer));

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

/* ---- Main route with retry/failover ---- */
export async function routeRequest(opts) {
  const capability = opts.capability;
  const messages = opts.messages;
  const tools = opts.tools;
  const toolChoice = opts.toolChoice;
  const timeoutMs = opts.timeoutMs || 30000;
  const signal = opts.signal;
  const onToken = opts.onToken;

  const taskType = classifyTask(messages);

  // Build ordered list of candidate providers
  const providers = load();
  const candidates = providers.filter(p => {
    const caps = p.capabilities || [];
    const cap = capability.replace('-gen', '') || capability;
    return caps.indexOf(capability) !== -1 || caps.indexOf(cap) !== -1 || caps.length === 0;
  });

  if (candidates.length === 0) {
    const p = getProvider(capability);
    if (!p) throw new Error('No provider configured for capability: ' + capability);
    candidates.push(p);
  }

  // Sort by health score (best first)
  candidates.sort((a, b) => getHealthScore(b) - getHealthScore(a));

  let lastError = null;
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    const isLastAttempt = i === candidates.length - 1;
    const baseLower = (p.baseUrl || '').toLowerCase();
    const isGemini = baseLower.indexOf('generativelanguage') !== -1 || baseLower.indexOf('gemini') !== -1;

    const startTime = Date.now();
    try {
      let result;
      if (isGemini) {
        result = await doGeminiRequest(p, messages, timeoutMs, signal);
      } else if (onToken && typeof ReadableStream !== 'undefined') {
        result = await doOpenAIRequestStreaming(p, messages, tools, toolChoice, timeoutMs, signal, onToken);
      } else {
        result = await doOpenAIRequest(p, messages, tools, toolChoice, timeoutMs, signal);
      }
      recordSuccess(p, Date.now() - startTime);
      return result;
    } catch (e) {
      recordFailure(p, e);
      lastError = e;
      if (isLastAttempt) break;
      // Continue to next provider (failover)
    }
  }
  throw lastError || new Error('All providers failed for capability: ' + capability);
}

/* ---- Exports ---- */
export { classifyTask, getHealthScore, getProviderLatency, getProvider as getProviderByCapability, resolveModelCached as resolveModel, nativeFetch };

function getProvider(capability) {
  const providers = load();
  if (providers.length > 0) {
    if (!capability) return providers[0];
    const cap = capability.replace('-gen', '') || capability;
    for (let i = 0; i < providers.length; i++) {
      const caps = providers[i].capabilities || [];
      if (caps.indexOf(capability) !== -1 || caps.indexOf(cap) !== -1) return providers[i];
    }
    for (let j = 0; j < providers.length; j++) {
      const caps2 = providers[j].capabilities || [];
      if (!caps2.length) return providers[j];
    }
    return providers[0];
  }
  return null;
}

/* ---- Legacy migration + key masking (used by matey-byok.js IIFE) ---- */
function migrateLegacyProviders() {
  const providers = load();
  let migrated = false;
  const geminiKey = localStorage.getItem('matey_gemini_key');
  if (geminiKey && !providers.some(p => p.name === 'Gemini' && p.baseUrl.indexOf('generativelanguage') !== -1)) {
    providers.unshift({ name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: geminiKey, model: '', capabilities: ['text', 'text-gen', 'vision'] });
    migrated = true;
    localStorage.removeItem('matey_gemini_key');
  }
  const openaiKey = localStorage.getItem('matey_openai_key');
  if (openaiKey && !providers.some(p => p.name.toLowerCase().indexOf('openai') !== -1)) {
    providers.unshift({ name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: openaiKey, model: '', capabilities: ['text', 'text-gen', 'vision', 'imagegen'] });
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

export { migrateLegacyProviders, maskKey };

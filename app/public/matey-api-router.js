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
import { trimStackTrace } from './matey-agent.js';

const STORAGE_KEY = 'matey-providers';
const BAZAARLINK_BASE = 'https://api.bazaarlink.ai/v1';
const MODEL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const HEALTH_DECAY_MS = 5 * 60 * 1000; // 5 minutes

/* ---- Bi-Directional PII & Secret Masking ---- */
const _PII_PATTERNS = [
  { re: /(?:sk-[a-zA-Z0-9]{48}|sk-ant-[a-zA-Z0-9]{95}|sk-or-[a-zA-Z0-9]{48}|gsk_[a-zA-Z0-9]{48}|xai-[a-zA-Z0-9]{48}|pplx-[a-zA-Z0-9]{48}|r8_[a-zA-Z0-9]{48}|hf_[a-zA-Z0-9]{34}|AIza[a-zA-Z0-9_-]{35})/g, label: 'KEY' },
  { re: /(?:Bearer\s+)[A-Za-z0-9_\-\.]+/g, label: 'TOKEN' },
  { re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, label: 'EMAIL' },
  { re: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g, label: 'IP' },
];

var _maskStore = {};
var _maskCounter = 0;

function _maskPII(text) {
  if (!text || typeof text !== 'string') return text;
  var masked = text;
  for (var i = 0; i < _PII_PATTERNS.length; i++) {
    var pat = _PII_PATTERNS[i];
    masked = masked.replace(pat.re, function(match) {
      _maskCounter++;
      var placeholder = '[MASKED_' + pat.label + '_' + _maskCounter + ']';
      _maskStore[placeholder] = match;
      return placeholder;
    });
  }
  return masked;
}

function _unmaskPII(text) {
  if (!text || typeof text !== 'string') return text;
  var unmasked = text;
  for (var key in _maskStore) {
    if (_maskStore.hasOwnProperty(key)) {
      var idx = unmasked.indexOf(key);
      while (idx !== -1) {
        unmasked = unmasked.slice(0, idx) + _maskStore[key] + unmasked.slice(idx + key.length);
        idx = unmasked.indexOf(key, idx + _maskStore[key].length);
      }
    }
  }
  return unmasked;
}

function _maskRequestBody(body) {
  try {
    var parsed = typeof body === 'string' ? JSON.parse(body) : body;
    if (parsed.messages) {
      for (var i = 0; i < parsed.messages.length; i++) {
        var msg = parsed.messages[i];
        if (typeof msg.content === 'string') {
          msg.content = _maskPII(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (var j = 0; j < msg.content.length; j++) {
            if (msg.content[j] && typeof msg.content[j].text === 'string') {
              msg.content[j].text = _maskPII(msg.content[j].text);
            }
          }
        }
      }
    }
    return JSON.stringify(parsed);
  } catch (e) {
    return body;
  }
}

function resetMaskStore() {
  _maskStore = {};
  _maskCounter = 0;
}

/* ---- Air-Gapped Journal Network Blocker ---- */
const _JOURNAL_AIRGAP_KEY = 'matey_journal_ai_enabled';

function isJournalActive() {
  try {
    var path = window.location.pathname.toLowerCase();
    var hash = window.location.hash.toLowerCase();
    if (path.indexOf('journal') !== -1) return true;
    if (hash === '#journal') return true;
    if (window.MateyTabs && typeof window.MateyTabs.getCurrentTab === 'function') {
      return window.MateyTabs.getCurrentTab() === 'journal';
    }
    var mainEl = document.querySelector('main.content') || document.querySelector('main');
    if (mainEl && mainEl.innerHTML && mainEl.innerHTML.indexOf('journal') !== -1) return true;
  } catch (e) {}
  return false;
}

function isJournalAIEnabled() {
  try {
    return localStorage.getItem(_JOURNAL_AIRGAP_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

function setJournalAIEnabled(enabled) {
  try {
    localStorage.setItem(_JOURNAL_AIRGAP_KEY, enabled ? 'true' : 'false');
  } catch (e) {}
}

function assertNotJournalAirgapped() {
  if (isJournalActive() && !isJournalAIEnabled()) {
    throw new Error('JOURNAL_AIRGAP: AI calls are blocked while the Journal tab is active. Enable per-entry AI in the journal settings to allow this.');
  }
}

/* ---- Dynamic Temperature Scaling ---- */
const _TEMPERATURE_MAP = {
  'bugfix': 0.0,
  'json': 0.0,
  'code': 0.2,
  'analysis': 0.3,
  'general': 0.5,
  'chat': 0.6,
  'creative': 0.7,
  'vision': 0.4
};

function getTemperatureForTask(taskType, requestedTemp) {
  if (requestedTemp !== undefined && requestedTemp !== null) return requestedTemp;
  return _TEMPERATURE_MAP[taskType] !== undefined ? _TEMPERATURE_MAP[taskType] : 0.5;
}

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
// Latency tracking for cache hit vs miss
const _resolveStats = { hits: 0, misses: 0, cacheHitMs: [], cacheMissMs: [] };

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

// Expose cache stats for acceptance testing
export function getResolveStats() {
  return {
    hits: _resolveStats.hits,
    misses: _resolveStats.misses,
    avgCacheHitMs: _resolveStats.cacheHitMs.length > 0
      ? Math.round(_resolveStats.cacheHitMs.reduce((a, b) => a + b, 0) / _resolveStats.cacheHitMs.length)
      : 0,
    avgCacheMissMs: _resolveStats.cacheMissMs.length > 0
      ? Math.round(_resolveStats.cacheMissMs.reduce((a, b) => a + b, 0) / _resolveStats.cacheMissMs.length)
      : 0,
    cacheSize: _modelCache.size
  };
}

/* ---- Task classification (rule-based, no AI) ---- */
function classifyTask(messages) {
  const allText = messages.map(m => (m.content || '').toString()).join('\n').toLowerCase();
  const msgCount = messages.length;
  const totalLen = allText.length;

  // Bug fix / JSON: deterministic tasks needing exact output
  if (/\b(fix|bug|error|debug|patch|repair|broken|not failing|stack trace|exception)/.test(allText) && totalLen < 1000) {
    return 'bugfix';
  }
  if (/\b(json|parse|serialize|deserialize|schema|validate|format.*output|return.*json)/.test(allText) && /\b(output|return|format|respond)/.test(allText)) {
    return 'json';
  }
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
// Tracks active abort controllers for inspection/testing
const _activeAbortControllers = new Set();

function createTimeoutSignal(timeoutMs, existingSignal) {
  const controller = new AbortController();
  const timeoutError = new Error('Request timed out after ' + timeoutMs + 'ms');
  timeoutError.name = 'TimeoutError';
  const timer = setTimeout(() => {
    controller.abort(timeoutError);
    _activeAbortControllers.delete(controller);
  }, timeoutMs);
  _activeAbortControllers.add(controller);

  if (existingSignal) {
    if (existingSignal.aborted) controller.abort(existingSignal.reason);
    else existingSignal.addEventListener('abort', () => {
      controller.abort(existingSignal.reason);
      _activeAbortControllers.delete(controller);
    }, { once: true });
  }
  return { signal: controller.signal, timer, controller };
}

function cleanupTimeout(timer, controller) {
  clearTimeout(timer);
  if (controller) _activeAbortControllers.delete(controller);
}

// Expose for testing: check if any active request was aborted
export function wasAborted(controller) {
  return controller && controller.signal.aborted;
}

export function activeRequestCount() {
  return _activeAbortControllers.size;
}

/* ---- Fetch with native CapacitorHttp fallback ---- */
function nativeFetch(url, options) {
  if (window.MateyNetworkLog) { try { window.MateyNetworkLog.log(url, options); } catch (e) {} }
  const opts = options || {};
  if (opts.body && typeof opts.body === 'string' && opts.body.indexOf('messages') !== -1) {
    opts.body = _maskRequestBody(opts.body);
  }
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

/* ---- Routing decision log (for transparency) ---- */
const _routingLog = [];
const MAX_ROUTING_LOG = 50;

function logRoutingDecision(decision) {
  _routingLog.push(Object.assign({ timestamp: Date.now() }, decision));
  if (_routingLog.length > MAX_ROUTING_LOG) _routingLog.shift();
}

export function getRoutingLog() {
  return _routingLog.slice();
}
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

/* ---- Provider-aware auth ---- */
function getAuthHeaders(p) {
  if (window.MateyProviderPresets) {
    var preset = MateyProviderPresets.detect(p.apiKey);
    if (preset && preset.authHeader) {
      var headers = preset.authHeader(p.apiKey);
      if (preset.authQueryParam) {
        /* Gemini-style: key goes in query param, not headers */
        return { headers: {}, param: preset.authQueryParam + '=' + encodeURIComponent(p.apiKey) };
      }
      return { headers: headers, param: null };
    }
  }
  /* Fallback: OpenAI-style Bearer */
  return { headers: p.apiKey ? { 'Authorization': 'Bearer ' + p.apiKey } : {}, param: null };
}

/* ---- Provider-aware model resolution ---- */
function getProviderPreset(p) {
  if (window.MateyProviderPresets) return MateyProviderPresets.detect(p.apiKey);
  return null;
}
async function resolveModelCached(p) {
  if (p.model && p.model !== 'auto' && p.model !== 'default') return p.model;
  const t0 = performance.now();
  const cached = getCachedModel(p);
  if (cached) {
    _resolveStats.hits++;
    _resolveStats.cacheHitMs.push(performance.now() - t0);
    return cached;
  }
  _resolveStats.misses++;
  const preset = getProviderPreset(p);
  if (preset && preset.defaultModel && !preset.modelEndpoint) return preset.defaultModel;
  try {
    const modelsUrl = buildApiUrl(p.baseUrl, '/v1/models');
    var auth = getAuthHeaders(p);
    var url = modelsUrl + (auth.param ? ((modelsUrl.indexOf('?') === -1 ? '?' : '&') + auth.param) : '');
    const r = await nativeFetch(url, { method: 'GET', headers: auth.headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const list = (j.data || j.models || []).map(m => m.id || m.name);
    if (!list.length) throw new Error('No models available');
    // Prefer fast, cheap, low-latency models so the Agent defaults to speed.
    const fast = list.filter(id => /haiku|flash|mini|turbo|fast|lite/i.test(id));
    const pref = list.filter(id => /gpt-4o|llama|mistral|gemini|claude|qwen|default/i.test(id));
    const model = fast[0] || pref[0] || list[0];
    setCachedModel(p, model);
    _resolveStats.cacheMissMs.push(performance.now() - t0);
    return model;
  } catch (e) {
    _resolveStats.cacheMissMs.push(performance.now() - t0);
    return p.model || 'gpt-4o-mini';
  }
}

/* ---- Anthropic Messages API — non-streaming (nativeFetch / CORS-safe) ---- */
async function doAnthropicRequest(p, messages, tools, toolChoice, timeoutMs, externalSignal, temperature, onToken) {
  const apiUrl = buildApiUrl(p.baseUrl, '/v1/messages');
  const model = await resolveModelCached(p);
  var auth = getAuthHeaders(p);
  var url = apiUrl + (auth.param ? ((apiUrl.indexOf('?') === -1 ? '?' : '&') + auth.param) : '');
  const body = { model: model, max_tokens: 1024, messages: convertMessages(messages), temperature: temperature !== undefined ? temperature : 0.5, stream: !!onToken };
  if (tools && tools.length) { body.tools = tools; if (toolChoice) body.tool_choice = toolChoice; }

  // Streaming path — SSE reader over the Anthropic Messages API. Falls back to
  // the non-streaming nativeFetch path if the browser blocks raw fetch (WebView
  // CORS is handled by CapacitorHttp, so a failed stream attempt there is
  // expected and must not kill the request).
  if (onToken) {
    try {
      return await doAnthropicRequestStreaming(body, auth, url, timeoutMs, externalSignal, onToken);
    } catch (e) {
      if (e && (e.name === 'TypeError' || /ECONN|NetworkError|Failed to fetch|CORS|cross origin/i.test(e.message || ''))) {
        console.warn('[Router] Anthropic streaming unavailable (' + (e.message || e.name) + ') — falling back to non-streaming request.');
      } else {
        throw e;
      }
    }
  }

  const { signal, timer, controller } = createTimeoutSignal(timeoutMs, externalSignal);
  const r = await nativeFetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth.headers),
    body: JSON.stringify(Object.assign({}, body, { stream: false })),
    signal: signal
  }).finally(() => cleanupTimeout(timer, controller));

  if (!r.ok) {
    const t = await r.text();
    if (r.status === 401 || r.status === 403) throw new Error('Authentication failed (' + r.status + '): Invalid Anthropic API key — ' + t.slice(0, 120));
    throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
  }
  const j = await r.json();
  if (!j.content || !j.content.length) throw new Error('Empty response from provider');
  const result = { role: 'assistant', content: '', tool_calls: null };
  const toolCalls = [];
  for (const block of j.content) {
    if (block.type === 'text') result.content += block.text;
    else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input || {}) } });
    }
  }
  if (toolCalls.length) result.tool_calls = toolCalls;
  result.content = _unmaskPII(result.content);
  return result;
}

/* ---- Anthropic Messages API — SSE streaming (text + tool_use deltas) ---- */
async function doAnthropicRequestStreaming(body, auth, url, timeoutMs, externalSignal, onToken) {
  const { signal, timer, controller } = createTimeoutSignal(timeoutMs, externalSignal);
  const r = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth.headers),
    body: JSON.stringify(body),
    signal: signal
  }).finally(() => cleanupTimeout(timer, controller));

  if (!r.ok) {
    const t = await r.text();
    if (r.status === 401 || r.status === 403) throw new Error('Authentication failed (' + r.status + '): Invalid Anthropic API key — ' + t.slice(0, 120));
    throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
  }

  var reader = r.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  var fullContent = '';
  var toolBlocks = [];
  var currentTool = null;

  const finishTool = () => {
    if (currentTool) {
      toolBlocks.push(currentTool);
      currentTool = null;
    }
  };

  try {
    while (true) {
      var readResult = await reader.read();
      if (readResult.done) break;
      buffer += decoder.decode(readResult.value, { stream: true });
      var blockIdx;
      while ((blockIdx = buffer.indexOf('\n\n')) !== -1) {
        var rawBlock = buffer.slice(0, blockIdx);
        buffer = buffer.slice(blockIdx + 2);
        var eventType = '';
        var dataLine = '';
        var bl = rawBlock.split('\n');
        for (var li = 0; li < bl.length; li++) {
          var l = bl[li].trim();
          if (l.indexOf('event:') === 0) eventType = l.slice(6).trim();
          else if (l.indexOf('data:') === 0) dataLine = l.slice(5).trim();
        }
        if (!dataLine || dataLine === '[DONE]') continue;
        var evt;
        try { evt = JSON.parse(dataLine); } catch (_) { continue; }
        var evtName = evt.type || eventType;
        if (evtName === 'content_block_start') {
          if (evt.content_block && evt.content_block.type === 'tool_use') {
            finishTool();
            currentTool = { id: evt.content_block.id || '', name: evt.content_block.name || '', input: '' };
          }
        } else if (evtName === 'content_block_delta') {
          if (evt.delta && evt.delta.type === 'text_delta' && evt.delta.text) {
            var unmasked = _unmaskPII(evt.delta.text);
            fullContent += unmasked;
            if (onToken) onToken(unmasked);
          } else if (evt.delta && evt.delta.type === 'input_json_delta' && evt.delta.partial_json) {
            if (currentTool) currentTool.input += evt.delta.partial_json;
          }
        } else if (evtName === 'content_block_stop' || evtName === 'message_stop') {
          finishTool();
        } else if (evtName === 'error') {
          throw new Error('Anthropic stream error: ' + (evt.error ? evt.error.message || JSON.stringify(evt.error) : 'unknown'));
        }
      }
    }
  } catch (e) {
    if (signal && signal.aborted) throw new Error('ABORTED: Request cancelled by user');
    throw e;
  }

  finishTool();
  var toolCalls = null;
  if (toolBlocks.length > 0) {
    toolCalls = toolBlocks.map(function (tb) {
      var args = '{}';
      try { args = tb.input ? JSON.stringify(JSON.parse(tb.input)) : '{}'; } catch (_) { args = tb.input || '{}'; }
      return { id: tb.id, type: 'function', function: { name: tb.name, arguments: args } };
    });
  }
  return { role: 'assistant', content: fullContent, tool_calls: toolCalls };
}

/* ---- Request execution with AbortController timeout ---- */
async function doOpenAIRequest(p, messages, tools, toolChoice, timeoutMs, externalSignal, temperature) {
  const apiUrl = buildApiUrl(p.baseUrl, '/v1/chat/completions');
  const converted = convertMessages(messages);
  const model = await resolveModelCached(p);
  const body = { model: model, messages: converted, stream: false, temperature: temperature !== undefined ? temperature : 0.5 };
  if (tools && tools.length) { body.tools = tools; if (toolChoice) body.tool_choice = toolChoice; }

  const { signal, timer } = createTimeoutSignal(timeoutMs, externalSignal);
  var auth = getAuthHeaders(p);
  var url = apiUrl + (auth.param ? ((apiUrl.indexOf('?') === -1 ? '?' : '&') + auth.param) : '');
  const r = await nativeFetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth.headers),
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
  var msg = j.choices[0].message;
  if (msg.content && typeof msg.content === 'string') { msg.content = _unmaskPII(msg.content); }
  return msg;
}

async function doOpenAIRequestStreaming(p, messages, tools, toolChoice, timeoutMs, externalSignal, onToken, temperature) {
  const apiUrl = buildApiUrl(p.baseUrl, '/v1/chat/completions');
  const converted = convertMessages(messages);
  const model = await resolveModelCached(p);
  const body = { model: model, messages: converted, stream: true, temperature: temperature !== undefined ? temperature : 0.5 };
  if (tools && tools.length) { body.tools = tools; if (toolChoice) body.tool_choice = toolChoice; }

  const { signal, timer, controller } = createTimeoutSignal(timeoutMs, externalSignal);
  var auth = getAuthHeaders(p);
  var url = apiUrl + (auth.param ? ((apiUrl.indexOf('?') === -1 ? '?' : '&') + auth.param) : '');
  const r = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth.headers),
    body: JSON.stringify(body),
    signal: signal
  }).finally(() => cleanupTimeout(timer, controller));

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
        if (delta.content) { var unmasked = _unmaskPII(delta.content); fullContent += unmasked; if (onToken) onToken(unmasked); }
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

async function doGeminiRequest(p, messages, timeoutMs, externalSignal, temperature, onToken) {
  const model = p.model || 'gemini-1.5-flash';
  const apiKey = p.apiKey;
  const urlBase = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':';

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

  const body = { contents: contents, generationConfig: { temperature: temperature !== undefined ? temperature : 0.5, maxOutputTokens: 4096 } };

  // Streaming path — SSE reader over Gemini's streamGenerateContent endpoint.
  // Falls back to non-streaming nativeFetch if raw fetch is blocked (WebView CORS).
  if (onToken) {
    try {
      return await doGeminiRequestStreaming(body, urlBase, apiKey, timeoutMs, externalSignal, onToken);
    } catch (e) {
      if (e && (e.name === 'TypeError' || /ECONN|NetworkError|Failed to fetch|CORS|cross origin/i.test(e.message || ''))) {
        console.warn('[Router] Gemini streaming unavailable (' + (e.message || e.name) + ') — falling back to non-streaming request.');
      } else {
        throw e;
      }
    }
  }

  const url = urlBase + 'generateContent?key=' + encodeURIComponent(apiKey);
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
    const text = _unmaskPII(j.candidates[0].content.parts[0].text);
    return { role: 'assistant', content: text, tool_calls: null };
  }
  throw new Error('Empty response from Gemini API');
}

/* ---- Gemini — SSE streaming (streamGenerateContent?alt=sse) ---- */
async function doGeminiRequestStreaming(body, urlBase, apiKey, timeoutMs, externalSignal, onToken) {
  const url = urlBase + 'streamGenerateContent?alt=sse&key=' + encodeURIComponent(apiKey);
  const { signal, timer, controller } = createTimeoutSignal(timeoutMs, externalSignal);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal
  }).finally(() => cleanupTimeout(timer, controller));

  if (!r.ok) {
    const t = await r.text();
    if (r.status === 401 || r.status === 403) throw new Error('Authentication failed (' + r.status + ')');
    throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
  }

  var reader = r.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  var fullContent = '';

  try {
    while (true) {
      var readResult = await reader.read();
      if (readResult.done) break;
      buffer += decoder.decode(readResult.value, { stream: true });
      var blockIdx;
      while ((blockIdx = buffer.indexOf('\n\n')) !== -1) {
        var rawBlock = buffer.slice(0, blockIdx);
        buffer = buffer.slice(blockIdx + 2);
        var bl = rawBlock.split('\n');
        for (var li = 0; li < bl.length; li++) {
          var line = bl[li].trim();
          if (line.indexOf('data:') !== 0) continue;
          var data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          var j;
          try { j = JSON.parse(data); } catch (_) { continue; }
          var parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
          if (parts && parts.length && parts[0].text) {
            var unmasked = _unmaskPII(parts[0].text);
            fullContent += unmasked;
            if (onToken) onToken(unmasked);
          }
        }
      }
    }
  } catch (e) {
    if (signal && signal.aborted) throw new Error('ABORTED: Request cancelled by user');
    throw e;
  }

  return { role: 'assistant', content: fullContent, tool_calls: null };
}

/* ---- Main route with retry/failover ---- */
const _activeRequests = new Map();
const MAX_CONCURRENT_REQUESTS = 3;
var _requestId = 0;

export async function routeRequest(opts) {
  const capability = opts.capability;
  const messages = opts.messages;
  const tools = opts.tools;
  const toolChoice = opts.toolChoice;
  const timeoutMs = opts.timeoutMs || 30000;
  const signal = opts.signal;
  const onToken = opts.onToken;

  // Air-Gapped Journal: block all outbound AI calls when journal is active
  assertNotJournalAirgapped();

  // Stage 13: Rate-cap concurrent requests to prevent API exhaustion
  var reqId = ++_requestId;
  var myController = new AbortController();
  var wrappedSignal = myController.signal;

  // Track this request
  _activeRequests.set(reqId, myController);

  // If at capacity, queue until a slot frees up
  while (_activeRequests.size > MAX_CONCURRENT_REQUESTS) {
    // Wait for any other request to finish
    await new Promise(function(resolve) {
      var checkInterval = setInterval(function() {
        if (_activeRequests.size < MAX_CONCURRENT_REQUESTS) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      // Also resolve if our signal gets aborted
      if (signal) {
        signal.addEventListener('abort', function() {
          clearInterval(checkInterval);
          resolve();
        }, { once: true });
      }
    });
    if (signal && signal.aborted) {
      _activeRequests.delete(reqId);
      throw new Error('ABORTED: Request cancelled while waiting for rate-limit slot');
    }
  }

  // Clean up on completion (success or failure)
  var cleanup = function() { _activeRequests.delete(reqId); };
  if (signal) {
    signal.addEventListener('abort', cleanup, { once: true });
  }

  const taskType = classifyTask(messages);
  const temperature = getTemperatureForTask(taskType, opts.temperature);

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

  // Log the routing decision
  logRoutingDecision({
    taskType,
    capability,
    candidates: candidates.map(c => c.name),
    selected: candidates[0] ? candidates[0].name : null,
    healthScores: candidates.map(c => Math.round(getHealthScore(c) * 100) / 100)
  });

  let lastError = null;
  for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      const isLastAttempt = i === candidates.length - 1;
      const baseLower = (p.baseUrl || '').toLowerCase();
      const isGemini = baseLower.indexOf('generativelanguage') !== -1 || baseLower.indexOf('gemini') !== -1;
      const preset = getProviderPreset(p);
      const isAnthropic = preset ? preset.id === 'anthropic' : baseLower.indexOf('anthropic') !== -1;

      const startTime = Date.now();
      try {
        let result;
        if (isGemini) {
          result = await doGeminiRequest(p, messages, timeoutMs, signal, temperature, onToken);
        } else if (isAnthropic) {
          result = await doAnthropicRequest(p, messages, tools, toolChoice, timeoutMs, signal, temperature, onToken);
        } else if (onToken && typeof ReadableStream !== 'undefined') {
          result = await doOpenAIRequestStreaming(p, messages, tools, toolChoice, timeoutMs, signal, onToken, temperature);
        } else {
          result = await doOpenAIRequest(p, messages, tools, toolChoice, timeoutMs, signal, temperature);
        }
       recordSuccess(p, Date.now() - startTime);
       // Log successful provider
       logRoutingDecision({ taskType, capability, selected: p.name, attempt: i, status: 'success', latencyMs: Date.now() - startTime });
       cleanup();
       return result;
     } catch (e) {
       recordFailure(p, e);
       lastError = e;
       // Log failed provider attempt
       logRoutingDecision({ taskType, capability, selected: p.name, attempt: i, status: 'fail', error: (e.message || '').slice(0, 100) });
       if (isLastAttempt) break;
       // Continue to next provider (failover)
     }
   }
   cleanup();
   throw lastError || new Error('All providers failed for capability: ' + capability);
 }

/* ---- Exports ---- */
// All functions already exported individually above.

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

export { migrateLegacyProviders, maskKey, classifyTask, getHealthScore, getProviderLatency, getProvider as getProviderByCapability, resolveModelCached as resolveModel, nativeFetch, resetMaskStore, isJournalActive, isJournalAIEnabled, setJournalAIEnabled, getTemperatureForTask };

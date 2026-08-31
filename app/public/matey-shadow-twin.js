/* MateyShadowTwin — Cost-Safe Speculative Pre-Fetching
 *
 * Detects recognizable error signatures locally (zero AI cost) via
 * ASTIndex.validateParse(), then optionally fires ONE speculative API call
 * in the background when the user has opted in via Settings.
 *
 * Safeguards:
 *  - Rate cap: max 3 speculative calls per 10-minute rolling window (hard-enforced)
 *  - Auto-discard: speculative results unused for 60s are dropped — never force-applied
 *  - Transparency log: every speculative action (fired/blocked/discarded) is recorded
 *
 * Public API:
 *   MateyShadowTwin.checkContent(content, filePath) — call on editor content change
 *   MateyShadowTwin.getPendingResult(userQuery) — returns cached result if query matches
 *   MateyShadowTwin.getLog() — returns transparency log entries
 *   MateyShadowTwin.isEnabled() — reads the settings toggle
 */

import { ASTIndexClient as ASTIndex } from './matey-ast-client.js';
import { routeRequest } from './matey-byok-module.js';

const SHADOW_TWIN_MAX_CALLS = 3;
const SHADOW_TWIN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SHADOW_TWIN_TTL_MS = 60 * 1000; // 60 seconds
const SHADOW_TWIN_SETTING_KEY = 'matey-shadow-twin-enabled';

class ShadowTwin {
  constructor() {
    this._callTimestamps = []; // timestamps of fired speculative calls
    this._log = []; // transparency log
    this._pending = []; // pending speculative results with TTL
    this._lastCheckContent = ''; // dedup: don't re-check identical content
    this._lastCheckTime = 0;
    this._debounceMs = 1500; // debounce error detection
    this._discardTimer = null;
    this._startDiscardWatcher();
  }

  /* ---- Settings ---- */
  isEnabled() {
    try { return localStorage.getItem(SHADOW_TWIN_SETTING_KEY) === 'true'; } catch (e) { return false; }
  }
  setEnabled(v) {
    try { localStorage.setItem(SHADOW_TWIN_SETTING_KEY, String(!!v)); } catch (e) {}
  }

  /* ---- Rate limiter ---- */
  _pruneWindow() {
    const cutoff = Date.now() - SHADOW_TWIN_WINDOW_MS;
    this._callTimestamps = this._callTimestamps.filter(t => t > cutoff);
  }
  _canFire() {
    this._pruneWindow();
    return this._callTimestamps.length < SHADOW_TWIN_MAX_CALLS;
  }
  _recordCall() {
    this._callTimestamps.push(Date.now());
  }
  getRemainingCalls() {
    this._pruneWindow();
    return Math.max(0, SHADOW_TWIN_MAX_CALLS - this._callTimestamps.length);
  }

  /* ---- Transparency log ---- */
  _logAction(status, details) {
    const entry = {
      timestamp: Date.now(),
      status, // 'fired' | 'blocked' | 'discarded' | 'used'
      details: details || ''
    };
    this._log.unshift(entry);
    if (this._log.length > 200) this._log.pop();
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('matey-shadow-twin-log', JSON.stringify(this._log)); } catch (e) {}
    }
  }
  getLog() {
    return this._log.slice();
  }
  loadLog() {
    try {
      const raw = localStorage.getItem('matey-shadow-twin-log');
      if (raw) this._log = JSON.parse(raw);
    } catch (e) {}
  }

  /* ---- Auto-discard watcher ---- */
  _startDiscardWatcher() {
    if (typeof window === 'undefined') return;
    this._discardTimer = setInterval(() => {
      const now = Date.now();
      const before = this._pending.length;
      const expired = this._pending.filter(p => now - p.timestamp > SHADOW_TWIN_TTL_MS);
      expired.forEach(p => {
        this._logAction('discarded', `Expired after ${Math.round((now - p.timestamp) / 1000)}s: ${p.errorContext.substring(0, 80)}`);
      });
      this._pending = this._pending.filter(p => now - p.timestamp <= SHADOW_TWIN_TTL_MS);
    }, 5000);
  }

  /* ---- Error detection ---- */
  async checkContent(content, filePath) {
    if (!this.isEnabled()) return null;

    // Debounce: skip if same content checked recently
    const now = Date.now();
    if (content === this._lastCheckContent && (now - this._lastCheckTime) < this._debounceMs) {
      return null;
    }
    this._lastCheckContent = content;
    this._lastCheckTime = now;

    // Skip very short content (not meaningful to parse)
    if (!content || content.trim().length < 10) return null;

    // Detect error via local AST parse (zero cost)
    let validation = null;
    try {
      const langHint = ASTIndex.detectLanguage(filePath || '');
      validation = await ASTIndex.validateParse(content, langHint);
    } catch (e) {
      return null;
    }

    if (!validation || validation.valid) return null;

    // Error detected — extract context
    const errorCtx = validation.firstError ?
      `Line ${validation.firstError.line}: ${validation.firstError.text}` :
      `${validation.errorNodes} syntax error(s) detected`;

    // Check rate limiter
    if (!this._canFire()) {
      this._logAction('blocked', `Rate limit (${SHADOW_TWIN_MAX_CALLS}/${SHADOW_TWIN_WINDOW_MS / 60000}min): ${errorCtx}`);
      return { blocked: true, errorCtx };
    }

    // Fire speculative call
    this._recordCall();
    this._logAction('fired', `Speculative call #${this._callTimestamps.length}: ${errorCtx}`);

    const speculation = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      errorContext: errorCtx,
      errorNodes: validation.errorNodes,
      firstError: validation.firstError,
      filePath: filePath || '',
      contentSnapshot: content.substring(0, 500),
      result: null,
      status: 'pending'
    };
    this._pending.push(speculation);

    // Fire the actual API call in the background
    this._fireSpeculativeCall(speculation);

    return { fired: true, speculationId: speculation.id, errorCtx };
  }

  async _fireSpeculativeCall(speculation) {
    try {
      const prompt = this._buildErrorPrompt(speculation);
      let result = null;

      const choice = await routeRequest({
        capability: 'text-gen',
        messages: [
          { role: 'system', content: 'You are Matey\'s coding assistant. Given a syntax error, explain the issue concisely and provide a fix. Keep it under 3 sentences.' },
          { role: 'user', content: prompt }
        ],
        tools: [],
        toolChoice: 'none',
        timeoutMs: 15000
      });
      result = choice.content || '';

      // Update speculation with result (if not already discarded)
      const pending = this._pending.find(p => p.id === speculation.id);
      if (pending) {
        pending.result = result || 'No suggestion available';
        pending.status = 'ready';
      }
    } catch (e) {
      const pending = this._pending.find(p => p.id === speculation.id);
      if (pending) {
        pending.result = null;
        pending.status = 'error';
        pending.error = e.message || String(e);
      }
    }
  }

  _buildErrorPrompt(spec) {
    const file = spec.filePath || 'file';
    const err = spec.firstError || {};
    return `I have a syntax error in ${file}:\n` +
      `Line ${err.line || '?'}: ${err.text || 'unknown error'}\n` +
      `Context:\n${spec.contentSnapshot}\n\n` +
      `What's wrong and how do I fix it?`;
  }

  /* ---- Retrieve pending result ---- */
  getPendingResult(userQuery) {
    if (!userQuery) return null;
    const now = Date.now();
    // Find a pending speculation whose error context relates to the query
    for (let i = this._pending.length - 1; i >= 0; i--) {
      const p = this._pending[i];
      if (now - p.timestamp > SHADOW_TWIN_TTL_MS) continue;
      if (p.status !== 'ready' || !p.result) continue;

      // Simple relevance check: does the query mention the error line or nearby context?
      const errLine = p.firstError ? String(p.firstError.line) : '';
      const query = userQuery.toLowerCase();
      const isRelevant =
        (errLine && userQuery.includes(errLine)) ||
        (p.errorContext && query.includes(p.errorContext.toLowerCase().split(':')[0])) ||
        query.includes('error') || query.includes('fix') || query.includes('wrong') ||
        query.includes('syntax') || query.includes('help');

      if (isRelevant) {
        this._logAction('used', `Result used for query: "${userQuery.substring(0, 60)}"`);
        const result = p.result;
        // Remove from pending (consumed)
        this._pending.splice(i, 1);
        return { result, errorContext: p.errorContext, age: Math.round((now - p.timestamp) / 1000) };
      }
    }
    return null;
  }

  getPending() {
    const now = Date.now();
    return this._pending
      .filter(p => now - p.timestamp <= SHADOW_TWIN_TTL_MS)
      .map(p => ({
        id: p.id,
        status: p.status,
        errorContext: p.errorContext,
        age: Math.round((now - p.timestamp) / 1000),
        hasResult: !!p.result
      }));
  }

  /* ---- Lifecycle ---- */
  dispose() {
    if (this._discardTimer) {
      clearInterval(this._discardTimer);
      this._discardTimer = null;
    }
  }
}

const MateyShadowTwin = new ShadowTwin();
MateyShadowTwin.loadLog();

if (typeof window !== 'undefined') {
  window.MateyShadowTwin = MateyShadowTwin;
}

export { MateyShadowTwin, ShadowTwin };

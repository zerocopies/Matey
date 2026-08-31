import { readFile, writeFile, listFiles } from './matey-fs-module.js';
import { routeRequest } from './matey-byok-module.js';
import { mateyCoach } from './matey-coach.js';
import { MateyContinuum } from './matey-continuum.js';
import { TieredDiffMatcher, DIFF_REGEX } from './matey-tiered-diff.js';
import { ConfidenceScorer, StyleProfiler } from './matey-style-memory.js';

import { countTokens } from 'gpt-tokenizer';
import { ASTIndexClient as ASTIndex } from './matey-ast-client.js';

const DEFAULT_MODEL_CONTEXT_WINDOW = 128000;
const TOKENS_PER_MESSAGE_FUDGE = 4;
const PRESERVE_SYSTEM = true;
const PROTECTED_ROLES = new Set(['system', 'user']);

// Hard-coded model context windows (input + output combined).
// When a new model is encountered, the default is used.
const MODEL_CONTEXT_WINDOWS = {
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-0125': 16385,
  'gpt-3.5-turbo-1106': 16385,
  'gpt-4o': 128000,
  'gpt-4o-2024-08-06': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-4-0125-preview': 128000,
  'gpt-4-1106-preview': 128000,
  'gpt-4-vision-preview': 128000,
  'gemini-1.5-flash': 1048576,
  'gemini-1.5-pro': 1048576,
  'gemini-1.0-pro': 30720,
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
  'command-r': 128000,
  'command-r7b': 240000,
};

function getModelContextWindow(model) {
  if (!model) return DEFAULT_MODEL_CONTEXT_WINDOW;
  const m = model.toLowerCase().trim();
  if (MODEL_CONTEXT_WINDOWS[m]) return MODEL_CONTEXT_WINDOWS[m];
  const key = Object.keys(MODEL_CONTEXT_WINDOWS).find(k => m.includes(k.toLowerCase()));
  return key ? MODEL_CONTEXT_WINDOWS[key] : DEFAULT_MODEL_CONTEXT_WINDOW;
}

function estimateTokenCount(text) {
  if (!text) return 0;
  try {
    return countTokens(String(text));
  } catch (e) {
    const str = String(text);
    const words = str.trim().split(/\s+/).length;
    return Math.ceil(words * 1.3);
  }
}

function estimateMessageTokens(msg) {
  let tokens = TOKENS_PER_MESSAGE_FUDGE;
  if (msg.role) tokens += 1;
  if (typeof msg.content === 'string') {
    tokens += estimateTokenCount(msg.content);
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part.type === 'text') tokens += estimateTokenCount(part.text);
    }
  }
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      tokens += estimateTokenCount(tc.function?.name || '');
      tokens += estimateTokenCount(tc.function?.arguments || '');
    }
  }
  return tokens;
}

function countConversationTokens(history) {
  let total = 0;
  for (const msg of history) total += estimateMessageTokens(msg);
  return total;
}

function pruneHistoryByTokens(history, maxTokens, preserveSystem = true) {
  const pruned = [...history];
  let total = countConversationTokens(pruned);

  if (total <= maxTokens) return { pruned, removed: 0 };

  let systemMsg = null;
  let messages = pruned;
  if (preserveSystem && pruned[0]?.role === 'system') {
    systemMsg = pruned[0];
    messages = pruned.slice(1);
  }

  // Track which messages contain the protected 'user' task prompt.
  // The user message containing the task must NEVER be pruned.
  while (total > maxTokens && messages.length > 0) {
    // Find the oldest non-protected message to remove
    let removed = null;
    let removedIdx = -1;
    for (let i = 0; i < messages.length; i++) {
      if (!PROTECTED_ROLES.has(messages[i].role)) {
        removed = messages.splice(i, 1)[0];
        removedIdx = i;
        break;
      }
    }
    // If only protected messages remain, stop pruning (can't remove them)
    if (!removed) break;
    total -= estimateMessageTokens(removed);
  }

  if (systemMsg) {
    messages.unshift(systemMsg);
  }
  return { pruned: messages, removed: Math.max(0, history.length - messages.length) };
}

class HarnessLogger {
  static log(step, action, details) {
    const timestamp = new Date().toISOString().split('T')[1];
    console.log(`[Agent Harness | ${timestamp}] STEP ${step}: ${action}`, details || '');
  }
  static error(step, action, error) {
    console.error(`[Agent Harness | STEP ${step}] ERROR in ${action}:`, error);
  }
}

// Toast helper — replaces alert(), matches app's design system (#0D0D0D bg, #2A2A2A border, #B583FC accent)
class AgentToast {
  static show(message, isError = false) {
    let el = document.getElementById('agent-toast');
    if (!el) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="agent-toast" style="position:fixed; bottom:90px; left:16px; right:16px; background:#0D0D0D; border:1px solid ${isError ? '#E85D5D' : '#2A2A2A'}; border-radius:16px; padding:14px 16px; color:#FFFFFF; font-size:14px; z-index:10000; transform:translateY(150%); transition:transform 0.4s ease; box-shadow:0 10px 30px rgba(0,0,0,0.5);"></div>
      `);
      el = document.getElementById('agent-toast');
    }
    el.style.borderColor = isError ? '#E85D5D' : '#2A2A2A';
    el.innerText = message;
    el.style.transform = 'translateY(0)';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.transform = 'translateY(150%)'; }, 6000);
  }
}

// Live progress indicator — shows step-by-step status in the chat UI instead of silence
class AgentProgress {
  static update(stepText) {
    let el = document.getElementById('agent-progress');
    if (!el) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="agent-progress" style="position:fixed; top:70px; left:16px; right:16px; background:#0D0D0D; border:1px solid #2A2A2A; border-radius:12px; padding:8px 14px; color:#B3B3B3; font-size:12px; z-index:9999; display:none; align-items:center; gap:8px;">
          <span class="agent-spinner" style="width:10px; height:10px; border:2px solid #B583FC; border-top-color:transparent; border-radius:50%; display:inline-block; animation:agent-spin 0.8s linear infinite;"></span>
          <span id="agent-progress-text"></span>
        </div>
        <style>@keyframes agent-spin { to { transform: rotate(360deg); } }</style>
      `);
      el = document.getElementById('agent-progress');
    }
    document.getElementById('agent-progress-text').innerText = stepText;
    el.style.display = 'flex';
  }
  static hide() {
    const el = document.getElementById('agent-progress');
    if (el) el.style.display = 'none';
  }
}

class ContextRetriever {
  static MAX_FILE_LINES = 1000;
  static MAX_TREE_ENTRIES = 500;

  static _getFS() {
    return window.MateyFS || window.FileSystemManager;
  }

  static async _safeReadFile(filePath) {
    var cleanPath = sanitizePath(filePath);
    var fs = this._getFS();
    if (fs && typeof fs.readFile === 'function') {
      try {
        return await safeToolCall(fs.readFile.bind(fs), [cleanPath]);
      } catch (e) {
        var classification = classifyError(e);
        if (classification.code !== 'PERMANENT' || classification.reason !== 'no_workspace') {
          throw e;
        }
      }
    }
    return safeToolCall(readFile, [cleanPath]);
  }

  static async _safeListFiles(subDir) {
    var cleanPath = sanitizePath(subDir || '');
    var fs = this._getFS();
    if (fs && typeof fs.listFiles === 'function') {
      try {
        return await safeToolCall(fs.listFiles.bind(fs), [cleanPath]);
      } catch (e) {
        var classification = classifyError(e);
        if (classification.code !== 'PERMANENT' || classification.reason !== 'no_workspace') {
          throw e;
        }
      }
    }
    return safeToolCall(listFiles, [cleanPath]);
  }

  static _normalizeListEntry(entry, subDir) {
    if (entry.path !== undefined) return entry;
    var path = subDir ? subDir + '/' + entry.name : entry.name;
    return {
      path: path,
      name: entry.name,
      type: entry.kind === 'directory' ? 'directory' : 'file'
    };
  }

  static async assemble(prompt, activeFilePath, cursorLine) {
    let activeFileContext = null;
        const CURSOR_WINDOW = 50; // Stage 4f legacy — replaced by AST scoping in Stage 4.5

    if (activeFilePath) {
      try {
        const content = await this._safeReadFile(activeFilePath);
        const lines = content.split('\n');
        const totalLines = lines.length;

        // Stage 4.5: AST-based context extraction (replaces ±50-line cursor window)
        // Extract: target function's full body, direct imports, immediate callers
        let astContext = null;
        try {
          astContext = await ASTIndex.getFunctionContext(activeFilePath, cursorLine, content);
        } catch (e) { /* AST failed — fall back to line-based */ }

        if (astContext && astContext.type === 'ast-scoped') {
          // Compute old ±50-line window size for before/after comparison
          var cursorPos = (cursorLine || 1) - 1;
          var oldStart = Math.max(0, cursorPos - Math.floor(CURSOR_WINDOW / 2));
          var oldEnd = Math.min(totalLines, oldStart + CURSOR_WINDOW);
          oldStart = Math.max(0, oldEnd - CURSOR_WINDOW);
          var oldWindowContent = lines.slice(oldStart, oldEnd).join('\n');

          activeFileContext = {
            path: activeFilePath,
            content: astContext.content,       // AST-scoped: function body + imports + callers
            fullContent: content,               // full file for pre-flight validation
            lineCount: totalLines,
            cursorLine: cursorLine,
            truncated: totalLines > this.MAX_FILE_LINES,
            astScoped: true,
            functionName: astContext.functionName,
            contextStartLine: astContext.startLine,
            contextEndLine: astContext.endLine,
            // Before/after context-size metrics (Stage 4.5 upgrade)
            oldWindowBytes: oldWindowContent.length,
            astBytes: astContext.content.length,
            oldWindowTokens: Math.ceil(oldWindowContent.length / 4),
            astTokens: astContext.astTokenEstimate,
            contextBytesSaved: oldWindowContent.length - astContext.content.length,
            contextTokensSaved: Math.ceil(oldWindowContent.length / 4) - astContext.astTokenEstimate,
            errorNodes: astContext.errorNodes,
          };
          HarnessLogger.log(0, 'AST_CONTEXT',
            `AST-scoped context: ${oldWindowContent.length}→${astContext.content.length} bytes ` +
            `(${Math.ceil(oldWindowContent.length / 4)}→${astContext.astTokenEstimate} tokens), ` +
            `function="${astContext.functionName}"`);
        } else {
          // Fallback: line-based context (legacy Stage 4f approach)
          if (cursorLine != null && totalLines > CURSOR_WINDOW * 2) {
            var start = Math.max(0, cursorLine - Math.floor(CURSOR_WINDOW / 2));
            var end = Math.min(totalLines, start + CURSOR_WINDOW);
            start = Math.max(0, end - CURSOR_WINDOW);
            var windowContent = lines.slice(start, end).join('\n');
            activeFileContext = {
              path: activeFilePath,
              content: windowContent,
              fullContent: content,
              lineCount: totalLines,
              cursorLine: cursorLine,
              windowStart: start + 1,
              windowEnd: end,
              truncated: true,
              cursorWindow: true,
              astScoped: false
            };
          } else if (lines.length > this.MAX_FILE_LINES) {
            activeFileContext = {
              path: activeFilePath,
              content: lines.slice(0, this.MAX_FILE_LINES).join('\n'),
              fullContent: content,
              lineCount: lines.length,
              truncated: true,
              astScoped: false
            };
          } else {
            activeFileContext = { path: activeFilePath, content, fullContent: content, astScoped: false };
          }
        }
      } catch (e) {
        const classification = classifyError(e);
        HarnessLogger.log(0, 'CONTEXT_READ_FAILED', `Active file "${activeFilePath}" could not be read: code=${classification.code}, reason=${classification.reason}`);
        if (classification.code !== 'CANCELLED') {
          AgentToast.show(`Could not read "${activeFilePath}": ${e.message}`, true);
        }
      }
    }

    const mentions = this.extractMentions(prompt);
    const filenameHints = this.extractFilenameHints(prompt);
    const mentionedFilesContext = [];
    const seen = new Set();
    for (const path of mentions) {
      if (seen.has(path)) continue;
      seen.add(path);
      try {
        const content = await this._safeReadFile(path);
        const lines = content.split('\n');
        if (lines.length > this.MAX_FILE_LINES) {
          mentionedFilesContext.push({
            path,
            content: lines.slice(0, this.MAX_FILE_LINES).join('\n'),
            lineCount: lines.length,
            truncated: true
          });
        } else {
          mentionedFilesContext.push({ path, content });
        }
      } catch (e) {
        const classification = classifyError(e);
        HarnessLogger.log(0, 'CONTEXT_MENTION_FAILED', `Mentioned file "${path}" could not be read: code=${classification.code}, reason=${classification.reason}, message=${e.message}`);
      }
    }
    for (const path of filenameHints) {
      if (seen.has(path)) continue;
      seen.add(path);
      try {
        const content = await this._safeReadFile(path);
        const lines = content.split('\n');
        if (lines.length > this.MAX_FILE_LINES) {
          mentionedFilesContext.push({
            path,
            content: lines.slice(0, this.MAX_FILE_LINES).join('\n'),
            lineCount: lines.length,
            truncated: true
          });
        } else {
          mentionedFilesContext.push({ path, content });
        }
      } catch (e) {
        const classification = classifyError(e);
        HarnessLogger.log(0, 'CONTEXT_HINT_FAILED', `Hinted file "${path}" could not be read: code=${classification.code}, reason=${classification.reason}`);
      }
    }

    let files = [];
    try {
      files = await this._safeListFiles('');
    } catch (e) {
      const classification = classifyError(e);
      HarnessLogger.log(0, 'CONTEXT_LIST_FAILED', `listFiles failed: code=${classification.code}, reason=${classification.reason}, message=${e.message}`);
      if (classification.code !== 'CANCELLED') {
        AgentToast.show(`Could not list workspace files: ${e.message}`, true);
      }
    }
    const workspaceTree = files.slice(0, this.MAX_TREE_ENTRIES).map(f => {
      if (f.path !== undefined) return f.path;
      return f.name;
    });

    return {
      activeFileContext,
      mentionedFilesContext,
      workspaceTree,
      truncated: files.length > this.MAX_TREE_ENTRIES ||
        (activeFileContext?.truncated) ||
        mentionedFilesContext.some(f => f.truncated)
    };
  }

  static extractMentions(prompt) {
    if (!prompt || typeof prompt !== 'string') return [];
    const patterns = [
      /["']([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,10})["']/g,
      /\b([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,10})\b/g,
    ];
    const found = [];
    const seen = new Set();
    for (const pattern of patterns) {
      let match;
      const re = new RegExp(pattern.source, pattern.flags);
      while ((match = re.exec(prompt)) !== null) {
        const path = match[1];
        if (path.length > 256) continue;
        if (path.includes('://') || path.includes('www.')) continue;
        if (!seen.has(path)) {
          seen.add(path);
          found.push(path);
        }
      }
    }
    return found;
  }

  static extractFilenameHints(prompt) {
    if (!prompt || typeof prompt !== 'string') return [];
    const bareNames = prompt.match(/\b([a-zA-Z][a-zA-Z0-9_./-]*\.[a-zA-Z]{1,10})\b/g);
    const result = [];
    const seen = new Set();
    if (bareNames) {
      for (const name of bareNames) {
        if (!seen.has(name) && name.length <= 256) {
          seen.add(name);
          result.push(name);
        }
      }
    }
    return result;
  }
}

const RETRY_CODES = new Set(['NETWORK_ERROR', 'TIMEOUT']);
const PERMANENT_CODES = new Set(['PERMANENT']);
const CANCELLED_CODES = new Set(['CANCELLED']);

function classifyError(err) {
  var errName = err && err.name;
  var errMsg = (err && err.message) ? err.message.toLowerCase() : '';

  if (errName === 'AbortError') {
    return { code: 'CANCELLED', userCancelled: true };
  }

  if (errMsg.includes('cancelled by user') || errMsg.includes('user_cancelled')) {
    return { code: 'CANCELLED', userCancelled: true };
  }

  if (errMsg.includes('no active workspace') || errMsg.includes('selectworkspace')) {
    return { code: 'PERMANENT', reason: 'no_workspace' };
  }

  if (errMsg.includes('usb may be disconnected') || errMsg.includes('original file unchanged')) {
    return { code: 'PERMANENT', reason: 'no_workspace' };
  }

  if (errName === 'NotFoundError' || errMsg.includes('file not found') || errMsg.includes('not found')) {
    return { code: 'PERMANENT', reason: 'not_found' };
  }

  if (errName === 'NotAllowedError' || errMsg.includes('permission denied') || errMsg.includes('workspace permission revoked')) {
    return { code: 'PERMANENT', reason: 'permission' };
  }

  return { code: 'UNKNOWN', reason: 'unrecognized' };
}

/* ==================== Per-Workspace Fix Memory (IndexedDB) ==================== */
class FixMemory {
  static _db = null;
  static DB_NAME = 'matey-fix-memory';
  static STORE_NAME = 'fixes';

  static async _open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /* workspace name from MateyFS, with fallback to localStorage */
  static _workspaceName() {
    try {
      const fs = window.MateyFS || window.FileSystemManager;
      if (fs && typeof fs.getCurrentWorkspace === 'function') {
        const ws = fs.getCurrentWorkspace();
        if (ws && ws.name) return ws.name;
      }
    } catch (_) {}
    try {
      return localStorage.getItem('matey-last-workspace') || 'default';
    } catch (_) { return 'default'; }
  }

  /* Normalized error signature: tool:code:reason (all lower, trimmed) */
  static signature(toolName, errorCode, reason) {
    return [toolName, errorCode, reason || ''].map(s => String(s).toLowerCase().trim()).join(':');
  }

  /* composite key for store: workspace + signature */
  static _key(workspace, signature) {
    return workspace + '::' + signature;
  }

  /* Look up a previously-recorded fix. Returns { whatFixed, fixedAt } or null. */
  static async get(workspace, errorSignature) {
    try {
      const db = await this._open();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_NAME, 'readonly');
        const store = tx.objectStore(this.STORE_NAME);
        const req = store.get(this._key(workspace, errorSignature));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (_) { return null; }
  }

  /* Record a successful fix for an error signature. */
  static async recordFix(toolName, errorCode, reason, whatFixed) {
    try {
      const workspace = this._workspaceName();
      const sig = this.signature(toolName, errorCode, reason);
      const db = await this._open();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        store.put({
          id: this._key(workspace, sig),
          workspace,
          signature: sig,
          whatFixed: whatFixed,
          fixedAt: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) { return false; }
  }

  /* Build a hint string for injection into conversation context */
  static async buildHint(toolName, errorCode, reason) {
    const workspace = this._workspaceName();
    const sig = this.signature(toolName, errorCode, reason);
    const entry = await this.get(workspace, sig);
    if (!entry) return null;
    return `Note: the error "${sig}" was seen before in workspace "${workspace}" and was fixed by: ${entry.whatFixed}. Consider that first.`;
  }
}

class ToolError extends Error {
  constructor(message, code, retryable, data) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.data = data || {};
  }
}

async function safeToolCall(fn, args, opts) {
  opts = opts || {};
  var maxRetries = opts.retries != null ? opts.retries : 1;
  var attempt = 0;

  while (true) {
    try {
      var result = await fn.apply(null, args);
      if (attempt > 0) {
        HarnessLogger.log(attempt, 'RETRY_SUCCESS', 'Tool call succeeded after retry');
      }
      return result;
    } catch (err) {
      attempt++;
      var classification = classifyError(err);

      if (classification.code === 'CANCELLED') {
        throw new ToolError('User cancelled action', 'CANCELLED', false, { userCancelled: true });
      }

      if (classification.code === 'PERMANENT') {
        throw new ToolError(err.message, 'PERMANENT', false, { reason: classification.reason });
      }

      if (attempt <= maxRetries) {
        HarnessLogger.log(attempt, 'RETRY', `Retrying tool call (${attempt}/${maxRetries}): ${err.message}`);
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 250));
        continue;
      }

      throw new ToolError(err.message, 'UNKNOWN', false, { reason: classification.reason });
    }
  }
}

function sanitizePath(path) {
  if (path === null || path === undefined) throw new Error('Invalid path: path is null/undefined');
  if (typeof path !== 'string') throw new Error('Invalid path: path must be a string');
  var clean = path.replace(/^\/+|\/+$/g, '');
  if (clean === '') return '';
  var parts = clean.split('/');
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === '..' || parts[i] === '.') {
      throw new Error('Path traversal blocked: ".." or "." not allowed in path');
    }
  }
  return clean;
}

class ToolDispatcher {
  constructor() {
    this.registry = new Map();

    this.registry.set('read_file', {
      schema: { name: 'read_file', description: 'Read the contents of a specific file.',
        parameters: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } },
      handler: async (args) => {
        var cleanPath = sanitizePath(args.filePath);
        var fs = window.MateyFS || window.FileSystemManager;
        if (fs && typeof fs.readFile === 'function') {
          try {
            return await safeToolCall(fs.readFile.bind(fs), [cleanPath]);
          } catch (e) {
            var cls = classifyError(e);
            if (cls.code !== 'PERMANENT' || cls.reason !== 'no_workspace') throw e;
            return await safeToolCall(readFile, [cleanPath]);
          }
        }
        return await safeToolCall(readFile, [cleanPath]);
      }
    });

    this.registry.set('write_file', {
      schema: { name: 'write_file', description: 'Create a new file or completely overwrite an existing file.',
        parameters: { type: 'object', properties: { filePath: { type: 'string' }, content: { type: 'string' } }, required: ['filePath', 'content'] } },
       handler: async (args) => {
        var cleanPath = sanitizePath(args.filePath);
        var fs = window.MateyFS || window.FileSystemManager;
        if (fs && typeof fs.safeWrite === 'function') {
          try {
            await safeToolCall(fs.safeWrite.bind(fs), [cleanPath, args.content, { force: true }]);
          } catch (e) {
            var cls = classifyError(e);
            if (cls.code !== 'PERMANENT' || cls.reason !== 'no_workspace') throw e;
            await safeToolCall(writeFile, [cleanPath, args.content]);
          }
        } else {
          await safeToolCall(writeFile, [cleanPath, args.content]);
        }
        return { success: true };
      }
    });

    this.registry.set('list_workspace_files', {
      schema: { name: 'list_workspace_files', description: 'List all files and folders in a given directory path.',
        parameters: { type: 'object', properties: { subDir: { type: 'string' } } } },
      handler: async (args) => {
        var cleanPath = sanitizePath(args.subDir || '');
        var fs = window.MateyFS || window.FileSystemManager;
        var raw;
        if (fs && typeof fs.listFiles === 'function') {
          try {
            raw = await safeToolCall(fs.listFiles.bind(fs), [cleanPath]);
          } catch (e) {
            var cls = classifyError(e);
            if (cls.code !== 'PERMANENT' || cls.reason !== 'no_workspace') throw e;
            raw = await safeToolCall(listFiles, [cleanPath]);
          }
        } else {
          raw = await safeToolCall(listFiles, [cleanPath]);
        }
        return raw.map(f => f.path !== undefined ? f : { path: cleanPath ? cleanPath + '/' + f.name : f.name, name: f.name, type: f.kind === 'directory' ? 'directory' : 'file' });
      }
    });

    this.registry.set('search_codebase', {
      schema: { name: 'search_codebase', description: 'Search the entire workspace for a specific text string or function name. Returns surrounding context lines around each match.',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      handler: async (args) => {
        var cleanQuery = args.query || '';
        var fs = window.MateyFS || window.FileSystemManager;
        var files;
        if (fs && typeof fs.listFiles === 'function') {
          try {
            var rawFiles = await safeToolCall(fs.listFiles.bind(fs), ['']);
            files = rawFiles.map(f => f.path !== undefined ? f : { path: f.name, name: f.name, type: f.kind === 'directory' ? 'directory' : 'file' });
          } catch (e) {
            var cls = classifyError(e);
            if (cls.code !== 'PERMANENT' || cls.reason !== 'no_workspace') throw e;
            files = await safeToolCall(listFiles, ['']);
          }
        } else {
          files = await safeToolCall(listFiles, ['']);
        }
        var results = [];
        var MAX_RESULTS = 100;
        var CONTEXT_RADIUS = 2;
        for (const file of files) {
          if (results.length >= MAX_RESULTS) break;
          if (file.type !== 'directory') {
            try {
              var content;
              if (fs && typeof fs.readFile === 'function') {
                try {
                  content = await safeToolCall(fs.readFile.bind(fs), [sanitizePath(file.path)]);
                } catch (e2) {
                  var cls2 = classifyError(e2);
                  if (cls2.code !== 'PERMANENT' || cls2.reason !== 'no_workspace') throw e2;
                  content = await safeToolCall(readFile, [sanitizePath(file.path)]);
                }
              } else {
                content = await safeToolCall(readFile, [sanitizePath(file.path)]);
              }
              const lines = content.split('\n');
              lines.forEach((text, idx) => {
                if (results.length < MAX_RESULTS && text.toLowerCase().includes(args.query.toLowerCase())) {
                  const start = Math.max(0, idx - CONTEXT_RADIUS);
                  const end = Math.min(lines.length, idx + CONTEXT_RADIUS + 1);
                  results.push({
                    file: file.path,
                    line: idx + 1,
                    text: text.trim(),
                    context: lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n')
                  });
                }
              });
            } catch (e) { /* Skip unreadable files */ }
          }
        }
        return results;
      }
    });
  }

  getSchemas() {
    return Array.from(this.registry.values()).map(t => ({ type: 'function', function: t.schema }));
  }

  async dispatch(name, args) {
    return await this.registry.get(name).handler(args);
  }
}

// Stage 4.5: Max retries when a diff produces syntactically broken code
// (detected via ASTIndex.validateParse() before showing the diff to the user).
const MAX_PREFLIGHT_RETRIES = 2;

export class AgentOrchestrator {
  constructor() {
    this.dispatcher = new ToolDispatcher();
    this.MAX_STEPS = 7;
    this.FETCH_TIMEOUT_MS = 30000;
    this.conversationHistory = [];
    this.lastReply = '';
    this._resolvedMaxTokens = null;
    this._cursorLine = null; // Stage 4f: cursor position for context window
    this._abortController = null; // Stage 4e: streaming abort
    this.preflightRetryCount = 0; // Stage 4.5: counts AST pre-flight retry attempts
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  setCursorLine(line) {
    this._cursorLine = line;
  }

  resolveMaxContextTokens() {
    if (this._resolvedMaxTokens !== null) return this._resolvedMaxTokens;
    try {
      const providers = JSON.parse(localStorage.getItem('matey-providers') || '[]');
      if (providers.length > 0 && providers[0].model) {
        const model = providers[0].model;
        const ctx = getModelContextWindow(model);
        this._resolvedMaxTokens = Math.floor(ctx * 0.7);
        HarnessLogger.log(0, 'MODEL_CONTEXT', `Provider model="${model}" context_window=${ctx}, using ${this._resolvedMaxTokens} tokens for conversation`);
        return this._resolvedMaxTokens;
      }
    } catch (e) {
      console.warn('[Agent] Could not resolve model context window:', e.message);
    }
    this._resolvedMaxTokens = Math.floor(DEFAULT_MODEL_CONTEXT_WINDOW * 0.7);
    return this._resolvedMaxTokens;
  }

  get maxContextTokens() {
    return this.resolveMaxContextTokens();
  }

  trimHistory() {
    const { pruned, removed } = pruneHistoryByTokens(
      this.conversationHistory,
      this.maxContextTokens,
      PRESERVE_SYSTEM
    );
    if (removed > 0) {
      HarnessLogger.log(0, 'TRIM_HISTORY', `Pruned ${removed} message(s) to stay within ${this.maxContextTokens} token budget`);
    }
    this.conversationHistory = pruned;
  }

  async executeTask(userPrompt, activeFilePath, onDiff) {
     mateyCoach.evaluate(userPrompt, { previousReply: this.lastReply });
     HarnessLogger.log(0, 'INIT', `Starting task: "${userPrompt}"`);
     AgentProgress.update('Reading context…');

     const context = await ContextRetriever.assemble(userPrompt, activeFilePath, this._cursorLine);

     if (context.truncated) {
       const truncatedFiles = [];
       if (context.activeFileContext?.truncated) {
         truncatedFiles.push(`${context.activeFileContext.path} (${context.activeFileContext.lineCount} lines)`);
       }
       for (const f of context.mentionedFilesContext) {
         if (f.truncated) {
           truncatedFiles.push(`${f.path} (${f.lineCount} lines)`);
         }
       }
       if (truncatedFiles.length > 0) {
         AgentToast.show(
           `Some files were truncated to ${ContextRetriever.MAX_FILE_LINES} lines: ${truncatedFiles.join(', ')}`,
           false
         );
       }
     }

// Stage 4.3: Continuum — cross-session memory recall
      let continuumContext = null;
      try {
        continuumContext = await MateyContinuum.recallContext(userPrompt, 500);
      } catch (_) { /* non-critical */ }
     const systemMessage = {
       role: 'system',
       content: `You are Matey's coding agent. Use tools to read/write files. When modifying existing code, STRICTLY use this exact inline diff block format:\n<<<<<<< SEARCH\n[old code exactly as it appears]\n=======\n[new code]\n>>>>>>> REPLACE`
     };

     // Stage 4d: Inject style profile into system message
     try {
       var styleProfile = await StyleProfiler.loadProfile();
       if (styleProfile) {
         var stylePrompt = StyleProfiler.buildStylePrompt(styleProfile);
         if (stylePrompt) {
           systemMessage.content += '\n\n' + stylePrompt;
         }
       }
     } catch (_) { /* non-critical */ }

     // Ensure system message is always present
     if (this.conversationHistory.length === 0 || this.conversationHistory[0]?.role !== 'system') {
       this.conversationHistory.unshift(systemMessage);
     }

     // Split context and task into separate messages so trimming can target
     // context without erasing the user's task.
     const MAX_TOOL_RESULT_CHARS = 16384;

     const contextMessage = {
       role: 'user',
       content: `Context:\n${JSON.stringify(context)}`
     };

     const taskMessage = {
       role: 'user',
       content: `Task: ${userPrompt}`
     };

     this.conversationHistory.push(contextMessage, taskMessage);
     // Inject continuum cross-session memory if available
     if (continuumContext) {
       this.conversationHistory.push({ role: 'user', content: `Memory from prior sessions in this workspace:\n${continuumContext}` });
     }
     this.trimHistory();

     let stepCount = 0;
     let loop = true;
     let finalReplyText = '';
     let lastFailedTool = null;
     let consecutiveFailures = 0;
     let pendingVerification = false;
     let malformedToolCallCount = 0;

     /* Stage 3.5: Error-signature oscillation detection + fix memory */
     const errorHistory = [];      // [{signature, tool, step, args}]
     const toolCallHistory = [];   // [{tool, step, success, args}]
     let lastFailedSig = null;     // signature of most recent failure (for fix recording)

     while (loop && stepCount < this.MAX_STEPS) {
       stepCount++;
       HarnessLogger.log(stepCount, 'THINKING', 'Waiting for model response...');
       AgentProgress.update(`Step ${stepCount} of ${this.MAX_STEPS}: thinking…`);

       try {
         // Stage 3 + Stage 3.5: Detect repetition patterns and inject nudges
         // 3a: Consecutive same-tool nudge (original Stage 3)
         if (consecutiveFailures >= 2 && lastFailedTool) {
           const nudgeMessage = {
             role: 'system',
             content: `WARNING: The last ${consecutiveFailures} attempts at "${lastFailedTool}" failed with the same error. Do NOT retry the same approach. Try a different file path, a different tool, or explain to the user why this cannot be done.`
           };
           this.conversationHistory.push(nudgeMessage);
           this.trimHistory();
           HarnessLogger.log(stepCount, 'REPLAN_NUDGE', `Injected re-planning nudge for ${lastFailedTool}`);
           consecutiveFailures = 0;
           lastFailedTool = null;
         }

         // 3.5a: Check FixMemory for a known fix before the next LLM call
         if (lastFailedSig) {
           try {
             const hint = await FixMemory.buildHint(
               lastFailedSig.split(':')[0],
               lastFailedSig.split(':')[1],
               lastFailedSig.split(':').slice(2).join(':')
             );
             if (hint) {
               this.conversationHistory.push({ role: 'system', content: hint });
               this.trimHistory();
               HarnessLogger.log(stepCount, 'FIX_HINT', 'Injected remembered fix hint from FixMemory');
             }
             lastFailedSig = null;
           } catch (_) { lastFailedSig = null; }
         }

         // Stage 4e: Response streaming with AbortController
         this._abortController = new AbortController();
         const choice = await Promise.race([
           routeRequest({
             capability: 'text-gen',
             messages: this.conversationHistory,
             tools: this.dispatcher.getSchemas(),
             toolChoice: 'auto',
             timeoutMs: this.FETCH_TIMEOUT_MS,
             signal: this._abortController.signal,
             onToken: (token) => {
               // Stream tokens to progress UI for live feedback
               if (!this._streamBuffer) this._streamBuffer = '';
               this._streamBuffer += token;
               AgentProgress.update('Step ' + stepCount + ': receiving… ' + this._streamBuffer.slice(-60));
             }
           }),
           new Promise((_, reject) =>
             setTimeout(() => {
               try { this._abortController.abort(); } catch (_) {}
               reject(new Error('Request timed out after ' + this.FETCH_TIMEOUT_MS + 'ms'));
             }, this.FETCH_TIMEOUT_MS)
            )
          ]);
          this._abortController = null;
          this._streamBuffer = null;

          // Tool-calling capability detection: check if model wrapped tool calls in markdown
          // instead of using proper tool_calls API (common with models like gemma-3-12b-it)
          if (!choice.tool_calls?.length && choice.content && stepCount <= 3) {
            var content = choice.content || '';
            var looksLikeToolCall = /```(json|javascript|js)?\s*\n?\s*[\s\S]*?"(function|name|arguments|filePath|content)"[\s\S]*?```/i.test(content) ||
              /\[\s*\{[\s\S]*?"function"[\s\S]*?\}\s*\]/.test(content);
            if (looksLikeToolCall) {
              malformedToolCallCount++;
              HarnessLogger.error(stepCount, 'MALFORMED_TOOL_CALL', 'Model returned markdown-wrapped tool call instead of proper tool_calls API');
              if (malformedToolCallCount >= 2) {
                var warnMsg = '[System Warning] The current model does not reliably support tool calling. It keeps returning tool calls as text instead of using the tool API. Please switch to a model with proper tool calling support (e.g., gpt-4o-mini, claude-3.5-sonnet) in Settings → BYOK Models.';
                this.conversationHistory.push({ role: 'system', content: warnMsg });
                AgentToast.show('This model does not support tool calling — try a different model.', true);
                malformedToolCallCount = 0;
              }
            }
          }

          if (choice.tool_calls?.length > 0) {
           this.conversationHistory.push(choice);

           // Stage 4.1: Parallel tool-call execution.
           // All calls in one LLM batch are independent (emitted atomically).
           // Only serialize calls targeting the SAME filePath to avoid conflicts.
           const startBatchMs = performance.now();

           function extractFilePath(call) {
             try { var a = JSON.parse(call.function.arguments); return a.filePath || a.path || a.subDir || ''; } catch (_) { return ''; }
           }

           var self = this; // Stage 4.1 fix: standalone function loses `this` in strict mode
           async function executeOne(call) {
             var args = JSON.parse(call.function.arguments);
             var r;
             try {
               r = await self.dispatcher.dispatch(call.function.name, args);
               return { call: call, ok: true, result: r, error: null };
             } catch (err) {
               return { call: call, ok: false, result: null, error: err };
             }
           }

           // Group by filePath: same-path sequential, different-path parallel
           var groups = [];
           var seen = new Set();
           for (var ci = 0; ci < choice.tool_calls.length; ci++) {
             if (seen.has(ci)) continue;
             var pathKey = extractFilePath(choice.tool_calls[ci]);
             var group = [choice.tool_calls[ci]];
             seen.add(ci);
             for (var cj = ci + 1; cj < choice.tool_calls.length; cj++) {
               if (seen.has(cj)) continue;
               if (extractFilePath(choice.tool_calls[cj]) === pathKey) {
                 group.push(choice.tool_calls[cj]);
                 seen.add(cj);
               }
             }
             groups.push(group);
           }

           var allResults = [];
           for (var gi = 0; gi < groups.length; gi++) {
             if (groups[gi].length === 0) continue;
             var G = groups[gi];
             HarnessLogger.log(stepCount, 'PARALLEL_BATCH', 'Group ' + (gi+1) + '/' + groups.length + ': ' + G.length + ' call(s)');
             var batch = G.length === 1
               ? [await executeOne(G[0])]
               : await Promise.all(G.map(executeOne));
             allResults = allResults.concat(batch);
           }
               // Process results, pushing to conversationHistory in order
           for (var ri = 0; ri < allResults.length; ri++) {
             var entry = allResults[ri];
             if (entry.ok) {
               var serialized = JSON.stringify(entry.result);
               var trunccated = serialized.length > MAX_TOOL_RESULT_CHARS
                 ? serialized.slice(0, MAX_TOOL_RESULT_CHARS) + '\n...(truncated)'
                 : serialized;
               this.conversationHistory.push({ role: 'tool', tool_call_id: entry.call.id, content: trunccated });
               HarnessLogger.log(stepCount, 'TOOL_SUCCESS', 'Tool ' + entry.call.function.name + ' completed.');
               AgentProgress.update('Step ' + stepCount + ': ' + entry.call.function.name + ' succeeded');
              this.trimHistory();
              lastFailedTool = null;
              consecutiveFailures = 0;

              // Stage 3.5b: Record tool call + detect fix (tool failed earlier, now succeeded with different args)
              var successArgs = String(entry.call.function.arguments || '').slice(0, 80);
              toolCallHistory.push({ tool: entry.call.function.name, step: stepCount, success: true, args: successArgs });
              var priorSameToolFails = errorHistory.filter(function(e) { return e.tool === entry.call.function.name; });
              if (priorSameToolFails.length > 0) {
                var priorFailure = priorSameToolFails[priorSameToolFails.length - 1];
                if (priorFailure.args !== successArgs) {
                  var whatFixed = 'Used different arguments: "' + successArgs + '" instead of "' + priorFailure.args + '"';
                  var sigParts = priorFailure.signature.split(':');
                  FixMemory.recordFix(
                    sigParts[0],
                    sigParts[1] || 'UNKNOWN',
                    sigParts.slice(2).join(':'),
                    whatFixed
                  ).catch(function() {});
                  HarnessLogger.log(stepCount, 'FIX_RECORDED', 'Recorded fix for ' + priorFailure.signature + ': ' + whatFixed);
                }
              }
                         } else {
               var err = entry.error; // Stage 1 fix: error was stored in entry.error by executeOne, not in scope
               var errCode = err.code || 'UNKNOWN';
               var errMsg = err.message;
               var lastActionText = `Step ${stepCount}: ${entry.call.function.name} — ${errCode === 'CANCELLED' ? 'cancelled' : 'failed'}`;
               AgentProgress.update(lastActionText);
               if (errCode === 'CANCELLED') {
                 errMsg = 'Action was cancelled by user (picker dialog closed).';
                 HarnessLogger.log(stepCount, 'TOOL_CANCELLED', errMsg);
               } else {
                 HarnessLogger.error(stepCount, 'TOOL_FAILED', errMsg);
                 AgentToast.show(`Tool "${entry.call.function.name}" failed: ${errMsg}`, true);
               }
               if (entry.call.function.name === lastFailedTool) {
                 consecutiveFailures++;
               } else {
                 lastFailedTool = entry.call.function.name;
                 consecutiveFailures = 1;
               }

               // Stage 3.5c: Compute error signature + oscillation detection
               var errReason = (err.data && err.data.reason) || (err.code === 'CANCELLED' ? 'cancelled' : 'generic');
               var sig = FixMemory.signature(entry.call.function.name, errCode, errReason);
               var failArgs = String(entry.call.function.arguments || '').slice(0, 80);
               errorHistory.push({ signature: sig, tool: entry.call.function.name, step: stepCount, args: failArgs });
               toolCallHistory.push({ tool: entry.call.function.name, step: stepCount, success: false, args: failArgs });
               lastFailedSig = sig;

               // Oscillation check: same error signature seen before, NOT consecutively (different tool tried in between)
               var sameSigEntries = errorHistory.filter(function(e) { return e.signature === sig && e.step !== stepCount; });
               if (sameSigEntries.length > 0) {
                 // Check that at least one DIFFERENT tool was tried between the earlier failure and now
                 var earliestStep = sameSigEntries[0].step;
                 var toolsTriedBetween = toolCallHistory.filter(function(e) {
                   return e.step > earliestStep && e.step < stepCount;
                 }).map(function(e) { return e.tool; });
                 var uniqueBetween = [];
                 toolsTriedBetween.forEach(function(t) { if (uniqueBetween.indexOf(t) === -1) uniqueBetween.push(t); });
                 var hasDifferentTool = uniqueBetween.some(function(t) { return t !== entry.call.function.name; });

                 if (hasDifferentTool) {
                   var oscillationMsg = {
                     role: 'system',
                     content: 'OSCILLATION DETECTED: You have hit this exact error before in this task after trying something different (attempts included: ' + uniqueBetween.join(', ') + '). Stop and either ask the user for clarification or explain why this cannot be resolved automatically. Do NOT continue looping.'
                   };
                   this.conversationHistory.push(oscillationMsg);
                   this.trimHistory();
                   HarnessLogger.log(stepCount, 'OSCILLATION_NUDGE', 'Injected oscillation-blocking nudge for signature: ' + sig);
                   // Also record this as a stubborn failure in fix memory for future reference
                   FixMemory.recordFix(
                     entry.call.function.name,
                     errCode,
                     errReason,
                     'Oscillation detected — agent tried different approaches but hit same error. Manual intervention needed.'
                   ).catch(function() {});
                 }
               }
               const errPayload = JSON.stringify({ error: errMsg, code: errCode, instruction: errCode === 'PERMANENT' ? 'This file operation cannot be retried. Check the file path or workspace permissions.' : 'Retry with corrected arguments.' });
               const truncatedErr = errPayload.length > MAX_TOOL_RESULT_CHARS
                 ? errPayload.slice(0, MAX_TOOL_RESULT_CHARS) + '\n...(truncated)'
                 : errPayload;
               this.conversationHistory.push({ role: 'tool', tool_call_id: entry.call.id, content: truncatedErr });
               this.trimHistory();
             }
           }

           this.trimHistory();
           var batchMs = (performance.now() - startBatchMs).toFixed(0);
           HarnessLogger.log(stepCount, 'BATCH_DONE', 'Tool batch completed in ' + batchMs + 'ms (' + allResults.length + ' calls)');
         } else {
           // Self-verification: before declaring done, verify the original request was satisfied
           if (!pendingVerification && stepCount < this.MAX_STEPS) {
             pendingVerification = true;
             const actionSummary = this.conversationHistory
               .filter(m => m.role === 'tool')
               .map(m => m.content)
               .join('\n')
               .slice(0, 4000);
             const verifyMessage = {
               role: 'user',
               content: `ORIGINAL REQUEST: "${userPrompt}"\n\nSUMMARY OF ACTIONS TAKEN:\n${actionSummary}\n\nWas the original request fully satisfied? Answer strictly as JSON: {"complete": true/false, "reason": "...", "remaining": "..."}`
             };
             this.conversationHistory.push(verifyMessage);
             this.trimHistory();
             HarnessLogger.log(stepCount, 'SELF_VERIFY', 'Running self-verification check');
             AgentProgress.update('Verifying task completion…');
             continue;
           }

            // Parse verification response if we just ran one
            if (pendingVerification) {
              pendingVerification = false;
              const responseText = (choice.content || '').trim();
              let verifiedComplete = false;
              let verifyReason = '';
              let parseSuccess = false;
              try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  verifiedComplete = parsed.complete !== false;
                  verifyReason = parsed.reason || '';
                  parseSuccess = true;
                } else {
                  verifyReason = 'Verification response did not contain valid JSON.';
                }
              } catch (e) {
                verifyReason = `Verification response could not be parsed: ${e.message}`;
              }
              if (!parseSuccess) {
                HarnessLogger.log(stepCount, 'SELF_VERIFY_PARSE_FAIL', verifyReason);
              }
              if (!verifiedComplete && stepCount < this.MAX_STEPS) {
                HarnessLogger.log(stepCount, 'SELF_VERIFY_INCOMPLETE', verifyReason);
                AgentProgress.update('Task incomplete — continuing…');
                this.conversationHistory.push({ role: 'assistant', content: responseText });
                const continueMsg = {
                  role: 'user',
                  content: `The verification indicates the task is NOT complete. Reason: ${verifyReason}. Please continue working on the remaining work.`
                };
                this.conversationHistory.push(continueMsg);
                this.trimHistory();
                continue;
              }
              this.conversationHistory.push({ role: 'assistant', content: responseText });
              this.trimHistory();
            }

           AgentProgress.update('Finalizing response…');
           HarnessLogger.log(stepCount, 'PARSING_DIFF', 'Scanning for Search/Replace blocks with tiered matching');
           finalReplyText = choice.content || '';
           this.conversationHistory.push({ role: 'assistant', content: finalReplyText });
           this.trimHistory();

            // Stage 4b: Tiered diff matching with confidence scoring
            const diffMatch = finalReplyText.match(DIFF_REGEX);
            let foundDiff = false;
            let preflightRetryRequested = false; // Stage 4.5: set when a broken diff is detected
            if (diffMatch) {
              // Re-execute to get all matches
              var diffRegex2 = new RegExp(DIFF_REGEX.source, DIFF_REGEX.flags);
              let dmatch;
              while ((dmatch = diffRegex2.exec(finalReplyText)) !== null) {
                foundDiff = true;
                var searchBlock = dmatch[1];
                var replaceBlock = dmatch[2];
                var matchResult = TieredDiffMatcher.match(searchBlock, (context.activeFileContext?.content || ''));

                 if (matchResult.matched) {
                   // Stage 4c: Confidence scoring
                   var confidence = ConfidenceScorer.scoreDiff({ search: searchBlock, replace: replaceBlock }, matchResult.tier);
                   HarnessLogger.log(stepCount, 'DIFF_MATCHED',
                     `Tier: ${matchResult.tier}, Confidence: ${confidence.confidence}(${confidence.score}), Reasons: ${confidence.reasons.join(',')}`);

                   // Stage 4.5: Pre-flight AST validation — parse resulting content before showing to user
                   var preflightFail = null;
                   if (this.preflightRetryCount < MAX_PREFLIGHT_RETRIES && activeFilePath) {
                     try {
                       var baseContent = context.activeFileContext?.fullContent || context.activeFileContext?.content || '';
                       var resultingContent = baseContent.replace(searchBlock, replaceBlock);
                       var langHint = ASTIndex.detectLanguage(activeFilePath);
                       var validation = await ASTIndex.validateParse(resultingContent, langHint);
                       if (!validation.valid) {
                         preflightFail = validation;
                         HarnessLogger.log(stepCount, 'PREFLIGHT_FAIL',
                           `Diff produces ${validation.errorNodes} syntax error node(s). ` +
                           `First error: type="${validation.firstError?.type}", line=${validation.firstError?.line}, text="${validation.firstError?.text}"`);
                       } else {
                         HarnessLogger.log(stepCount, 'PREFLIGHT_OK',
                           `AST validation passed (${validation.parseTime?.toFixed(1)}ms)`);
                       }
                     } catch (e) {
                       HarnessLogger.log(stepCount, 'PREFLIGHT_SKIPPED', `validateParse threw: ${e.message}`);
                     }
                   }

                   if (preflightFail) {
                     // Feed the syntax error back to the LLM and retry (respecting MAX_STEPS)
                     this.conversationHistory.push({ role: 'assistant', content: finalReplyText });
                     this.trimHistory();
                     var errCtx = preflightFail.firstError;
                     var retryMsg =
                       `Your proposed diff introduces a syntax error that AST parsing caught before display. ` +
                       `Parse found ${preflightFail.errorNodes} error node(s). ` +
                       (errCtx ? `First error at line ${errCtx.line}: "${errCtx.text}" (type: ${errCtx.type}). ` : '') +
                       `Please regenerate the SEARCH/REPLACE block with corrected syntax.`;
                     this.conversationHistory.push({ role: 'user', content: retryMsg });
                     this.trimHistory();
                     this.preflightRetryCount++;
                     HarnessLogger.log(stepCount, 'PREFLIGHT_RETRY',
                       `Retry ${this.preflightRetryCount}/${MAX_PREFLIGHT_RETRIES}: feeding error back to LLM`);
                     AgentToast.show(`Pre-flight caught syntax error — retrying (${this.preflightRetryCount}/${MAX_PREFLIGHT_RETRIES})`, true);
                     preflightRetryRequested = true;
                     break; // exit inner diff loop; outer loop will check the flag
                   }

                   AgentToast.show(
                     `Diff applied [${matchResult.tier} match, ${confidence.confidence} confidence]` +
                     (matchResult.tier === 'fuzzy' ? ` ${(matchResult.similarity*100).toFixed(0)}% similar` : ''),
                     confidence.confidence === 'low'
                   );

                   if (onDiff) onDiff({
                     search: searchBlock,
                     replace: replaceBlock,
                     matchTier: matchResult.tier,
                     confidence: confidence.confidence,
                     confidenceScore: confidence.score
                   });
                 } else {
                   HarnessLogger.error(stepCount, 'DIFF_FAILED', matchResult.reason);
                   AgentToast.show(
                     `Diff block NOT matched (${matchResult.similarity ? (matchResult.similarity*100).toFixed(1)+'% similar' : 'no match'}). ` +
                     `Best closest content found: ${(matchResult.closestContent||'').slice(0,100)}...`,
                     true
                   );
                 }
              }
            }
            // Stage 4.5: If pre-flight detected a broken diff and we have steps left, retry the outer loop
            if (preflightRetryRequested && stepCount < this.MAX_STEPS) {
              continue;
            }
           if (!foundDiff) HarnessLogger.log(stepCount, 'NO_DIFF', 'Agent responded with text but no code changes.');
           this.lastReply = finalReplyText;
           loop = false;
           HarnessLogger.log(stepCount, 'DONE', 'Task finished.');
// Stage 4.3: Record episode to continuum memory
            try {
              const entities = toolCallHistory
                .filter(e => e.success)
                .map(e => e.tool)
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, 10);
              const outcome = stepCount < this.MAX_STEPS ? 'completed' : 'exceeded_max_steps';
              MateyContinuum.recordEpisode(
                finalReplyText.slice(0, 200),
                entities,
                stepCount,
                outcome
              ).catch(() => {});
            } catch (_) { /* fire-and-forget */ }
         }
       } catch (networkError) {
         HarnessLogger.error(stepCount, 'NETWORK_OR_TIMEOUT', networkError);
         const errMsg = networkError?.message || networkError?.toString() || String(networkError);
         let toastMsg = errMsg;
         if (errMsg.indexOf('401') !== -1 || errMsg.toLowerCase().indexOf('authentication') !== -1 || errMsg.toLowerCase().indexOf('invalid api key') !== -1) {
           toastMsg = 'Authentication failed (401): Invalid API key. Check your provider key in Settings → BYOK Models.';
         } else if (errMsg.indexOf('timeout') !== -1) {
           toastMsg = 'Request timed out. The model may be busy — try again, or check your provider URL.';
         } else if (errMsg.indexOf('fetch') !== -1 || errMsg.toLowerCase().indexOf('network') !== -1 || errMsg.toLowerCase().indexOf('ECONN') !== -1) {
           toastMsg = 'Network error: failed to reach the provider. Check your connection and API URL.';
         }
         AgentToast.show(toastMsg, true);
         this.conversationHistory.push({ role: 'assistant', content: toastMsg });
         finalReplyText = toastMsg;
         loop = false;
       }
     }

     // Graceful MAX_STEPS degradation: summarize what was done vs. remaining
     if (stepCount >= this.MAX_STEPS) {
       HarnessLogger.error(stepCount, 'MAX_STEPS_REACHED', 'Loop forcefully terminated to prevent runaway execution.');
       AgentProgress.update('Summarizing progress…');
       const actionSummary = this.conversationHistory
         .filter(m => m.role === 'tool')
         .map(m => m.content)
         .join('\n')
         .slice(0, 3000);
       try {
         const summaryChoice = await Promise.race([
           routeRequest({
             capability: 'text-gen',
             messages: [
               { role: 'system', content: 'You are Matey\'s coding agent. Summarize concisely.' },
               { role: 'user', content: `The task "${userPrompt}" was not completed within the step limit. Here is what was attempted:\n${actionSummary}\n\nProvide a brief 2-3 sentence summary of what was accomplished and what remains undone.` }
             ],
             tools: [],
             toolChoice: 'none',
             timeoutMs: this.FETCH_TIMEOUT_MS,
           }),
           new Promise((_, reject) =>
             setTimeout(() => reject(new Error('Summary request timed out')), this.FETCH_TIMEOUT_MS)
           )
         ]);
         const summary = summaryChoice.content || '';
         var capMsg = `Stopped after ${this.MAX_STEPS} steps. ${summary}`;
         finalReplyText = capMsg;
         AgentProgress.update(capMsg);
         AgentToast.show(capMsg, true);
       } catch (summaryErr) {
         var capMsg = `Stopped after ${this.MAX_STEPS} steps — task may be incomplete.`;
         if (!finalReplyText) finalReplyText = capMsg;
         AgentProgress.update(capMsg);
         AgentToast.show(capMsg, true);
       }
     }

     AgentProgress.hide();
     return finalReplyText;
   }
}

export { HarnessLogger, AgentToast, AgentProgress, ContextRetriever, ToolDispatcher, ToolError, safeToolCall, classifyError, FixMemory, MateyContinuum, TieredDiffMatcher, ConfidenceScorer, StyleProfiler, sanitizePath, estimateTokenCount, pruneHistoryByTokens, DEFAULT_MODEL_CONTEXT_WINDOW, getModelContextWindow };

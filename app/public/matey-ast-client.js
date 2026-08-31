/* matey-ast-client.js — Main-thread client for matey-ast-worker.js.
 *
 * Exposes the same static method interface as ASTIndex but runs all
 * parsing operations in a background Web Worker. Falls back to direct
 * ASTIndex calls if the worker fails to initialize.
 *
 * Usage: same as ASTIndex — import { ASTIndexClient as ASTIndex } from './matey-ast-client.js';
 */

import { ASTIndex } from './matey-ast-index.js';

class ASTIndexClientImpl {
  constructor() {
    this._worker = null;
    this._msgId = 0;
    this._pending = new Map();
    this._ready = false;
    this._initError = null;
    this._initPromise = null;
  }

  async _init() {
    if (this._ready || this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      try {
        this._worker = new Worker(new URL('./matey-ast-worker.js', import.meta.url), { type: 'module' });
        this._worker.onmessage = (e) => {
          const { id, result, error } = e.data;
          if (this._pending.has(id)) {
            const { resolve, reject } = this._pending.get(id);
            this._pending.delete(id);
            if (error) reject(new Error(error));
            else resolve(result);
          }
        };
        this._worker.onerror = (e) => {
          this._initError = e.message || 'Worker error';
          // Reject all pending
          for (const { reject } of this._pending.values()) {
            reject(new Error(this._initError));
          }
          this._pending.clear();
        };
        // Ping the worker to verify it's alive
        await this._call('ensureCore', []);
        this._ready = true;
      } catch (e) {
        this._initError = e.message || String(e);
        this._worker = null;
        // Don't throw — we'll fall back to direct calls
      }
    })();
    return this._initPromise;
  }

  _call(method, args) {
    return new Promise((resolve, reject) => {
      const id = ++this._msgId;
      this._pending.set(id, { resolve, reject });
      this._worker.postMessage({ id, method, args });
      // Timeout after 30s
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`Worker call '${method}' timed out`));
        }
      }, 30000);
    });
  }

  // Direct fallback (when worker is unavailable)
  async _direct(method, args) {
    switch (method) {
      case 'ensureCore': return ASTIndex.ensureCore();
      case 'getLanguage': return ASTIndex.getLanguage(args[0]);
      case 'indexFile': return ASTIndex.indexFile(args[0], args[1]);
      case 'getFunctionContext': return ASTIndex.getFunctionContext(args[0], args[1], args[2]);
      case 'validateParse': return ASTIndex.validateParse(args[0], args[1]);
      case 'getLoadedLanguages': return ASTIndex.getLoadedLanguages();
      case 'getStats': return ASTIndex.getStats();
      case 'clearCache': ASTIndex.clearCache(); return true;
      case 'detectLanguage': return ASTIndex.detectLanguage(args[0]);
      default: throw new Error(`Unknown method: ${method}`);
    }
  }

  async _invoke(method, args) {
    if (!this._ready) await this._init();
    if (this._ready) {
      try {
        return await this._call(method, args);
      } catch (e) {
        // Worker call failed — fall back to direct
        this._ready = false;
        return this._direct(method, args);
      }
    }
    return this._direct(method, args);
  }

  // Public API (matches ASTIndex static methods)
  static async ensureCore() { return getInstance()._invoke('ensureCore', []); }
  static async getLanguage(filePath) { return getInstance()._invoke('getLanguage', [filePath]); }
  static async indexFile(filePath, content) { return getInstance()._invoke('indexFile', [filePath, content]); }
  static async getFunctionContext(filePath, cursorLine, content) { return getInstance()._invoke('getFunctionContext', [filePath, cursorLine, content]); }
  static async validateParse(content, languageHint) { return getInstance()._invoke('validateParse', [content, languageHint]); }
  static getLoadedLanguages() { return getInstance()._invoke('getLoadedLanguages', []); }
  static getStats() { return getInstance()._invoke('getStats', []); }
  static clearCache() { return getInstance()._invoke('clearCache', []); }
  static detectLanguage(filePath) { return getInstance()._invoke('detectLanguage', [filePath]); }
}

let _instance = null;
function getInstance() {
  if (!_instance) _instance = new ASTIndexClientImpl();
  return _instance;
}

export const ASTIndexClient = ASTIndexClientImpl;
export default ASTIndexClientImpl;

/* matey-ast-worker.js — Web Worker for offloading AST parsing operations.
 *
 * Runs tree-sitter WASM parsing in a background thread so the Android UI
 * thread never blocks. Communicates with the main thread via postMessage.
 *
 * Protocol:
 *   Main → Worker: { id, method, args }
 *   Worker → Main: { id, result } | { id, error }
 *
 * Supported methods: ensureCore, getLanguage, indexFile, getFunctionContext,
 *                    validateParse, getLoadedLanguages, getStats, clearCache, detectLanguage
 */

import { ASTIndex, setBasePath, getBasePath } from './matey-ast-index.js';

// Track active worker count on window (exposed for test/debugging).
if (typeof self !== 'undefined' && self.window !== undefined) {
  self.window.__mateyWorkerCount = (self.window.__mateyWorkerCount || 0) + 1;
}

// Ensure base path is set correctly for the worker context.
// In a module worker, self.location.href is the worker script URL.
if (typeof self !== 'undefined' && self.location) {
  const resolved = new URL('.', self.location.href).href;
  setBasePath(resolved);
}

self.onmessage = async function(e) {
  const { id, method, args } = e.data;
  try {
    let result;
    switch (method) {
      case 'ensureCore':
        result = await ASTIndex.ensureCore();
        break;
      case 'getLanguage':
        result = await ASTIndex.getLanguage(args[0]);
        // Language objects are not structured-cloneable; return null
        result = result ? true : null;
        break;
      case 'indexFile':
        result = await ASTIndex.indexFile(args[0], args[1]);
        break;
      case 'getFunctionContext':
        result = await ASTIndex.getFunctionContext(args[0], args[1], args[2]);
        break;
      case 'validateParse':
        result = await ASTIndex.validateParse(args[0], args[1]);
        // Tree objects are not structured-cloneable; strip tree before sending
        if (result && result.tree) {
          result = { ...result, tree: undefined };
        }
        break;
      case 'getLoadedLanguages':
        result = ASTIndex.getLoadedLanguages();
        break;
      case 'getStats':
        result = ASTIndex.getStats();
        break;
      case 'clearCache':
        ASTIndex.clearCache();
        result = true;
        break;
      case 'detectLanguage':
        result = ASTIndex.detectLanguage(args[0]);
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};

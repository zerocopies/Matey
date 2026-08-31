/* MateyASTIndex — Tree-sitter WASM-based AST indexing with lazy grammar loading
 *
 * Core runtime (web-tree-sitter.js + .wasm) is loaded eagerly on first use.
 * Language grammars are loaded LAZILY — only when a file of that language
 * is first parsed. This ensures no grammar WASM is downloaded at app startup
 * unless the user actually opens a file of that language.
 *
 * Public API:
 *   - ensureCore()          → initializes the web-tree-sitter runtime
 *   - getLanguage(filePath) → returns loaded Language for a file (lazy-loads grammar)
 *   - indexFile(path, content) → parses and extracts AST symbols
 *   - getFunctionContext(path, fnName, content) → extracts fn body + imports + callers
 *   - validateParse(content, language) → checks for error nodes (pre-flight)
 *   - getLoadedLanguages()  → returns set of loaded grammar names (for testing)
 *   - getStats()            → returns parsing performance stats
 */

let _basePath = '';

// Resolve base URL from available context (main thread or worker).
(function resolveBasePath() {
  if (typeof window !== 'undefined' && window.MateyBasePath) {
    _basePath = window.MateyBasePath;
  } else if (typeof self !== 'undefined' && self.location) {
    // In a worker, self.location.href is the worker script URL.
    // new URL('.', ...) gives the directory containing the worker.
    _basePath = new URL('.', self.location.href).href;
  } else if (typeof window !== 'undefined') {
    _basePath = new URL('.', window.location.href).href;
  }
  if (_basePath && !_basePath.endsWith('/')) _basePath += '/';
})();

/** Set the base URL for WASM file loading (used by worker context). */
export function setBasePath(path) {
  _basePath = path.endsWith('/') ? path : path + '/';
}

export function getBasePath() {
  return _basePath;
}

// Grammar WASM file paths (served from public/)
const GRAMMAR_FILES = {
  javascript: 'tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-javascript.wasm',
  typescriptreact: 'tree-sitter-javascript.wasm',
  jsx: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
};

// File extension → language grammar mapping
const EXTENSION_MAP = {
  '.js': 'javascript',
  '.jsx': 'typescriptreact',
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
};

export class ASTIndex {
  static _coreReady = false;
  static _coreLoader = null;
  static _loadedLanguages = new Map(); // grammarName → Language
  static _parserCache = new Map();     // languageName → Parser
  static _stats = {
    totalParses: 0,
    totalGrammarLoads: 0,
    coreLoadTime: null,
    grammarLoadTimes: {},
    parseTimes: [],
  };

  /** Lazily initialize the web-tree-sitter core WASM runtime. */
  static async ensureCore() {
    if (this._coreReady) return true;
    if (this._coreLoader) return this._coreLoader; // concurrent init guard

    const start = performance.now();
    this._coreLoader = (async () => {
      // @vite-ignore: prevent Vite from bundling this external ESM module
      const mod = await import(/* @vite-ignore */ _basePath + 'web-tree-sitter.js');
      this._Parser = mod.Parser;
      this._Language = mod.Language;
      this._Query = mod.Query;
      this._LANGUAGE_VERSION = mod.LANGUAGE_VERSION;
      this._MIN_COMPATIBLE_VERSION = mod.MIN_COMPATIBLE_VERSION;

      await this._Parser.init({
        locateFile: (p) => _basePath + p,
      });
      this._coreReady = true;
      this._stats.coreLoadTime = performance.now() - start;
      this._coreLoader = null;
      return true;
    })();

    return this._coreLoader;
  }

  /** Detect language from file path extension. */
  static detectLanguage(filePath) {
    const ext = path_extname(filePath);
    return EXTENSION_MAP[ext] || null;
  }

  /** Get or lazily-load a language grammar. Returns null if unsupported. */
  static async getLanguage(filePath) {
    await this.ensureCore();
    const langName = this.detectLanguage(filePath);
    if (!langName) return null;

    if (this._loadedLanguages.has(langName)) {
      return this._loadedLanguages.get(langName);
    }

    // Lazy load the grammar WASM from public/
    const grammarFile = GRAMMAR_FILES[langName];
    if (!grammarFile) return null;

    const loadStart = performance.now();
    const lang = await this._Language.load(_basePath + grammarFile);
    const loadMs = performance.now() - loadStart;

    this._loadedLanguages.set(langName, lang);
    this._stats.totalGrammarLoads++;
    this._stats.grammarLoadTimes[langName] = loadMs;

    console.log(`[ASTIndex] Grammar loaded: ${langName} (${loadMs.toFixed(2)}ms)`);
    return lang;
  }

  /** Get or create a Parser instance for a grammar. */
  static async _getParser(filePath) {
    const langName = this.detectLanguage(filePath);
    if (!langName) return null;

    if (this._parserCache.has(langName)) {
      return this._parserCache.get(langName);
    }

    const lang = await this.getLanguage(filePath);
    if (!lang) return null;

    const parser = new this._Parser();
    parser.setLanguage(lang);
    this._parserCache.set(langName, parser);
    return parser;
  }

  /** Parse content and return the full tree. */
  static async _parseContent(filePath, content) {
    const parser = await this._getParser(filePath);
    if (!parser) return null;
    const start = performance.now();
    const tree = parser.parse(content);
    const ms = performance.now() - start;
    this._stats.totalParses++;
    this._stats.parseTimes.push(ms);
    return tree;
  }

  /** Count error nodes in a tree (recursively). */
  static _countErrors(node) {
    let count = 0;
    if (node.type === 'ERROR' || node.isError) count++;
    for (let i = 0; i < node.namedChildCount; i++) {
      count += this._countErrors(node.namedChild(i));
    }
        return count;
  }

  /** Index a file: parse and extract imports, functions/classes, call sites. */
  static async indexFile(filePath, content) {
    const tree = await this._parseContent(filePath, content);
    if (!tree) return null;

    const result = { filePath, imports: [], functions: [], classes: [], callSites: [], errorNodes: 0 };
    result.errorNodes = this._countErrors(tree.rootNode);

    const langName = this.detectLanguage(filePath);
    let language = null;
    if (langName === 'python') {
      language = this._loadedLanguages.get('python');
    } else if (langName && ['typescript','typescriptreact','javascript'].includes(langName)) {
      language = this._loadedLanguages.get('typescriptreact') ||
                 this._loadedLanguages.get('javascript') ||
                 this._loadedLanguages.get('typescript');
    }

    // Extract JS/TS imports
    if (language && langName !== 'python') {
      try {
        const q = new this._Query(language,
          `(import_statement) @import
           (import_namespace_statement) @import
           (variable_declarator name:(identifier) @var value:(call_expression function:(identifier) @func (#eq? @func "require"))) @require`);
        for (const m of q.matches(tree.rootNode)) {
          for (const c of m.captures) {
            if (c.node.text) result.imports.push({
              text: c.node.text.slice(0,200),
              startLine: c.node.startPosition.row + 1,
              endLine: c.node.endPosition.row + 1,
            });
          }
        }
      } catch(e) {}
    }

    // Extract Python imports
    if (language && langName === 'python') {
      try {
        const q = new this._Query(language, `(import_statement) @import (import_from_statement) @import`);
        for (const m of q.matches(tree.rootNode)) {
          for (const c of m.captures) {
            if (c.node.text) result.imports.push({
              text: c.node.text.slice(0,200), startLine: c.node.startPosition.row + 1, endLine: c.node.endPosition.row + 1,
            });
          }
        }
      } catch(e) {}
    }

    // Extract declarations
    this._extractDeclarations(tree.rootNode, result, content);

    // Extract call sites (JS/TS)
    if (language && langName !== 'python') {
      try {
        const q = new this._Query(language, `(call_expression) @call`);
        for (const m of q.matches(tree.rootNode)) {
          for (const c of m.captures) {
            result.callSites.push({ text: c.node.text.slice(0,100), line: c.node.startPosition.row + 1 });
          }
        }
      } catch(e) {}
    }

        return result;
  }

  /** Recursively extract function/class/method declarations from AST. */
  static _extractDeclarations(node, result, content) {
    if (!node) return;
    const type = node.type;

    if (type === 'function_declaration' || type === 'function') {
      result.functions.push({ name: this._extractName(node), body: content.slice(node.startIndex, node.endIndex),
        startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1,
        startByte: node.startIndex, endByte: node.endIndex });
    }
    if (type === 'class_declaration' || type === 'class') {
      result.classes.push({ name: this._extractName(node), body: content.slice(node.startIndex, node.endIndex),
        startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
    }
    if (type === 'method_definition' || type === 'arrow_function' ||
        type === 'generator_function' || type === 'function_expression') {
      result.functions.push({ name: this._extractName(node), body: content.slice(node.startIndex, node.endIndex),
        startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1,
        startByte: node.startIndex, endByte: node.endIndex });
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      this._extractDeclarations(node.namedChild(i), result, content);
    }
  }

  /** Extract function/method name from AST node. */
  static _extractName(node) {
    if (node.type === 'function_declaration' || node.type === 'function') {
      const n = node.namedChild(0); return n ? (n.text || 'anonymous') : 'anonymous';
    }
    if (node.type === 'class_declaration' || node.type === 'class') {
      const n = node.namedChild(0); return n ? (n.text || 'anonymous') : 'anonymous';
    }
    if (node.type === 'method_definition') {
      const n = node.namedChild(0); return n ? (n.text || 'anonymous') : 'anonymous';
    }
    if (node.parent && node.parent.type === 'variable_declarator') {
      const n = node.parent.namedChild(0); return n ? (n.text || 'anonymous') : 'anonymous';
    }
        return 'anonymous';
  }

  /** AST-based context extraction: replaces the ±50-line window.
   *  Extracts: target function's full body, direct imports, and immediate callers.
   */
  static async getFunctionContext(filePath, cursorLine, content) {
    const index = await this.indexFile(filePath, content);
    if (!index) return null;

    const targetFn = index.functions.find(f =>
      cursorLine >= f.startLine && cursorLine <= f.endLine
    ) || index.functions[0];

    if (!targetFn) {
      // Fallback: line-based window for non-function contexts
      const lines = content.split('\n');
      const start = Math.max(0, cursorLine - 25);
      const end = Math.min(lines.length, cursorLine + 25);
      return {
        type: 'line-window',
        content: lines.slice(start, end).join('\n'),
        startLine: start + 1, endLine: end,
        imports: index.imports, errorNodes: index.errorNodes,
      };
    }

    // Find callers — functions in this file that reference the target fn name
    const fnName = targetFn.name;
    const callers = index.functions.filter(f =>
      f.body !== targetFn.body &&
      fnName !== 'anonymous' &&
      f.body.includes(fnName)
    ).map(f => ({ name: f.name, startLine: f.startLine, endLine: f.endLine }));

    let contextParts = [];
    contextParts.push('=== Target Function ===');
    contextParts.push(targetFn.body);
    contextParts.push('\n=== Direct Imports ===');
    for (const imp of index.imports) contextParts.push(imp.text);
    if (callers.length > 0) {
      contextParts.push('\n=== Immediate Callers ===');
      for (const c of callers) {
        contextParts.push(`[Line ${c.startLine}-${c.endLine}] ${c.name}`);
      }
    }

    return {
      type: 'ast-scoped',
      functionName: fnName,
      content: contextParts.join('\n'),
      startLine: targetFn.startLine, endLine: targetFn.endLine,
      imports: index.imports, callers: callers,
      errorNodes: index.errorNodes, targetFunctionBody: targetFn.body,
            astByteSize: targetFn.body.length,
      astTokenEstimate: Math.ceil(targetFn.body.length / 4),
    };
  }

  /** Pre-flight validation: parse proposed content and check for error nodes.
   *  Used before showing diffs to the user to catch syntax errors.
   */
  static async validateParse(content, languageHint) {
    await this.ensureCore();
    let language = null;
    if (languageHint) language = this._loadedLanguages.get(languageHint);
    if (!language) {
      language = this._loadedLanguages.get('javascript') ||
                 this._loadedLanguages.get('typescriptreact') ||
                 this._loadedLanguages.get('typescript');
    }
    if (!language) language = await this.getLanguage('validate.js');
    if (!language) return { valid: false, error: 'No language available' };

    const parser = new this._Parser();
    parser.setLanguage(language);
    const start = performance.now();
    const tree = parser.parse(content);
    const parseMs = performance.now() - start;

    let errorNodes = 0; let firstError = null;
    const walk = (node) => {
      if (node.isError) {
        errorNodes++;
        if (!firstError) firstError = {
          type: node.type,
          text: node.text ? node.text.slice(0, 100) : '',
          line: node.startPosition ? node.startPosition.row + 1 : '?',
        };
      }
      for (let i = 0; i < node.namedChildCount; i++) walk(node.namedChild(i));
    };
    walk(tree.rootNode);

    return { valid: errorNodes === 0, errorNodes, firstError, parseTime: parseMs, tree };
  }

  /** Returns the set of loaded grammar names (for testing/acceptance). */
  static getLoadedLanguages() {
    return Array.from(this._loadedLanguages.keys());
  }

  /** Returns performance statistics. */
  static getStats() {
    return JSON.parse(JSON.stringify(this._stats));
  }

  /** Clears all loaded grammars and parsers (for testing). */
  static clearCache() {
    this._loadedLanguages.clear();
    this._parserCache.clear();
  }
}

/** Simple path extension helper (browser-compatible). */
function path_extname(filePath) {
  const match = String(filePath).match(/\.(js|jsx|ts|tsx|mjs|cjs|py)$/i);
  return match ? '.' + match[1].toLowerCase() : '';
}

export default ASTIndex;



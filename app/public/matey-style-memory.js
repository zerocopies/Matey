/* (c) Confidence Whisper + (d) Style Memory — combined module */

/* Confidence scoring for diffs (no LLM calls, instant heuristics) */
class ConfidenceScorer {
  static scoreDiff(diff, matchTier) {
    var search = diff.search || '';
    var replace = diff.replace || '';
    var factors = { score: 0, reasons: [] };

    // Base score from match tier
    if (matchTier === 'exact') factors.score += 40;
    else if (matchTier === 'whitespace') factors.score += 25;
    else if (matchTier === 'fuzzy') { factors.score += 10; factors.reasons.push('fuzzy-match'); }

    // Pure addition (no deletions in search)
    var isAddition = search.trim().length === 0 && replace.trim().length > 0;
    if (isAddition) { factors.score += 30; factors.reasons.push('pure-addition'); }

    // Confined to one self-contained function/block
    var searchLines = search.split('\n');
    var replaceLines = replace.split('\n');
    if (searchLines.length < 30 && replaceLines.length < 30) {
      factors.score += 10;
    }

    // Looks like a function or class signature change
    if (/\b(function|class|const|let|var)\s+\w+\s*[=\(]/.test(search) ||
        /\b(def|class|fn|fun)\s+\w+/.test(search)) {
      factors.score -= 15;
      factors.reasons.push('signature-change');
    }

    // Removes try/catch or null-check logic
    var removed = [];
    if (!search.includes('try') && replace.includes('try')) { /* adding try */ }
    if (search.includes('try') && search.includes('catch') && !replace.includes('try')) {
      factors.score -= 25;
      factors.reasons.push('removes-try-catch');
    }
    if ((search.includes('null') || search.includes('undefined')) &&
        !(replace.includes('null') || replace.includes('undefined'))) {
      factors.score -= 10;
      factors.reasons.push('removes-null-check');
    }

    // Removal of error handling patterns
    if (/\bcatch\s*\(/.test(search) && !/\bcatch\s*\(/.test(replace)) {
      factors.score -= 15;
      factors.reasons.push('removes-catch');
    }

    // Heavily mutates (large search + different large replace)
    if (search.length > 200 && replace.length > 200 && search !== replace) {
      factors.score -= 5;
      factors.reasons.push('large-change');
    }

    var confidence = factors.score >= 40 ? 'high' : (factors.score >= 15 ? 'medium' : 'low');
    return { confidence: confidence, score: factors.score, reasons: factors.reasons };
  }
}

/* Style Memory — scans existing code, builds per-workspace style profile, injects into system prompt */
class StyleProfiler {
  static DB_NAME = 'matey-style-profile';
  static STORE_NAME = 'profiles';
  static _db = null;

  static async _open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      var req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = function(e) {
        if (!e.target.result.objectStoreNames.contains('profiles')) {
          e.target.result.createObjectStore('profiles', { keyPath: 'workspace' });
        }
      };
      req.onsuccess = function(e) { this._db = e.target.result; resolve(this._db); }.bind(this);
      req.onerror = function(e) { reject(e.target.error); };
    });
  }

  static _workspaceName() {
    try {
      var fs = window.MateyFS || window.FileSystemManager;
      if (fs && typeof fs.getCurrentWorkspace === 'function') {
        var ws = fs.getCurrentWorkspace();
        if (ws && ws.name) return ws.name;
      }
    } catch (_) {}
    try { return localStorage.getItem('matey-last-workspace') || 'default'; }
    catch (_) { return 'default'; }
  }

  /* Scan a single file's content and extract style markers */
  static _scanFile(content) {
    if (!content || typeof content !== 'string') return null;
    var lines = content.split('\n');
    var markers = {
      totalLines: lines.length,
      commentLines: 0,
      indentStyle: null,  // 'spaces' or 'tabs'
      indentSize: 0,
      namingStyles: {},    // {camelCase: N, snake_case: N, PascalCase: N, kebab_case: N}
      errorStyle: {},      // {tryCatch: N, ifNullReturn: N, throws: N}
      semicolons: 0,
      noSemicolons: 0,
      doubleQuotes: 0,
      singleQuotes: 0,
      trailingCommas: 0
    };

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      // Comments
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') ||
          trimmed.startsWith('#') || trimmed === '*/') {
        markers.commentLines++;
      }

      // Indentation
      if (trimmed.length > 0 && line.length > trimmed.length) {
        var indent = line.slice(0, line.length - line.trimStart().length);
        if (indent.includes('\t') && !indent.includes('    ')) {
          markers.indentStyle = 'tabs';
        } else if (indent.includes('  ')) {
          markers.indentStyle = 'spaces';
          if (markers.indentSize === 0) {
            markers.indentSize = indent.length - indent.trimStart().length;
          }
        }
      }

      // Naming conventions
      var wordMatches = trimmed.match(/\b[a-z_][a-zA-Z0-9_]*\b/g);
      if (wordMatches) {
        for (var w of wordMatches) {
          if (w.length < 3 || w === 'var' || w === 'let' || w === 'const' || w === 'async' ||
              w === 'await' || w === 'function' || w === 'return' || w === 'if' || w === 'else' ||
              w === 'for' || w === 'while' || w === 'new' || w === 'try' || w === 'catch' ||
              w === 'throw' || w === 'this' || w === 'true' || w === 'false' || w === 'null' ||
              w === 'undefined' || w === 'import' || w === 'export' || w === 'from' || w === 'class') continue;
          if (/^[a-z][a-zA-Z0-9]*$/.test(w)) {
            markers.namingStyles.camelCase = (markers.namingStyles.camelCase || 0) + 1;
          } else if (/^[a-z][a-z0-9_]*$/.test(w) && w.includes('_')) {
            markers.namingStyles.snake_case = (markers.namingStyles.snake_case || 0) + 1;
          } else if (/^[A-Z][a-zA-Z0-9]*$/.test(w)) {
            markers.namingStyles.PascalCase = (markers.namingStyles.PascalCase || 0) + 1;
          } else if (w.includes('-')) {
            markers.namingStyles.kebab_case = (markers.namingStyles.kebab_case || 0) + 1;
          }
        }
      }

      // Error handling patterns
      if (trimmed.includes('try {') || trimmed.includes('try{')) markers.errorStyle.tryCatch = (markers.errorStyle.tryCatch || 0) + 1;
      if (/if\s*\(\s*!/.test(trimmed) && /return|throw/.test(trimmed)) markers.errorStyle.earlyReturn = (markers.errorStyle.earlyReturn || 0) + 1;
      if (/\bthrow\s+(new\s+)?\w/.test(trimmed)) markers.errorStyle.throws = (markers.errorStyle.throws || 0) + 1;

      // Quotes & semicolons
      if (trimmed.endsWith(';')) markers.semicolons++;
      if (trimmed.length > 0 && (!trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.startsWith('//') && !trimmed.startsWith('/*'))) markers.noSemicolons++;
      if (trimmed.includes('"')) markers.doubleQuotes++;
      if (trimmed.includes("'")) markers.singleQuotes++;
      if (/,\s*\}/.test(trimmed) || /,\s*\]/.test(trimmed) || /,\s*\)/.test(trimmed)) markers.trailingCommas++;
    }

    markers.commentDensity = (markers.commentLines / Math.max(1, markers.totalLines) * 100).toFixed(0) + '%';
    return markers;
  }

  /* Merge multiple file scans into a single profile */
  static _mergeProfiles(scans) {
    if (!scans || scans.length === 0) return null;
    var merged = {
      totalFiles: scans.length,
      totalLines: 0,
      commentDensity: 0,
      indentStyle: null,
      indentSize: 0,
      naming: {},
      semicolons: false,
      quotes: 'double',
      errorStyle: 'try-catch',
      trailingCommas: false
    };

    var totalComments = 0;
    var indentVotes = {};
    var indentSizes = [];
    var namingTotals = {};
    var totalSemi = 0, totalNoSemi = 0;
    var totalDoubleQ = 0, totalSingleQ = 0;
    var totalTrailing = 0;
    var errorStyles = {};

    for (var s of scans) {
      if (!s) continue;
      merged.totalLines += s.totalLines || 0;
      totalComments += s.commentLines || 0;

      if (s.indentStyle) indentVotes[s.indentStyle] = (indentVotes[s.indentStyle] || 0) + 1;
      if (s.indentSize > 0) indentSizes.push(s.indentSize);

      for (var k in s.namingStyles) namingTotals[k] = (namingTotals[k] || 0) + s.namingStyles[k];
      totalSemi += s.semicolons || 0;
      totalNoSemi += s.noSemicolons || 0;
      totalDoubleQ += s.doubleQuotes || 0;
      totalSingleQ += s.singleQuotes || 0;
      totalTrailing += s.trailingCommas || 0;

      for (var ek in s.errorStyle) errorStyles[ek] = (errorStyles[ek] || 0) + s.errorStyle[ek];
    }

    merged.commentDensity = (totalComments / Math.max(1, merged.totalLines) * 100).toFixed(0) + '%';
    merged.indentStyle = Object.entries(indentVotes).sort(function(a,b){ return b[1]-a[1]; })[0]?.[0] || 'spaces';
    merged.indentSize = indentSizes.length > 0 ? Math.round(indentSizes.reduce(function(s,v){return s+v},0) / indentSizes.length) : 2;

    // Majority naming
    var topNaming = Object.entries(namingTotals).sort(function(a,b){ return b[1]-a[1]; });
    merged.naming = topNaming.length > 0 ? topNaming[0][0] : 'camelCase';
    merged.semicolons = totalSemi > totalNoSemi;
    merged.quotes = totalSingleQ > totalDoubleQ ? 'single' : 'double';
    merged.trailingCommas = totalTrailing > merged.totalLines * 0.05;

    // Majority error style
    var topError = Object.entries(errorStyles).sort(function(a,b){ return b[1]-a[1]; });
    merged.errorStyle = topError.length > 0 ? topError[0][0] : 'mixed';

    return merged;
  }

  /* Save profile to IndexedDB */
  static async saveProfile(profile) {
    try {
      var ws = this._workspaceName();
      var db = await this._open();
      return new Promise(function(resolve) {
        var tx = db.transaction('profiles', 'readwrite');
        var store = tx.objectStore('profiles');
        store.put({ workspace: ws, profile: profile, updatedAt: Date.now() });
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      });
    } catch (_) { return false; }
  }

  /* Load profile from IndexedDB */
  static async loadProfile() {
    try {
      var ws = this._workspaceName();
      var db = await this._open();
      return new Promise(function(resolve) {
        var tx = db.transaction('profiles', 'readonly');
        var store = tx.objectStore('profiles');
        var req = store.get(ws);
        req.onsuccess = function() { resolve(req.result ? req.result.profile : null); };
        req.onerror = function() { resolve(null); };
      });
    } catch (_) { return null; }
  }

  /* Build style prompt injection string */
  static buildStylePrompt(profile) {
    if (!profile) return '';
    var parts = [];
    parts.push('Codebase style profile (match this):');
    parts.push('- Naming: ' + profile.naming);
    parts.push('- Indentation: ' + profile.indentStyle + (profile.indentStyle === 'spaces' ? ' (' + profile.indentSize + ' spaces)' : ''));
    parts.push('- Quotes: ' + profile.quotes + ' quotes');
    parts.push('- Semicolons: ' + (profile.semicolons ? 'use them' : 'avoid them'));
    parts.push('- Comment density: ' + profile.commentDensity);
    parts.push('- Error handling: ' + profile.errorStyle);
    if (profile.trailingCommas) parts.push('- Trailing commas: use them');
    return parts.join('\n');
  }

  /* Full pipeline: scan files, build profile, return prompt injection */
  static async buildFromFiles(fileContents) {
    if (!fileContents || fileContents.length === 0) return '';
    var scans = [];
    for (var c of fileContents) {
      var scan = this._scanFile(c);
      if (scan) scans.push(scan);
    }
    var profile = this._mergeProfiles(scans);
    if (profile) await this.saveProfile(profile);
    return this.buildStylePrompt(profile);
  }
}

export { ConfidenceScorer, StyleProfiler };

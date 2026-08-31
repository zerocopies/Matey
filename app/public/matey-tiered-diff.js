/* (b) TieredDiffMatcher — 4-tier SEARCH/REPLACE fallback matching */

const DIFF_REGEX = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;

class TieredDiffMatcher {
  /* Levenshtein distance (iterative, O(n*m) but bounded) */
  static _levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    // Clamp to 500 chars for performance
    var sa = a.slice(0, 500);
    var sb = b.slice(0, 500);
    var matrix = [];
    for (var i = 0; i <= sa.length; i++) { matrix[i] = [i]; }
    for (var j = 0; j <= sb.length; j++) { matrix[0][j] = j; }
    for (var i = 1; i <= sa.length; i++) {
      for (var j = 1; j <= sb.length; j++) {
        var cost = sa[i-1] === sb[j-1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i-1][j] + 1,
          matrix[i][j-1] + 1,
          matrix[i-1][j-1] + cost
        );
      }
    }
    return matrix[sa.length][sb.length];
  }

  static _similarity(a, b) {
    var maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - (this._levenshtein(a, b) / maxLen);
  }

  /* Whitespace normalization: collapse all whitespace runs to single spaces */
  static _normalizeWhitespace(s) {
    return (s || '').replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').trim();
  }

  /* Find best matching region in fileContent for searchBlock */
  static match(searchBlock, fileContent) {
    if (!searchBlock || !fileContent) {
      return { matched: false, tier: null, closestContent: null, similarity: 0, reason: 'Empty search or file content' };
    }

    var searchStr = String(searchBlock);
    var contentStr = String(fileContent);

    // Tier 1: Exact match
    var exactIdx = contentStr.indexOf(searchStr);
    if (exactIdx !== -1) {
      return { matched: true, tier: 'exact', index: exactIdx, similarity: 1.0 };
    }

    // Tier 2: Whitespace-normalized match
    var searchNorm = this._normalizeWhitespace(searchStr);
    var contentNorm = this._normalizeWhitespace(contentStr);
    if (searchNorm && contentNorm.indexOf(searchNorm) !== -1) {
      return { matched: true, tier: 'whitespace', similarity: 0.99 };
    }

    // Tier 3: Fuzzy match (≥90% similarity)
    var contentLines = contentStr.split('\n');
    var searchLines = searchStr.split('\n');
    var bestSim = 0;
    var bestIdx = -1;
    var bestWindow = '';

    // Sliding window: try each N-line window matching search line count
    var windowSize = searchLines.length;
    for (var i = 0; i <= contentLines.length - windowSize; i++) {
      var window = contentLines.slice(i, i + windowSize).join('\n');
      var sim = this._similarity(searchStr, window);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
        bestWindow = window;
      }
    }

    // Also try single-chunk comparison for long blocks
    var fullSim = this._similarity(searchStr.slice(0, 500), contentStr.slice(0, 500));
    if (fullSim > bestSim) {
      bestSim = fullSim;
      bestWindow = contentStr.slice(0, searchStr.length + 50);
    }

    if (bestSim >= 0.90) {
      return { matched: true, tier: 'fuzzy', similarity: bestSim, closestContent: bestWindow };
    }

    // Find closest match for error reporting
    if (bestWindow && bestWindow.length > 0) {
      return {
        matched: false,
        tier: null,
        similarity: bestSim,
        closestContent: bestWindow,
        searchContent: searchStr,
        reason: 'No match found. Best similarity: ' + (bestSim * 100).toFixed(1) + '% (threshold: 90%)'
      };
    }

    return {
      matched: false,
      tier: null,
      similarity: 0,
      searchContent: searchStr,
      reason: 'No match found. File content is entirely different.'
    };
  }

  /* Parse all SEARCH/REPLACE blocks from a response, match each against content */
  static parseAndMatch(responseText, fileContent) {
    var results = [];
    var match;
    var regex = new RegExp(DIFF_REGEX.source, DIFF_REGEX.flags);

    while ((match = regex.exec(responseText)) !== null) {
      var searchBlock = match[1];
      var replaceBlock = match[2];
      var matchResult = this.match(searchBlock, fileContent);
      results.push({
        search: searchBlock,
        replace: replaceBlock,
        matchResult: matchResult
      });
    }
    return results;
  }
}

export { TieredDiffMatcher, DIFF_REGEX };

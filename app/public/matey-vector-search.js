/* MateyVectorSearch — Local semantic vector search over workspace files
 * Uses TF-IDF weighting + cosine similarity for semantic retrieval.
 * No external dependencies — pure JS, runs entirely on-device.
 * Automatically chunks and indexes file contents, functions, and declarations.
 */
(function () {
  'use strict';

  var _STOP_WORDS = {};
  var _stopList = 'a about above after again against all am an and any are as at be because been before being below between both but by can cannot could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves';
  _stopList.split(' ').forEach(function(w) { _STOP_WORDS[w] = true; });

  /* ---- Tokenizer (STOP_WORDS seeded above; snake_case split into parts) ---- */
  function _tokenize(text) {
    return text
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // Split camelCase BEFORE lowercasing
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')         // NOTE: '_' also splits so snake_case matches part-queries
      .split(/\s+/)
      .filter(function(t) { return t.length > 1 && !_STOP_WORDS[t]; });
  }

  /* ---- Stemmer (Porter-like, simplified) ---- */
  function _stem(word) {
    if (word.length <= 3) return word;
    var w = word;
    if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
    else if (w.endsWith('es') && w.length > 3) w = w.slice(0, -2);
    else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) w = w.slice(0, -1);
    if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
    else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
    if (w.endsWith('ly') && w.length > 4) w = w.slice(0, -2);
    if (w.endsWith('er') && w.length > 4) w = w.slice(0, -2);
    if (w.endsWith('tion') && w.length > 5) w = w.slice(0, -4);
    if (w.endsWith('icate') && w.length > 6) w = w.slice(0, -5) + 'ic';
    if (w.endsWith('ative') && w.length > 6) w = w.slice(0, -5);
    return w;
  }

  function _stemTokens(tokens) {
    return tokens.map(_stem);
  }

  /* ---- Chunking ---- */
  function _chunkText(text, chunkSize, overlap) {
    chunkSize = chunkSize || 50;
    overlap = overlap || 10;
    var lines = text.split('\n');
    var chunks = [];
    var start = 0;
    while (start < lines.length) {
      var end = Math.min(start + chunkSize, lines.length);
      var chunkLines = lines.slice(start, end);
      var chunkText = chunkLines.join('\n');
      if (chunkText.trim().length > 20) {
        chunks.push({
          text: chunkText,
          startLine: start + 1,
          endLine: end
        });
      }
      start += (chunkSize - overlap);
    }
    return chunks;
  }

  /* ---- TF-IDF Vector Index ---- */
  var _index = {
    chunks: [],       // [{ file, text, startLine, endLine, tokens, tf }]
    docFreq: {},      // term -> number of chunks containing it
    totalDocs: 0,
    fileMap: {}       // file -> [chunk indices]
  };

  function _computeTf(tokens) {
    var tf = {};
    for (var i = 0; i < tokens.length; i++) {
      tf[tokens[i]] = (tf[tokens[i]] || 0) + 1;
    }
    var max = 0;
    for (var k in tf) { if (tf[k] > max) max = tf[k]; }
    if (max > 0) {
      for (var k2 in tf) { tf[k2] = 0.5 + 0.5 * (tf[k2] / max); }
    }
    return tf;
  }

  function _idf(term) {
    var df = _index.docFreq[term] || 0;
    if (df === 0) return 0;
    // Laplace smoothing: +1 to numerator and denominator prevents IDF=0 when df==totalDocs
    return Math.log((1 + _index.totalDocs) / (1 + df)) + 1;
  }

  /* ---- Public API ---- */

  /* Index a single file — chunks it and adds to the index */
  function indexFile(filePath, content) {
    if (!content || typeof content !== 'string') return;
    // Remove old chunks for this file
    removeFile(filePath);

    var chunks = _chunkText(content, 50, 10);
    var baseIdx = _index.chunks.length;

    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i];
      var tokens = _stemTokens(_tokenize(chunk.text));
      if (tokens.length === 0) continue;
      var tf = _computeTf(tokens);
      var idx = _index.chunks.length;
      _index.chunks.push({
        file: filePath,
        text: chunk.text,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        tokens: tokens,
        tf: tf
      });
      if (!_index.fileMap[filePath]) _index.fileMap[filePath] = [];
      _index.fileMap[filePath].push(idx);
    }

    // Update document frequencies
    var affected = _index.chunks.slice(baseIdx);
    for (var j = 0; j < affected.length; j++) {
      var seen = {};
      for (var t = 0; t < affected[j].tokens.length; t++) {
        var term = affected[j].tokens[t];
        if (!seen[term]) { seen[term] = true; _index.docFreq[term] = (_index.docFreq[term] || 0) + 1; }
      }
    }
    _index.totalDocs = _index.chunks.length;
  }

  /* Remove a file's chunks from the index */
  function removeFile(filePath) {
    if (!_index.fileMap[filePath]) return;
    var indices = _index.fileMap[filePath].slice().sort(function(a,b){return b-a;});
    for (var i = 0; i < indices.length; i++) {
      _index.chunks.splice(indices[i], 1);
    }
    delete _index.fileMap[filePath];
    // Rebuild index integrity
    _rebuildIndex();
  }

  function _rebuildIndex() {
    _index.docFreq = {};
    _index.fileMap = {};
    _index.totalDocs = _index.chunks.length;
    for (var i = 0; i < _index.chunks.length; i++) {
      var chunk = _index.chunks[i];
      if (!_index.fileMap[chunk.file]) _index.fileMap[chunk.file] = [];
      _index.fileMap[chunk.file].push(i);
      var seen = {};
      for (var t = 0; t < chunk.tokens.length; t++) {
        var term = chunk.tokens[t];
        if (!seen[term]) { seen[term] = true; _index.docFreq[term] = (_index.docFreq[term] || 0) + 1; }
      }
    }
  }

  /* Index all workspace files */
  function indexWorkspace(fileList) {
    if (!fileList) return;
    for (var i = 0; i < fileList.length; i++) {
      var entry = fileList[i];
      var path = entry.path || entry.name || (typeof entry === 'string' ? entry : null);
      if (!path || entry.type === 'directory') continue;
      if (!_isTextFile(path)) continue;
      (function (p) {
        try {
          _readFileContent(p).then(function(content) {
            if (content) indexFile(p, content);
          }).catch(function() {});
        } catch (e) {}
      })(path);
    }
  }

  function _isTextFile(path) {
    var ext = path.split('.').pop().toLowerCase();
    return ['js','ts','jsx','tsx','py','java','c','cpp','h','hpp','css','html','htm','json','md','txt','xml','yaml','yml','sh','bash','go','rs','rb','php','swift','kt','sql','vue','svelte','scss','less','svg'].indexOf(ext) !== -1;
  }

  function _readFileContent(path) {
    return new Promise(function(resolve) {
      if (window.MateyFS && typeof window.MateyFS.readFile === 'function') {
        window.MateyFS.readFile(path).then(function(d) { resolve(typeof d === 'string' ? d : null); }).catch(function() { resolve(null); });
      } else if (window.FileSystemManager && typeof window.FileSystemManager.readFile === 'function') {
        window.FileSystemManager.readFile(path).then(function(d) { resolve(typeof d === 'string' ? d : null); }).catch(function() { resolve(null); });
      } else { resolve(null); }
    });
  }

  /* ---- Search ---- */
  function search(query, topK) {
    topK = topK || 5;
    if (!query || !_index.chunks.length) return [];

    var queryTokens = _stemTokens(_tokenize(query));
    if (!queryTokens.length) return [];

    var queryTf = _computeTf(queryTokens);
    var scores = [];

    for (var i = 0; i < _index.chunks.length; i++) {
      var chunk = _index.chunks[i];
      var score = _cosineSimilarity(queryTf, queryTokens, chunk);
      if (score > 0) {
        scores.push({ index: i, score: score, file: chunk.file, text: chunk.text, startLine: chunk.startLine, endLine: chunk.endLine });
      }
    }

    scores.sort(function(a, b) { return b.score - a.score; });
    return scores.slice(0, topK);
  }

  function _cosineSimilarity(queryTf, queryTokens, chunk) {
    var dot = 0, qNorm = 0, cNorm = 0;

    for (var term in queryTf) {
      var qWeight = queryTf[term] * _idf(term);
      qNorm += qWeight * qWeight;
      if (chunk.tf[term]) {
        var cWeight = chunk.tf[term] * _idf(term);
        dot += qWeight * cWeight;
      }
    }

    for (var ct in chunk.tf) {
      var w = chunk.tf[ct] * _idf(ct);
      cNorm += w * w;
    }

    var denom = Math.sqrt(qNorm) * Math.sqrt(cNorm);
    if (denom === 0) return 0;
    return dot / denom;
  }

  /* ---- Stats ---- */
  function getStats() {
    return {
      totalChunks: _index.chunks.length,
      totalFiles: Object.keys(_index.fileMap).length,
      vocabSize: Object.keys(_index.docFreq).length
    };
  }

  function clearIndex() {
    _index = { chunks: [], docFreq: {}, totalDocs: 0, fileMap: {} };
  }

  window.MateyVectorSearch = {
    indexFile: indexFile,
    removeFile: removeFile,
    indexWorkspace: indexWorkspace,
    search: search,
    getStats: getStats,
    clearIndex: clearIndex
  };
})();

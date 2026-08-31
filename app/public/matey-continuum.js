/* ==================== Matey Continuum — Cross-Session Memory Engine ====================
   Persists entities (files, concepts, patterns) and episodes (task runs)
   across sessions per workspace. Decays importance over time, retrieves
   relevant context via keyword matching with recency boost.

   Stage 4.3 — P0+P1 fixes baked in:
     1. Smart keyword extraction (stopwords + bigrams)
     2. Relevance scoring (keyword match 0.3 + decayed importance 0.4 + recency 0.25)
     3. Importance decay (entities → ~30% over 14 days)
     4. Token budget enforcement (truncate to word boundary)
     5. Periodic pruning (caps + age cleanup)                                           */

const ENGLISH_STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','up','about','into','through','during','before','after','above','below',
  'between','out','off','over','under','again','further','then','once','here',
  'there','when','where','why','how','all','both','each','few','more','most',
  'other','some','such','no','nor','not','only','own','same','so','than','too',
  'very','just','because','as','until','while','is','am','are','was','were','be',
  'been','being','have','has','had','having','do','does','did','doing','will',
  'would','shall','should','may','might','must','can','could','it','its','i',
  'me','my','we','our','you','your','he','she','they','them','this','that',
  'these','those','which','who','whom','what','if','also','get','make','go',
  'know','take','see','come','think','look','want','give','use','find','tell',
  'ask','work','seem','feel','try','leave','call','keep','let','need','like',
  'new','good','first','last','long','great','little','own','other','old','right',
  'big','high','different','small','large','next','early','young','important','public',
  'bad','same','able'
]);

const CONTINUUM_TOKEN_CHARS = 4;
const MAX_KEYWORDS = 20;
const ENTITY_CAP = 200;
const EPISODE_CAP = 500;
const MAX_ENTITY_AGE_DAYS = 90;
const PRUNE_INTERVAL_RECORDINGS = 50;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

class MateyContinuum {
  static _db = null;
  static DB_NAME = 'matey-continuum';
  static STORE_ENTITIES = 'entities';
  static STORE_EPISODES = 'episodes';
  static _recordingsSincePrune = 0;
  static _lastPruneTime = 0;

  static async _open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_ENTITIES)) {
          db.createObjectStore(this.STORE_ENTITIES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.STORE_EPISODES)) {
          const epStore = db.createObjectStore(this.STORE_EPISODES, { keyPath: 'id', autoIncrement: true });
          epStore.createIndex('byTime', 'recordedAt', { unique: false });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  static _workspaceName() {
    try {
      const fs = window.MateyFS || window.FileSystemManager;
      if (fs && typeof fs.getCurrentWorkspace === 'function') {
        const ws = fs.getCurrentWorkspace();
        if (ws && ws.name) return ws.name;
      }
    } catch (_) {}
    try { return localStorage.getItem('matey-last-workspace') || 'default'; }
    catch (_) { return 'default'; }
  }

  static _extractKeywords(text) {
    if (!text) return [];
    const words = String(text).toLowerCase()
      .replace(/[^a-z0-9_\-\/\.]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !ENGLISH_STOPWORDS.has(w));
    const unique = [];
    const seen = new Set();
    for (const w of words) { if (!seen.has(w)) { seen.add(w); unique.push(w); } }
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      const bg = words[i] + '_' + words[i + 1];
      if (!seen.has(bg)) { seen.add(bg); bigrams.push(bg); }
    }
    const combined = unique.concat(bigrams);
    return combined.slice(0, MAX_KEYWORDS);
  }

  static _decayImportance(entity) {
    const ageDays = (Date.now() - (entity.lastUpdated || entity.firstSeen || 0)) / (1000 * 60 * 60 * 24);
    const rawImportance = entity.importance || 0.5;
    const decayFactor = Math.max(0.05, 1 - (ageDays / 14) * 0.7);
    return Math.min(0.95, rawImportance * decayFactor);
  }

  static _decayRecency(episode) {
    const ageHours = (Date.now() - (episode.recordedAt || 0)) / (1000 * 60 * 60);
    return Math.max(0.01, 1 - ageHours / 72);
  }

  static _scoreEntity(entity, keywords) {
    let score = 0;
    const name = (entity.name || '').toLowerCase();
    const type = (entity.type || '').toLowerCase();
    let kwMatches = 0;
    for (const kw of keywords) {
      if (name.includes(kw) || type.includes(kw)) kwMatches++;
    }
    score += Math.min(1, kwMatches * 0.3);
    score += this._decayImportance(entity) * 0.4;
    const ageDays = (Date.now() - (entity.lastTouched || entity.firstSeen || 0)) / (1000 * 60 * 60 * 24);
    const recency = Math.max(0.01, 1 - ageDays / 30);
    score += recency * 0.25;
    return score;
  }

  static async _relevantEntities(keywords, maxResults) {
    maxResults = maxResults || 50;
    try {
      const db = await this._open();
      const ws = this._workspaceName();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_ENTITIES, 'readonly');
        const store = tx.objectStore(this.STORE_ENTITIES);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result || [])
            .filter(e => e.workspace === ws)
            .map(e => { e._score = this._scoreEntity(e, keywords); return e; })
            .filter(e => e._score > 0.1)
            .sort((a, b) => b._score - a._score)
            .slice(0, maxResults);
          resolve(all);
        };
        req.onerror = () => resolve([]);
      });
    } catch (_) { return []; }
  }

  static async _recentEpisodes(maxResults) {
    maxResults = maxResults || 30;
    try {
      const db = await this._open();
      const ws = this._workspaceName();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_EPISODES, 'readonly');
        const store = tx.objectStore(this.STORE_EPISODES);
        const idx = store.index('byTime');
        const req = idx.openCursor(null, 'prev');
        const results = [];
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && results.length < maxResults) {
            if (cursor.value.workspace === ws) results.push(cursor.value);
            cursor.continue();
          } else { resolve(results); }
        };
        req.onerror = () => resolve([]);
      });
    } catch (_) { return []; }
  }

  static _truncateToTokenBudget(text, maxTokens) {
    if (!text || maxTokens <= 0) return '';
    const maxChars = maxTokens * CONTINUUM_TOKEN_CHARS;
    if (text.length <= maxChars) return text;
    const truncated = text.slice(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > maxChars * 0.7 ? truncated.slice(0, lastSpace) + '…' : truncated + '…';
  }

  static async _maybePrune() {
    this._recordingsSincePrune++;
    const now = Date.now();
    if (this._recordingsSincePrune < PRUNE_INTERVAL_RECORDINGS &&
        (this._lastPruneTime === 0 || now - this._lastPruneTime < PRUNE_INTERVAL_MS)) return;
    this._recordingsSincePrune = 0;
    this._lastPruneTime = now;
    try {
      const db = await this._open();
      const ws = this._workspaceName();
      const cutoff = now - MAX_ENTITY_AGE_DAYS * 24 * 60 * 60 * 1000;
      // Prune entities
      await new Promise((resolve) => {
        const tx = db.transaction(this.STORE_ENTITIES, 'readwrite');
        const store = tx.objectStore(this.STORE_ENTITIES);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result || []).filter(e => e.workspace === ws);
          for (const e of all) {
            if ((e.firstSeen || 0) < cutoff || (e.lastUpdated || e.firstSeen || 0) < cutoff) store.delete(e.id);
          }
          const remaining = all.filter(e => (e.firstSeen || 0) >= cutoff && (e.lastUpdated || e.firstSeen || 0) >= cutoff);
          if (remaining.length > ENTITY_CAP) {
            remaining.sort((a, b) => this._decayImportance(a) - this._decayImportance(b));
            for (const e of remaining.slice(0, remaining.length - ENTITY_CAP)) store.delete(e.id);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      // Prune episodes
      await new Promise((resolve) => {
        const tx = db.transaction(this.STORE_EPISODES, 'readwrite');
        const store = tx.objectStore(this.STORE_EPISODES);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result || []).filter(e => e.workspace === ws);
          for (const ep of all) { if ((ep.recordedAt || 0) < cutoff) store.delete(ep.id); }
          const remaining = all.filter(e => (e.recordedAt || 0) >= cutoff);
          if (remaining.length > EPISODE_CAP) {
            remaining.sort((a, b) => (a.recordedAt || 0) - (b.recordedAt || 0));
            for (const ep of remaining.slice(0, remaining.length - EPISODE_CAP)) store.delete(ep.id);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      console.log('[Continuum] Pruned entities + episodes for workspace:', ws);
    } catch (e) { console.warn('[Continuum] Prune failed:', e.message); }
  }

  static async recordEntity(name, type, importance, metadata) {
    try {
      if (!name || !type) return;
      importance = Math.max(0.05, Math.min(0.95, Number(importance) || 0.5));
      const ws = this._workspaceName();
      const id = ws + '::' + type + '::' + name.toLowerCase().replace(/\s+/g, '_');
      const db = await this._open();
      const now = Date.now();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_ENTITIES, 'readwrite');
        const store = tx.objectStore(this.STORE_ENTITIES);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          const entry = {
            id, workspace: ws, name, type,
            importance: existing ? Math.min(0.95, (existing.importance || 0.5) * 0.7 + importance * 0.3) : importance,
            metadata: metadata || {},
            firstSeen: existing ? existing.firstSeen : now,
            lastUpdated: now, lastTouched: now,
            accessCount: (existing ? existing.accessCount || 0 : 0) + 1
          };
          store.put(entry);
        };
        tx.oncomplete = () => { resolve(true); this._maybePrune(); };
        tx.onerror = () => resolve(false);
      });
    } catch (_) { return false; }
  }

  static async touchEntity(name, type) {
    try {
      const ws = this._workspaceName();
      const id = ws + '::' + type + '::' + name.toLowerCase().replace(/\s+/g, '_');
      const db = await this._open();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_ENTITIES, 'readwrite');
        const store = tx.objectStore(this.STORE_ENTITIES);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const entry = getReq.result;
          if (entry) {
            entry.lastTouched = Date.now();
            entry.accessCount = (entry.accessCount || 0) + 1;
            entry.importance = Math.min(0.95, (entry.importance || 0.5) + 0.02);
            store.put(entry);
          }
        };
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) { return false; }
  }

  static async recordEpisode(summary, entities, stepCount, outcome) {
    try {
      const ws = this._workspaceName();
      const db = await this._open();
      const now = Date.now();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_EPISODES, 'readwrite');
        const store = tx.objectStore(this.STORE_EPISODES);
        store.add({
          workspace: ws,
          summary: String(summary || '').slice(0, 500),
          entities: Array.isArray(entities) ? entities.slice(0, 20) : [],
          stepCount: stepCount || 0,
          outcome: outcome || 'unknown',
          recordedAt: now
        });
        tx.oncomplete = () => { resolve(true); this._maybePrune(); };
        tx.onerror = () => resolve(false);
      });
    } catch (_) { return false; }
  }

  static async recallContext(taskPrompt, maxTokens) {
    maxTokens = maxTokens || 800;
    try {
      const keywords = this._extractKeywords(taskPrompt);
      if (keywords.length === 0) return null;
      const [entities, episodes] = await Promise.all([
        this._relevantEntities(keywords, 20),
        this._recentEpisodes(15)
      ]);
      for (const e of entities) { this.touchEntity(e.name, e.type).catch(() => {}); }
      let contextText = '';
      const recentEps = episodes.filter(ep => this._decayRecency(ep) > 0.1).slice(0, 8);
      if (recentEps.length > 0) {
        contextText += 'Recent activity in this workspace:\n';
        for (const ep of recentEps) {
          contextText += '- [' + new Date(ep.recordedAt).toLocaleString() + '] ' + ep.summary + ' (' + ep.outcome + ', ' + ep.stepCount + ' steps)\n';
        }
        contextText += '\n';
      }
      if (entities.length > 0) {
        contextText += 'Relevant known entities:\n';
        for (const e of entities.slice(0, 15)) {
          contextText += '- [' + e.type + '] ' + e.name + ' (score: ' + (e._score || 0).toFixed(2) + ')\n';
        }
      }
      return this._truncateToTokenBudget(contextText, maxTokens);
    } catch (e) {
      console.warn('[Continuum] recallContext failed:', e.message);
      return null;
    }
  }

  static async recordFromToolCall(toolName, args, result, success) {
    try {
      const argStr = typeof args === 'string' ? args : JSON.stringify(args || {});
      const keywords = this._extractKeywords(toolName + ' ' + argStr);
      for (const kw of keywords.slice(0, 5)) {
        if (kw.length < 3) continue;
        const type = success ? 'concept' : 'trouble_spot';
        const importance = success ? 0.3 : 0.5;
        await this.recordEntity(kw, type, importance, { tool: toolName, lastOutcome: success ? 'success' : 'failure' });
      }
    } catch (_) {}
  }
}

export { MateyContinuum };
if (typeof window !== 'undefined') window.MateyContinuum = MateyContinuum;

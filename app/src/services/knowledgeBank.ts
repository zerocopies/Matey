import { createStorageAdapter } from '../lib/storage/storage';
import { newId, nowIso } from '../lib/storage/utils';

export type NoteKind = 'scratchpad' | 'permanent';
export type NoteStatus = 'pending' | 'done';

export interface KnowledgeNote {
  id: string;
  kind: NoteKind;
  /** Raw syntax token the note was created with. */
  syntax: '##' | '**';
  /** Plain-text body. */
  text: string;
  /** Tags parsed out of the body, e.g. `#ProjectA`. */
  tags: string[];
  /** Lowercased keyword tokens extracted from the body. */
  keywords: string[];
  /** `!!` marks the note as priority. */
  priority: boolean;
  /** `[ ]` extracted tasks. */
  tasks: { id: string; text: string; done: boolean; priority: boolean }[];
  createdAt: string;
}

const STORAGE_KEY = 'matey.knowledge';

/**
 * The Knowledge Bank — Matey1.txt §7.
 * A centralized, on-device repository of structured scratchpad (`##`)
 * and permanent (`**`) notes, fully searchable via natural language and
 * the `??` syntax. Backed by the same Capacitor storage adapter the rest
 * of the app uses, so it is zero-config / offline-first.
 */
export class KnowledgeBank {
  private notes: KnowledgeNote[] = [];
  private ready = false;

  constructor(private storage = createStorageAdapter()) {}

  async init(): Promise<KnowledgeNote[]> {
    if (this.ready) return this.notes;
    const raw = await this.storage.get(STORAGE_KEY);
    if (raw) {
      try {
        this.notes = JSON.parse(raw) as KnowledgeNote[];
      } catch {
        this.notes = [];
      }
    }
    this.ready = true;
    return this.notes;
  }

  private persist() {
    void this.storage.set(STORAGE_KEY, JSON.stringify(this.notes));
  }

  async all(): Promise<KnowledgeNote[]> {
    await this.init();
    return this.notes;
  }

  async permanent(): Promise<KnowledgeNote[]> {
    await this.init();
    return this.notes.filter((n) => n.kind === 'permanent');
  }

  /** Add a note from raw syntax input (e.g. `** best skincare routine #daily`). */
  async ingest(text: string, syntax: '##' | '**'): Promise<KnowledgeNote> {
    await this.init();
    const note: KnowledgeNote = {
      id: newId(),
      kind: syntax === '**' ? 'permanent' : 'scratchpad',
      syntax,
      text,
      tags: (text.match(/#\w+/g) || []).map((t) => t.toLowerCase()),
      keywords: text
        .toLowerCase()
        .replace(/[##**\[\]!!#]/g, ' ')
        .split(/\s+/)
        .filter(Boolean),
      priority: /!!/.test(text),
      tasks: parseTasks(text),
      createdAt: nowIso(),
    };
    this.notes = [note, ...this.notes];
    this.persist();
    return note;
  }

  /**
   * Local RAG-style ranking (Matey1.txt §5 / §7).
   * Scores each note against the requested tags/keywords and an optional
   * persona context string, returning the best matches first. This is the
   * override path used by the "Knowledge Filter" (Template B) custom tab.
   */
  async query(opts: {
    tags?: string[];
    keywords?: string[];
    personaContext?: string;
    limit?: number;
  }): Promise<KnowledgeNote[]> {
    await this.init();
    const normTags = (opts.tags || []).map((t) => t.toLowerCase());
    const normKw = (opts.keywords || []).map((k) => k.toLowerCase());
    const ctxTokens = (opts.personaContext || '')
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean);

    return this.notes
      .map((n) => {
        let score = 0;
        // tag match
        normTags.forEach((t) => {
          if (n.tags.includes(t)) score += 3;
        });
        // keyword match
        normKw.forEach((k) => {
          if (n.keywords.includes(k)) score += 2;
          if (n.text.toLowerCase().includes(k)) score += 1;
        });
        // persona-context salience
        ctxTokens.forEach((tok) => {
          if (n.keywords.includes(tok)) score += 1;
        });
        return { n, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 30)
      .map((s) => s.n);
  }
}

export const knowledgeBank = new KnowledgeBank();

function parseTasks(text: string) {
  const matches = text.match(/\[ \]\s*(.+)/g);
  if (!matches) return [];
  return matches.map((m) => ({
    id: newId(),
    text: m.replace(/^\[ \]\s*/, ''),
    done: false,
    priority: /!!/.test(m),
  }));
}

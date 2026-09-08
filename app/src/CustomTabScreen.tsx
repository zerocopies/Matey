import React, { useEffect, useState, useCallback } from "react";
import { Send, RefreshCw } from "lucide-react";
import { usePersona } from "./context/PersonaContext";
import { CustomTabConfig, decodeCustomTabConfig } from "./types/customTab";
import { knowledgeBank, KnowledgeNote } from "./services/knowledgeBank";

// CapacitorHttp native HTTP wrapper — bypasses WebView CORS blocks on mobile
function nativeFetch(url, options) {
  var opts = options || {};
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
    var reqOpts = {
      method: (opts.method || 'GET').toUpperCase(),
      url: url,
      headers: opts.headers || {}
    };
    if (opts.body) {
      if (typeof opts.body === 'string') {
        try { reqOpts.data = JSON.parse(opts.body); }
        catch (e) { reqOpts.data = opts.body; reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'application/json'; }
      } else {
        reqOpts.data = opts.body;
      }
    }
    return window.Capacitor.Plugins.CapacitorHttp.request(reqOpts).then(function (resp) {
      return {
        ok: resp.status >= 200 && resp.status < 300,
        status: resp.status,
        statusText: resp.status,
        headers: resp.headers || {},
        url: resp.url || url,
        json: function () { return Promise.resolve(resp.data); },
        text: function () { return Promise.resolve(typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)); }
      };
    });
  }
  return fetch(url, opts);
}

export interface CustomTabScreenProps {
  configBlob: string | null;
  onRequestConfigure: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * The rendered surface of an enabled Custom Tab (Matey1.txt §3 — Custom Tab).
 * Decodes its `matey://custom-tab?config={base64}` blob and dispatches to one
 * of the four "out of the box" templates.
 */
export const CustomTabScreen: React.FC<CustomTabScreenProps> = ({
  configBlob,
  onRequestConfigure,
}) => {
  const [config, setConfig] = useState<CustomTabConfig | null>(null);
  const { persona } = usePersona();

  useEffect(() => {
    if (configBlob) {
      setConfig(decodeCustomTabConfig(configBlob));
    } else {
      setConfig(null);
    }
  }, [configBlob]);

  if (!config) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <button
          onClick={onRequestConfigure}
          className="rounded-full border border-border-hard/10 bg-bg/5 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-bg/60 hover:border-bg hover:text-bg"
        >
          Configure Custom Tab +
        </button>
      </div>
    );
  }

  const personaContext = `${persona.name} — ${persona.profession}`;
  switch (config.template) {
    case "assistant":
      return (
        <AssistantTemplate config={config} personaContext={personaContext} />
      );
    case "knowledge-filter":
      return (
        <KnowledgeFilterTemplate
          config={config}
          personaContext={personaContext}
        />
      );
    case "task-center":
      return <TaskCenterTemplate config={config} />;
    case "connect-track":
      return <ConnectTrackTemplate config={config} />;
    default:
      return null;
  }
};

/* ------------------------------------------------------------------ */
/* Template A — AI Assistant (dynamic chat)                            */
/* ------------------------------------------------------------------ */
function AssistantTemplate({
  config,
  personaContext,
}: {
  config: CustomTabConfig;
  personaContext: string;
}) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = { role: "user", text: input.trim() };
    const systemPrompt = `You are Matey's AI Assistant acting as an "${
      config.role || "helper"
    }". Focus your responses strictly on "${
      config.topic || "the configured topic"
    }". Do not use the Knowledge Bank unless explicitly asked. User context: ${personaContext}.`;
    const assistantMsg: ChatMessage = {
      role: "assistant",
      text: `System prompt armed:\n${systemPrompt}\n\n(Assistant response placeholder — wire to your BYOK provider to replace.)`,
    };
    setHistory((h) => [...h, userMsg, assistantMsg]);
    setInput("");
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-bg/40">
        <span className="mr-1">💬</span> {config.name}
      </div>
      <main className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {history.length === 0 ? (
          <p className="text-center text-[10px] text-bg/40">
            Ask away. Role: <strong>{config.role || "general"}</strong> · Topic:{" "}
            <strong>{config.topic || "open"}</strong>
          </p>
        ) : (
          history.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                m.role === "assistant"
                  ? "self-start rounded-tl-sm bg-bg/5 text-bg"
                  : "self-end rounded-tr-sm bg-bg text-surface"
              }`}
            >
              {m.text}
            </div>
          ))
        )}
      </main>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2 px-3 pb-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-full border border-border-hard/10 bg-bg/5 px-3 py-2 text-[12px] text-bg outline-none placeholder:text-bg/30 focus:border-bg"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="Send"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border-hard/10 bg-bg text-bg/60 hover:border-bg hover:text-bg disabled:cursor-not-allowed"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Template B — Knowledge Filter (scoped RAG feed)                   */
/* ------------------------------------------------------------------ */
function KnowledgeFilterTemplate({
  config,
  personaContext,
}: {
  config: CustomTabConfig;
  personaContext: string;
}) {
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await knowledgeBank.query({
      tags: config.tags,
      keywords: config.keywords,
      personaContext,
    });
    setNotes(results);
    setLoading(false);
  }, [config, personaContext]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <div className="px-1 pb-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-bg/40">
          🔍 {config.name}
        </p>
        <p className="mt-0.5 text-[10px] text-bg/50">
          Scoped to:{" "}
          <span className="text-bg/70">
            {config.tags?.join(", ") || "all tags"}
          </span>{" "}
          ·{" "}
          <span className="text-bg/70">
            {config.keywords?.join(", ") || "all keywords"}
          </span>
        </p>
      </div>
      {loading ? (
        <p className="px-2 text-[10px] text-bg/40">
          Ranking notes against your profile…
        </p>
      ) : notes.length === 0 ? (
        <p className="px-2 text-[10px] text-bg/40">
          No matching notes yet. Add one with <code>##</code> or <code>**</code>
          .
        </p>
      ) : (
        <div className="space-y-1.5">
          {notes.map((n) => (
            <KnowledgeCard key={n.id} note={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function KnowledgeCard({ note }: { note: KnowledgeNote }) {
  return (
    <div className="rounded-xl border border-border-hard/5 bg-surface p-3">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-bg/40">
        <span>{note.kind === "permanent" ? "**" : "##"}</span>
        {note.priority && <span className="text-bg/70">!! priority</span>}
        {note.tags.map((t) => (
          <span
            key={t}
            className="rounded-full border border-border-hard/5 bg-bg/5 px-1.5 py-0.5 text-bg/50"
          >
            {t}
          </span>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-bg/75">{note.text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Template C — Task & Priority Center                               */
/* ------------------------------------------------------------------ */
function TaskCenterTemplate({ config }: { config: CustomTabConfig }) {
  const [tasks, setTasks] = useState<
    {
      id: string;
      text: string;
      done: boolean;
      priority: boolean;
      noteId: string;
    }[]
  >([]);

  useEffect(() => {
    void (async () => {
      const notes = await knowledgeBank.all();
      const all = notes.flatMap((n) =>
        n.tasks.map((t) => ({ ...t, noteId: n.id }))
      );
      setTasks(all.sort((a, b) => Number(a.done) - Number(b.done)));
    })();
  }, []);

  const toggle = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <div className="px-1 pb-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-bg/40">
          ✅ {config.name}
        </p>
        <p className="mt-0.5 text-[10px] text-bg/50">
          {pending.length} pending · {done.length} done
        </p>
      </div>
      {tasks.length === 0 ? (
        <p className="px-2 text-[10px] text-bg/40">
          No tasks found. Add notes with <code>[ ] task</code> to populate.
        </p>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <>
              <div className="text-[9px] font-black uppercase tracking-widest text-bg/40">
                Pending
              </div>
              <div className="space-y-1.5">
                {pending.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={toggle} />
                ))}
              </div>
            </>
          )}
          {done.length > 0 && (
            <>
              <div className="text-[9px] font-black uppercase tracking-widest text-bg/40">
                Done
              </div>
              <div className="space-y-1.5">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={toggle} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: { id: string; text: string; done: boolean; priority: boolean };
  onToggle: (id: string) => void;
}

function TaskRow({ task, onToggle }: TaskRowProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(task.id)}
      className="w-full rounded-xl border border-border-hard/5 bg-surface p-2.5 text-left transition-all hover:bg-bg/5"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[8px] font-black ${
            task.done
              ? "border-bg bg-bg text-surface"
              : "border-bg/40 text-bg/40"
          }`}
          aria-hidden
        >
          {task.done ? "✓" : " "}
        </span>
        <span
          className={`text-[11px] leading-relaxed ${
            task.done ? "text-bg/30 line-through" : "text-bg/75"
          }`}
        >
          {task.text}
        </span>
        {task.priority && <span className="ml-auto text-[10px]">!!</span>}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Template D — Connect & Track (external webhook dashboard)         */
/* ------------------------------------------------------------------ */
function ConnectTrackTemplate({ config }: { config: CustomTabConfig }) {
  const [payload, setPayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!config.webhookUrl) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await nativeFetch(config.webhookUrl, {
        method: "GET",
        headers: config.webhookUrl.startsWith("http://")
          ? {}
          : { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPayload(await res.json());
    } catch (e: any) {
      setErr(e.message || "Fetch failed");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    if (config.webhookUrl) void refresh();
  }, [config, refresh]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <div className="px-1 pb-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-bg/40">
          🔗 {config.name}
        </p>
        <p className="mt-0.5 text-[10px] text-bg/50">
          Service:{" "}
          <span className="text-bg/70">
            {config.webhookService || "unnamed"}
          </span>
        </p>
      </div>
      {!config.webhookUrl ? (
        <p className="px-2 text-[10px] text-bg/40">
          No webhook URL configured. Re-run the wizard to set one.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-end gap-2 px-1 pb-2">
            <button
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Refresh"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border-hard/10 bg-transparent text-bg/60 hover:text-bg"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
          {err ? (
            <p className="px-2 text-[10px] text-red-400/80">{err}</p>
          ) : loading ? (
            <p className="px-2 text-[10px] text-bg/40">Polling webhook…</p>
          ) : payload ? (
            <pre className="w-full overflow-x-auto rounded-xl border border-border-hard/5 bg-surface p-3 text-[10px] leading-relaxed text-bg/65">
              {JSON.stringify(payload, null, 2)}
            </pre>
          ) : (
            <p className="px-2 text-[10px] text-bg/40">No payload yet.</p>
          )}
        </>
      )}
    </div>
  );
}

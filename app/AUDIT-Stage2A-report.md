# Stage 2A Audit Report: Current Context/Memory State

## 1. Message Array Construction & Cross-Turn Memory

**File:** `public/matey-agent.js`

### Token estimation — lines 5-40

```javascript
const TOKEN_ENCODING_MODEL = 'gpt-3.5-turbo';
const TOKENS_PER_MESSAGE_FUDGE = 4;
const MAX_TOTAL_TOKENS = 128000;
const PRESERVE_SYSTEM = true;

function estimateTokenCount(text) {
  if (!text) return 0;
  const str = String(text);
  const words = str.trim().split(/\s+/).length;
  return Math.ceil(words * 1.3);         // ← word-count heuristic, not a real tokenizer
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
```

### Pruning — lines 42-64

```javascript
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

  while (total > maxTokens && messages.length > 0) {
    const removed = messages.shift();       // ← shifts oldest non-system message
    total -= estimateMessageTokens(removed);
  }

  if (systemMsg) {
    messages.unshift(systemMsg);
  }
  return { pruned: messages, removed: Math.max(0, history.length - messages.length) };
}
```

### History array & trimHistory — lines 377-396

```javascript
this.conversationHistory = [];
this.maxContextTokens = MAX_TOTAL_TOKENS;

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
```

### Key observation: NO "last 20 messages" cap — it's purely token-based

There is **no fixed message-count limit**. `trimHistory()` removes oldest non-system messages until under the token budget. The task/context message is just another non-system message and **can be pruned** if the conversation grows large enough.

---

## 2. System Prompt / Prompt-Building Logic

**File:** `public/matey-agent.js`, lines 423-434

```javascript
const systemMessage = {
  role: 'system',
  content: `You are Matey's coding agent. Use tools to read/write files. When modifying existing code, STRICTLY use this exact inline diff block format:\n<<<<<<< SEARCH\n[old code exactly as it appears]\n=======\n[new code]\n>>>>>>> REPLACE`
};

if (this.conversationHistory.length === 0) {
  this.conversationHistory.push(systemMessage);   // ← only added once, at conversation start
}
this.conversationHistory.push({
  role: 'user',
  content: `Context:\n${JSON.stringify(context)}\n\nTask: ${userPrompt}`
});
this.trimHistory();
```

### What static context is included:
- **System message**: 2 sentences + diff format instructions (~30 words)
- **Context payload**: `JSON.stringify(context)` — assembled by `ContextRetriever.assemble()` (see below)
- **Tool schemas**: passed as `tools` parameter to `routeRequest` (lines 451-452), NOT in the message array

### The system message is only pushed once (line 428-430)

If the conversation history is loaded from a previous session (not empty), the system message is **never re-added**. This means:
- `PRESERVE_SYSTEM` only helps if `this.conversationHistory` already starts with a system message
- If history is restored without a system message, there's no system prompt at all

---

## 3. ContextRetriever — What "context" Actually Means

**File:** `public/matey-agent.js`, lines 117-192

```javascript
class ContextRetriever {
  static MAX_FILE_LINES = 1000;
  static MAX_TREE_ENTRIES = 500;

  static async assemble(prompt, activeFilePath) {
    let activeFileContext = null;
    if (activeFilePath) {
      try {
        const content = await readFile(activeFilePath);
        const lines = content.split('\n');
        if (lines.length > this.MAX_FILE_LINES) {
          activeFileContext = {
            path: activeFilePath,
            content: lines.slice(0, this.MAX_FILE_LINES).join('\n'),
            lineCount: lines.length,
            truncated: true
          };
        } else {
          activeFileContext = { path: activeFilePath, content };
        }
      } catch (e) { /* File might be new */ }
    }

    const mentions = this.extractMentions(prompt);      // ← BUG: method not defined!
    const filenameHints = this.extractFilenameHints(prompt);  // ← BUG: method not defined!
    const mentionedFilesContext = [];
    const seen = new Set();
    for (const path of mentions) {
      // ... read mentioned files (same 1000-line truncation)
    }
    for (const path of filenameHints) {
      // ... read mentioned files (same 1000-line truncation)
    }

    const files = await listFiles('');
    const workspaceTree = files.slice(0, this.MAX_TREE_ENTRIES).map(f => f.path);

    return {
      activeFileContext,
      mentionedFilesContext,
      workspaceTree,
      truncated: files.length > this.MAX_TREE_ENTRIES ||
        (activeFileContext?.truncated) ||
        mentionedFilesContext.some(f => f.truncated)
    };
  }
}
```

### BUG CONFIRMED: `extractMentions` and `extractFilenameHints` are called but never defined

These methods are called at lines 140-141 but have **no implementation** anywhere in `matey-agent.js` or `matey-agent-bundle.js` (confirmed via grep — only the call sites exist, no definitions). This means `ContextRetriever.assemble()` throws `TypeError: this.extractMentions is not a function` at runtime, which would crash the entire `executeTask()` flow before the first LLM call.

### Context contents per turn:
- **`activeFileContext`**: Full content of the active file (truncated to 1000 lines)
- **`mentionedFilesContext`**: Files whose paths appear in the user prompt (truncated to 1000 lines each)
- **`workspaceTree`**: All file paths in workspace root (up to 500 entries, paths only — no content)
- The entire `context` object is JSON-stringified and stuffed into a single user message (line 433)

---

## 4. File-Structure Awareness — CONFIRMED YES (but with issues)

The Agent **does** receive the workspace file tree via `workspaceTree` in the context payload. `listFiles('')` (line 181) returns all files in the workspace root, and the first 500 entries' paths are sent to the LLM.

**But:** the tree is only a **flat list of paths** — no subdirectories, no file sizes, no modification times, no content preview. The Agent knows filenames exist but must explicitly call `read_file` to see any content.

---

## 5. Token/Size Limits

### Hard cap — line 7:
```javascript
const MAX_TOTAL_TOKENS = 128000;
```

### Enforcement — lines 386-396 (`trimHistory()`)
Called at lines 435, 472, 486, 494. Prunes oldest non-system messages when total exceeds 128k estimated tokens.

### RISK: No model-aware context window detection

The BYOK provider config (`matey-byok-module.js`) stores only `name`, `baseUrl`, `apiKey`, `model`, `capabilities` — **no `context_window` or `max_tokens` field**. `MAX_TOTAL_TOKENS` is hardcoded to 128000 regardless of the actual model being used.

If the user configures a 32k-context model (e.g., `gpt-3.5-turbo-0125`, ~16k context) or a 200k model (e.g., `gpt-4o`), the hard cap is wrong in both directions:
- 128k cap for a 16k-window model → **silent truncation by the provider API**
- 128k cap for a 200k-window model → **wasted 72k tokens**

### RISK: No cap on initial context payload
The initial context message (line 433) can contain:
- Active file: up to 1000 lines (MAX_FILE_LINES)
- Mentioned files: up to 1000 lines each (no count limit)
- Workspace tree: up to 500 file paths

This is pushed to history **before** trimming. If the active file alone is 50k tokens, the system message + context + task may already be near or over the 128k cap before the first LLM call.

### RISK: No cap on tool results
Tool outputs are JSON-stringified and pushed to history with no size limit (lines 469, 485):
```javascript
this.conversationHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
```
`read_file` returns up to 1000 lines. `search_codebase` returns up to 100 results with context lines. Multiple tool calls per step could push token usage past the cap without triggering a trim.

---

## 6. FS Implementation Discrepancy — Two Separate Code Paths

### ContextRetriever uses imported ES module functions (line 1):
```javascript
import { readFile, writeFile, listFiles } from './matey-fs-module.js';
```

`matey-fs-module.js` (Capacitor Filesystem / FSA mode):
- `readFile(filePath)` → returns `res.data` (string)
- `listFiles(subDir)` → returns `[{ path, name, type }]`
- `writeFile(filePath, content)` → no return value
- Uses `WorkspaceManager` (mode: 'sandbox' or 'usb')

### ToolDispatcher uses `window.MateyFS` (lines 293, 306, 321):
```javascript
var fs = window.MateyFS || window.FileSystemManager;
if (fs && typeof fs.readFile === 'function') {
  return await safeToolCall(fs.readFile, [cleanPath]);
}
return await safeToolCall(readFile, [cleanPath]);  // ← falls back to imported module
```

`matey-fs.js` (legacy IIFE, `window.MateyFS`):
- `readFile(path)` → returns `text` (string, line 691)
- `listFiles(path)` → returns `[{ name, kind }]` (line 710: `entries.push({ name: entry.name, kind: entry.kind })`)
- `writeFile(path, content, opts)` → supports `{ force: true }` for atomic writes
- `safeWrite(path, content, opts)` → temp-then-rename (line 804)

### Critical discrepancies:
1. **listFiles return format**: `matey-fs-module.js` returns `{path, name, type}` while `matey-fs.js` returns `{name, kind}`. `ContextRetriever.assemble()` (line 182) expects `.path` — this works with the module import but would break if it fell back to `window.MateyFS` (which only has `.name` and `.kind`).
2. **writeFile signature**: `matey-fs-module.js` `writeFile(filePath, content)` has no `opts` parameter. `matey-fs.js` `writeFile(path, content, opts)` supports `{force: true}`. `ToolDispatcher.write_file` (line 308) calls `fs.safeWrite(cleanPath, content, {force: true})` when using `window.MateyFS` but falls back to `safeToolCall(writeFile, [cleanPath, args.content])` (no force option) with the module import.
3. **readFile error messages**: Both throw `'File not found: ' + path`, but `matey-fs.js` throws `'Permission denied for file: ' + path` while `matey-fs-module.js` would throw FSA exceptions or Capacitor errors with different message text.

---

## 6. Exact Line References

| What | File | Lines |
|------|------|-------|
| Token constants (`MAX_TOTAL_TOKENS = 128000`) | `matey-agent.js` | 5-8 |
| `estimateTokenCount()` (word-count heuristic) | `matey-agent.js` | 10-15 |
| `estimateMessageTokens()` | `matey-agent.js` | 17-34 |
| `countConversationTokens()` | `matey-agent.js` | 36-40 |
| `pruneHistoryByTokens()` | `matey-agent.js` | 42-64 |
| `ContextRetriever` class (assemble, mentions, tree) | `matey-agent.js` | 117-192 |
| `extractMentions` CALL (no definition exists) | `matey-agent.js` | 140 |
| `extractFilenameHints` CALL (no definition exists) | `matey-agent.js` | 141 |
| `listFiles('')` call for workspace tree | `matey-agent.js` | 181 |
| `classifyError()` | `matey-agent.js` | 199-224 |
| `safeToolCall()` | `matey-agent.js` | 235-268 |
| `sanitizePath()` | `matey-agent.js` | 270-282 |
| `ToolDispatcher.read_file` handler | `matey-agent.js` | 288-298 |
| `ToolDispatcher.write_file` handler | `matey-agent.js` | 301-313 |
| `ToolDispatcher.list_workspace_files` handler | `matey-agent.js` | 316-327 |
| `ToolDispatcher.search_codebase` handler | `matey-agent.js` | 329-360 |
| `AgentOrchestrator` constructor (history, maxContextTokens) | `matey-agent.js` | 372-380 |
| `trimHistory()` | `matey-agent.js` | 386-396 |
| `executeTask()` main loop | `matey-agent.js` | 398-535 |
| `MAX_TOTAL_TOKENS` hardcoded (no model awareness) | `matey-agent.js` | 7 |
| `this.conversationHistory` sent directly to `routeRequest` | `matey-agent.js` | 451 |
| System prompt construction | `matey-agent.js` | 423-426 |
| User prompt with context JSON (pushed before trim) | `matey-agent.js` | 431-434 |
| trimHistory calls | `matey-agent.js` | 435, 472, 486, 494 |
| Tool results pushed (no size cap) — success | `matey-agent.js` | 469 |
| Tool results pushed (no size cap) — error | `matey-agent.js` | 485 |
| `MAX_STEPS = 7` | `matey-agent.js` | 375 |
| `this.MAX_STEPS` cap message | `matey-agent.js` | 526-531 |
| Exports (includes `estimateTokenCount`, `pruneHistoryByTokens`) | `matey-agent.js` | 538 |

## Summary of Confirmed Bugs/Issues

1. **CRITICAL**: `extractMentions()` and `extractFilenameHints()` are called (lines 140-141) but never defined — `ContextRetriever.assemble()` crashes with `TypeError`
2. **CRITICAL**: Hardcoded `MAX_TOTAL_TOKENS = 128000` (line 7) — no model-aware context window detection from BYOK provider config
3. **HIGH**: No cap on initial context payload before it enters history (system + context + task pushed at once on lines 428-434, trim only after at line 435)
4. **HIGH**: No cap on tool result sizes pushed into history (lines 469, 485)
5. **HIGH**: Token estimation uses word-count heuristic (×1.3), not a real tokenizer — `gpt-tokenizer` or `tiktoken` not installed
6. **HIGH**: System message only added once at conversation start (line 428-430) — if history is restored without one, no system prompt is ever added
7. **HIGH**: Task/context message can be pruned by `trimHistory()` — no protection for the initial task
8. **MEDIUM**: Two separate FS implementations (`matey-fs-module.js` ES module import vs `window.MateyFS` IIFE) with different return formats for `listFiles` (`{path,name,type}` vs `{name,kind}`) and different `writeFile` signatures (no opts vs `{force:true}`)
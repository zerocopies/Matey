import { readFile, writeFile, listFiles } from './matey-fs-module.js';
import { routeRequest } from './matey-byok-module.js'; // <-- Use the existing BYOK capability router instead of hardcoded OpenAI
import { mateyCoach } from './matey-coach.js'; // <-- App-wide Prompt Coach

class HarnessLogger {
  static log(step, action, details) {
    const timestamp = new Date().toISOString().split('T')[1];
    console.log(`[Agent Harness | ${timestamp}] STEP ${step}: ${action}`, details || '');
  }
  static error(step, action, error) {
    console.error(`[Agent Harness | STEP ${step}] ERROR in ${action}:`, error);
  }
}

// Toast helper — replaces alert(), matches app's design system (#0D0D0D bg, #2A2A2A border, #B583FC accent)
class AgentToast {
  static show(message, isError = false) {
    let el = document.getElementById('agent-toast');
    if (!el) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="agent-toast" style="position:fixed; bottom:90px; left:16px; right:16px; background:#0D0D0D; border:1px solid ${isError ? '#E85D5D' : '#2A2A2A'}; border-radius:16px; padding:14px 16px; color:#FFFFFF; font-size:14px; z-index:10000; transform:translateY(150%); transition:transform 0.4s ease; box-shadow:0 10px 30px rgba(0,0,0,0.5);"></div>
      `);
      el = document.getElementById('agent-toast');
    }
    el.style.borderColor = isError ? '#E85D5D' : '#2A2A2A';
    el.innerText = message;
    el.style.transform = 'translateY(0)';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.transform = 'translateY(150%)'; }, 6000);
  }
}

// Live progress indicator — shows step-by-step status in the chat UI instead of silence
class AgentProgress {
  static update(stepText) {
    let el = document.getElementById('agent-progress');
    if (!el) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="agent-progress" style="position:fixed; top:70px; left:16px; right:16px; background:#0D0D0D; border:1px solid #2A2A2A; border-radius:12px; padding:8px 14px; color:#B3B3B3; font-size:12px; z-index:9999; display:none; align-items:center; gap:8px;">
          <span class="agent-spinner" style="width:10px; height:10px; border:2px solid #B583FC; border-top-color:transparent; border-radius:50%; display:inline-block; animation:agent-spin 0.8s linear infinite;"></span>
          <span id="agent-progress-text"></span>
        </div>
        <style>@keyframes agent-spin { to { transform: rotate(360deg); } }</style>
      `);
      el = document.getElementById('agent-progress');
    }
    document.getElementById('agent-progress-text').innerText = stepText;
    el.style.display = 'flex';
  }
  static hide() {
    const el = document.getElementById('agent-progress');
    if (el) el.style.display = 'none';
  }
}

class ContextRetriever {
  static extractMentions(prompt) {
    const matches = [];
    const regex = /@([a-zA-Z0-9_\-\.\/]+)/g;
    let match;
    while ((match = regex.exec(prompt)) !== null) matches.push(match[1]);
    return matches;
  }

  static extractFilenameHints(prompt) {
    const hints = [];
    const tokens = prompt.match(/[a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+/g) || [];
    for (const t of tokens) {
      const lower = t.toLowerCase();
      if (/\.(js|ts|jsx|tsx|html|css|json|md|py|go|rs|java|cpp|c|h|sh|yaml|yml)$/i.test(lower)) {
        hints.push(t);
      }
    }
    return [...new Set(hints)];
  }

  static async assemble(prompt, activeFilePath) {
    let activeFileContext = null;
    if (activeFilePath) {
      try { activeFileContext = { path: activeFilePath, content: await readFile(activeFilePath) }; }
      catch (e) { /* File might be new */ }
    }

    const mentions = this.extractMentions(prompt);
    const filenameHints = this.extractFilenameHints(prompt);
    const mentionedFilesContext = [];
    const seen = new Set();
    for (const path of mentions) {
      if (seen.has(path)) continue;
      seen.add(path);
      try { mentionedFilesContext.push({ path, content: await readFile(path) }); }
      catch (e) { console.warn(`Could not read mentioned file: ${path}`); }
    }
    for (const path of filenameHints) {
      if (seen.has(path)) continue;
      seen.add(path);
      try { mentionedFilesContext.push({ path, content: await readFile(path) }); }
      catch (e) { /* File might not exist in workspace */ }
    }

    // Cap workspace tree size so search_codebase/context stays fast on larger workspaces
    const files = await listFiles('');
    const MAX_TREE_ENTRIES = 500;
    const workspaceTree = files.slice(0, MAX_TREE_ENTRIES).map(f => f.path);

    return { activeFileContext, mentionedFilesContext, workspaceTree, truncated: files.length > MAX_TREE_ENTRIES };
  }
}

class ToolDispatcher {
  constructor() {
    this.registry = new Map();

    this.registry.set('read_file', {
      schema: { name: 'read_file', description: 'Read the contents of a specific file.',
        parameters: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } },
      handler: async (args) => await readFile(args.filePath)
    });

    this.registry.set('write_file', {
      schema: { name: 'write_file', description: 'Create a new file or completely overwrite an existing file.',
        parameters: { type: 'object', properties: { filePath: { type: 'string' }, content: { type: 'string' } }, required: ['filePath', 'content'] } },
      handler: async (args) => { await writeFile(args.filePath, args.content); return { success: true }; }
    });

    this.registry.set('list_workspace_files', {
      schema: { name: 'list_workspace_files', description: 'List all files and folders in a given directory path.',
        parameters: { type: 'object', properties: { subDir: { type: 'string' } } } },
      handler: async (args) => await listFiles(args.subDir || '')
    });

    this.registry.set('search_codebase', {
      schema: { name: 'search_codebase', description: 'Search the entire workspace for a specific text string or function name.',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      handler: async (args) => {
        const files = await listFiles('');
        const results = [];
        const MAX_RESULTS = 100;
        for (const file of files) {
          if (results.length >= MAX_RESULTS) break;
          if (file.type !== 'directory') {
            try {
              const lines = (await readFile(file.path)).split('\n');
              lines.forEach((text, idx) => {
                if (results.length < MAX_RESULTS && text.toLowerCase().includes(args.query.toLowerCase())) {
                  results.push({ file: file.path, line: idx + 1, text: text.trim() });
                }
              });
            } catch (e) { /* Skip unreadable files */ }
          }
        }
        return results;
      }
    });
  }

  getSchemas() {
    return Array.from(this.registry.values()).map(t => ({ type: 'function', function: t.schema }));
  }

  async dispatch(name, args) {
    return await this.registry.get(name).handler(args);
  }
}

export class AgentOrchestrator {
  constructor() {
    this.dispatcher = new ToolDispatcher();
    this.MAX_STEPS = 7;
    this.FETCH_TIMEOUT_MS = 30000;
    this.conversationHistory = []; // Cross-turn memory — persists across executeTask() calls
    this.MAX_HISTORY_MESSAGES = 20; // Prevent unbounded context growth
    this.lastReply = ''; // Track last AI response for Stage 5 feedback detection
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  trimHistory() {
    if (this.conversationHistory.length > this.MAX_HISTORY_MESSAGES) {
      // Keep the system-relevant recent tail; drop oldest first
      this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY_MESSAGES);
    }
  }

  async executeTask(userPrompt, activeFilePath, onDiff) {
    mateyCoach.evaluate(userPrompt, { previousReply: this.lastReply }); // non-blocking, app-wide prompt coaching
    HarnessLogger.log(0, 'INIT', `Starting task: "${userPrompt}"`);
    AgentProgress.update('Reading context…');

    const context = await ContextRetriever.assemble(userPrompt, activeFilePath);

    const systemMessage = {
      role: 'system',
      content: `You are Matey's coding agent. Use tools to read/write files. When modifying existing code, STRICTLY use this exact inline diff block format:\n<<<<<<< SEARCH\n[old code exactly as it appears]\n=======\n[new code]\n>>>>>>> REPLACE`
    };

    // Cross-turn memory: reuse prior conversation, append new turn
    if (this.conversationHistory.length === 0) {
      this.conversationHistory.push(systemMessage);
    }
    this.conversationHistory.push({
      role: 'user',
      content: `Context:\n${JSON.stringify(context)}\n\nTask: ${userPrompt}`
    });
    this.trimHistory();

    let stepCount = 0;
    let loop = true;
    let finalReplyText = '';

    while (loop && stepCount < this.MAX_STEPS) {
      stepCount++;
      HarnessLogger.log(stepCount, 'THINKING', 'Waiting for model response...');
      AgentProgress.update(`Step ${stepCount} of ${this.MAX_STEPS}: thinking…`);

      try {
        // Route through the existing BYOK capability router — NOT a hardcoded provider/model
        const choice = await Promise.race([
          routeRequest({
            capability: 'text-gen',
            messages: this.conversationHistory,
            tools: this.dispatcher.getSchemas(),
            toolChoice: 'auto',
            timeoutMs: this.FETCH_TIMEOUT_MS,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Request timed out after ${this.FETCH_TIMEOUT_MS}ms`)), this.FETCH_TIMEOUT_MS)
          )
        ]);

        if (choice.tool_calls?.length > 0) {
          this.conversationHistory.push(choice);
          for (const call of choice.tool_calls) {
            AgentProgress.update(`Step ${stepCount}: running ${call.function.name}…`);
            HarnessLogger.log(stepCount, 'TOOL_CALL', `Executing: ${call.function.name}`);
            try {
              const args = JSON.parse(call.function.arguments);
              const result = await this.dispatcher.dispatch(call.function.name, args);
              this.conversationHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
              HarnessLogger.log(stepCount, 'TOOL_SUCCESS', `Tool ${call.function.name} completed.`);
            } catch (err) {
              HarnessLogger.error(stepCount, 'TOOL_FAILED', err.message);
              this.conversationHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: err.message, instruction: 'Fix arguments and try again.' }) });
            }
          }
        } else {
          AgentProgress.update('Finalizing response…');
          HarnessLogger.log(stepCount, 'PARSING_DIFF', 'Scanning for Search/Replace blocks');
          finalReplyText = choice.content || '';
          this.conversationHistory.push({ role: 'assistant', content: finalReplyText });
          this.trimHistory();

          const regex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
          let match;
          let foundDiff = false;
          while ((match = regex.exec(finalReplyText)) !== null) {
            foundDiff = true;
            if (onDiff) onDiff({ search: match[1], replace: match[2] });
          }
          if (!foundDiff) HarnessLogger.log(stepCount, 'NO_DIFF', 'Agent responded with text but no code changes.');
          this.lastReply = finalReplyText; // Track for Stage 5 feedback detection
          loop = false;
          HarnessLogger.log(stepCount, 'DONE', 'Task finished.');
        }
      } catch (networkError) {
        HarnessLogger.error(stepCount, 'NETWORK_OR_TIMEOUT', networkError);
        const errMsg = networkError?.message || networkError?.toString() || String(networkError);
        let toastMsg = errMsg;
        if (errMsg.indexOf('401') !== -1 || errMsg.toLowerCase().indexOf('authentication') !== -1 || errMsg.toLowerCase().indexOf('invalid api key') !== -1) {
          toastMsg = 'Authentication failed (401): Invalid API key. Check your provider key in Settings → BYOK Models.';
        } else if (errMsg.indexOf('timeout') !== -1) {
          toastMsg = 'Request timed out. The model may be busy — try again, or check your provider URL.';
        } else if (errMsg.indexOf('fetch') !== -1 || errMsg.toLowerCase().indexOf('network') !== -1 || errMsg.toLowerCase().indexOf('ECONN') !== -1) {
          toastMsg = 'Network error: failed to reach the provider. Check your connection and API URL.';
        }
        AgentToast.show(toastMsg, true);
        this.conversationHistory.push({ role: 'assistant', content: toastMsg });
        finalReplyText = toastMsg;
        loop = false;
      }
    }

    if (stepCount >= this.MAX_STEPS) {
      HarnessLogger.error(stepCount, 'MAX_STEPS_REACHED', 'Loop forcefully terminated to prevent runaway execution.');
      AgentToast.show('Reached the max number of steps and stopped safely.', true);
    }

    AgentProgress.hide();
    return finalReplyText;
  }
}

export { HarnessLogger, AgentToast, AgentProgress, ContextRetriever, ToolDispatcher };

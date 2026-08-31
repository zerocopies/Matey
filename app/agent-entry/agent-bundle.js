/* Entry point for Vite bundling of agent modules
 * This file imports all ES module dependencies, sets them as window globals
 * for use by non-module scripts, and initializes the IDE
 */
import { WorkspaceManager, readFile, writeFile, listFiles, openSingleFile } from '../public/matey-fs-module.js';
import { diffField, addDiffEffect, clearDiffEffect } from '../public/matey-diff.js';
import { AgentOrchestrator, ContextRetriever, ToolDispatcher, ToolError, HarnessLogger, AgentToast, AgentProgress, safeToolCall, classifyError, sanitizePath, estimateTokenCount, pruneHistoryByTokens, DEFAULT_MODEL_CONTEXT_WINDOW, getModelContextWindow } from '../public/matey-agent.js';
import { routeRequest } from '../public/matey-byok-module.js';
import { mateyCoach, MateyCoach } from '../public/matey-coach.js';
import { MateyIDE } from '../public/matey-ide.js';
import { CommandPalette } from '../public/matey-cmd.js';

window.MateyAgent = { AgentOrchestrator, ContextRetriever, ToolDispatcher, ToolError, HarnessLogger, AgentToast, AgentProgress, safeToolCall, classifyError, sanitizePath, estimateTokenCount, pruneHistoryByTokens, DEFAULT_MODEL_CONTEXT_WINDOW, getModelContextWindow };
window.MateyDiff = { diffField, addDiffEffect, clearDiffEffect };
window.MateyIDE = MateyIDE;
window.CommandPalette = CommandPalette;
window.MateyWorkspaceManager = WorkspaceManager;
window.MateyByokRouter = { routeRequest };
window.mateyCoach = mateyCoach;

// Re-export for direct module consumption
export {
  WorkspaceManager,
  readFile,
  writeFile,
  listFiles,
  diffField,
  addDiffEffect,
  clearDiffEffect,
  AgentOrchestrator,
  ContextRetriever,
  ToolDispatcher,
  ToolError,
  HarnessLogger,
  AgentToast,
  AgentProgress,
   safeToolCall,
   classifyError,
   sanitizePath,
   estimateTokenCount,
    pruneHistoryByTokens,
    DEFAULT_MODEL_CONTEXT_WINDOW,
    getModelContextWindow,
    routeRequest,
  mateyCoach,
  MateyCoach,
  MateyIDE,
  CommandPalette
};

/* MateyByokModule — ES Module interface for the Agent IDE
 * Provides routeRequest that routes through the existing BYOK provider system
 * Uses CapacitorHttp (via nativeFetch) to bypass CORS on device
 * Supports both OpenAI-compatible APIs and native Gemini API
 * The existing matey-byok.js IIFE (loaded via <script> tag) provides the legacy window.MateyByok global
 * This module provides the ES module interface used by matey-agent.js
 *
 * All routing logic now lives in matey-api-router.js — this file re-exports.
 */

export { routeRequest, classifyTask, getHealthScore, getProviderLatency, resolveModel, nativeFetch, buildApiUrl, load, save, migrateLegacyProviders, maskKey, getProvider } from './matey-api-router.js';

/* A re-export does NOT bind the name locally — import it explicitly so the
   call below resolves. Without this, every load logged
   "[BYOK] Migration failed: ReferenceError: migrateLegacyProviders is not defined". */
import { migrateLegacyProviders as _migrateLegacyProviders } from './matey-api-router.js';

/* Auto-migrate legacy provider keys on module load */
try { _migrateLegacyProviders(); } catch (e) { console.warn('[BYOK] Migration failed:', e); }
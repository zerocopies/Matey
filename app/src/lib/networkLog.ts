/* Matey Network Activity Log — Part A: Transparency Log
 * Logs every outbound URL the app's own code calls.
 * Real hostnames only, honest scope (not packet-level inspection).
 * Viewable in Settings → Privacy → Network Activity.
 * Data persists across sessions via localStorage.
 */
const LOG_KEY = 'matey_network_log';
const MAX_ENTRIES = 200;

// Strip protocol and path, keep only the hostname for privacy
function normalizeHostname(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}

// Entry shape for persistence
interface LogEntry {
  timestamp: number;
  hostname: string;
  url: string;
}

// Read the current log from localStorage
function readLog(): LogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Validate shape and limit entries
    return parsed
      .filter((e: any) => e.hostname && e.url)
      .slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

// Write the log to localStorage
function writeLog(entries: LogEntry[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries));
  } catch {
    /* persistence failed — silent degradation */
  }
}

// Add a single entry to the log
export function logOutboundUrl(url: string): void {
  const hostname = normalizeHostname(url);
  const entry: LogEntry = {
    timestamp: Date.now(),
    hostname,
    url,
  };
  const current = readLog();
  current.push(entry);
  writeLog(current);
}

// Export the log reader for the Settings screen
export function getNetworkLog(): LogEntry[] {
  return readLog();
}

// Export the logger clearer for the Settings screen
export function clearNetworkLog(): void {
  writeLog([]);
}
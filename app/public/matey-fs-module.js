/* MateyFS — ES Module interface for the Agent IDE
 * Provides dual-mode storage (sandbox + USB SAF) using @capacitor/filesystem
 * This module is the single source of truth for Capacitor Filesystem logic.
 * The minified bundle previously embedded this logic inline (qi, Kf, ra, mt).
 * It is now extracted here so both matey-agent.js (source) and the bundle
 * reference the same code path.
 */
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export const WorkspaceManager = {
  mode: 'sandbox',
  usbRootUri: null,

  async mountUSB() {
    try {
      if (!window.CapacitorSAF) throw new Error("SAF Bridge not found.");
      const result = await window.CapacitorSAF.pickDirectory();
      if (result && result.uri) {
        this.usbRootUri = result.uri;
        this.mode = 'usb';
        console.log(`USB Mounted: ${this.usbRootUri}`);
        return true;
      }
    } catch (e) {
      console.error("USB Mount Failed:", e);
      return false;
    }
  },

  mountSandbox() {
    this.mode = 'sandbox';
    this.usbRootUri = null;
  }
};

async function ensureSandboxDir() {
  try {
    await Filesystem.stat({ path: 'workspace', directory: Directory.Data });
  } catch (e) {
    await Filesystem.mkdir({ path: 'workspace', directory: Directory.Data, recursive: true });
  }
}

export async function readFile(filePath) {
  if (WorkspaceManager.mode === 'usb' && WorkspaceManager.usbRootUri) {
    try {
      const res = await window.CapacitorSAF.readFile({ rootUri: WorkspaceManager.usbRootUri, path: filePath });
      return res.data;
    } catch (e) { /* fall through to sandbox/bundled file read */ }
  }
  await ensureSandboxDir();
  try {
    const res = await Filesystem.readFile({ path: `workspace/${filePath}`, directory: Directory.Data, encoding: Encoding.UTF8 });
    return res.data;
  } catch (e) {
    // File not in workspace — try reading as a bundled public asset via HTTP
    try {
      const res = await fetch('./' + filePath);
      if (res.ok) return await res.text();
    } catch (fetchErr) {
      // Not a bundled file either
    }
    throw new Error('File not found: ' + filePath);
  }
}

export async function writeFile(filePath, content) {
  if (WorkspaceManager.mode === 'usb' && WorkspaceManager.usbRootUri) {
    await window.CapacitorSAF.writeFile({ rootUri: WorkspaceManager.usbRootUri, path: filePath, data: content });
  } else {
    await ensureSandboxDir();
    await Filesystem.writeFile({ path: `workspace/${filePath}`, data: content, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  }
}

export async function listFiles(subDir = '') {
  if (WorkspaceManager.mode === 'usb' && WorkspaceManager.usbRootUri) {
    const res = await window.CapacitorSAF.listDirectory({ rootUri: WorkspaceManager.usbRootUri, path: subDir });
    return res.files.map(f => ({ path: f.path, name: f.name, type: f.type }));
  }
  await ensureSandboxDir();
  const searchPath = subDir ? `workspace/${subDir}` : 'workspace';
  try {
    const res = await Filesystem.readdir({ path: searchPath, directory: Directory.Data });
    return res.files.map(f => ({ path: `${subDir ? subDir + '/' : ''}${f.name}`, name: f.name, type: f.type === 'directory' ? 'directory' : 'file' }));
  } catch (e) {
    return [];
  }
}

async function openSingleFile() {
  const result = await FilePicker.pickFile();
  if (result?.uri) {
    const content = await FilePicker.readFile({ uri: result.uri });
    window.mateyIDE.setContent(content);
    localStorage.setItem('matey_last_file_uri', result.uri);
    return content;
  }
}

export { WorkspaceManager as mt, readFile as qi, writeFile as Kf, listFiles as ra, openSingleFile as openSingleFile };

/* ==================== Task-Level Workspace Snapshot & Rollback ==================== */
const _taskSnapshots = new Map();

async function _readFileSafe(filePath) {
  try { return await readFile(filePath); }
  catch (e) { return null; }
}

async function _fileExists(filePath) {
  try { await readFile(filePath); return true; }
  catch (e) { return false; }
}

async function _deleteFile(filePath) {
  try {
    if (WorkspaceManager.mode === 'usb' && WorkspaceManager.usbRootUri) {
      if (window.CapacitorSAF && typeof window.CapacitorSAF.deleteFile === 'function') {
        await window.CapacitorSAF.deleteFile({ rootUri: WorkspaceManager.usbRootUri, path: filePath });
        return;
      }
    }
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({ path: `workspace/${filePath}`, directory: Directory.Data });
  } catch (e) { /* file may not exist */ }
}

export async function createTaskSnapshot(taskId, targetFiles) {
  if (!taskId || !targetFiles || !targetFiles.length) return null;
  var snapshot = { taskId, timestamp: Date.now(), files: [], createdFiles: [] };
  for (var i = 0; i < targetFiles.length; i++) {
    var fp = targetFiles[i];
    var existed = await _fileExists(fp);
    if (existed) {
      var content = await _readFileSafe(fp);
      snapshot.files.push({ path: fp, content: content });
    } else {
      snapshot.createdFiles.push(fp);
    }
  }
  _taskSnapshots.set(taskId, snapshot);
  try { localStorage.setItem('matey_snapshot_' + taskId, JSON.stringify(snapshot)); } catch (e) {}
  return snapshot;
}

export async function rollbackTask(taskId) {
  if (!taskId) return false;
  var snapshot = _taskSnapshots.get(taskId);
  if (!snapshot) {
    try {
      var raw = localStorage.getItem('matey_snapshot_' + taskId);
      if (raw) snapshot = JSON.parse(raw);
    } catch (e) {}
  }
  if (!snapshot) return false;
  for (var i = 0; i < snapshot.files.length; i++) {
    var f = snapshot.files[i];
    await writeFile(f.path, f.content);
  }
  for (var j = 0; j < snapshot.createdFiles.length; j++) {
    await _deleteFile(snapshot.createdFiles[j]);
  }
  _taskSnapshots.delete(taskId);
  try { localStorage.removeItem('matey_snapshot_' + taskId); } catch (e) {}
  return true;
}

export function getTaskSnapshot(taskId) {
  return _taskSnapshots.get(taskId) || null;
}

export function clearAllSnapshots() {
  _taskSnapshots.clear();
}
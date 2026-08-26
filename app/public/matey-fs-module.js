/* MateyFileSystem — ES Module interface for the Agent IDE
 * Provides dual-mode storage (sandbox + USB SAF) using @capacitor/filesystem
 * The existing MateyFS IIFE (loaded via <script> tag) provides the legacy window.MateyFS global
 * This module provides the ES module interface used by matey-agent.js, matey-ide.js
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
  // Try workspace (user files from USB or sandbox writes) first
  if (WorkspaceManager.mode === 'usb' && WorkspaceManager.usbRootUri) {
    try {
      const res = await window.CapacitorSAF.readFile({ rootUri: WorkspaceManager.usbRootUri, path: filePath });
      return res.data;
    } catch (e) { /* fall through to bundled file read */ }
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

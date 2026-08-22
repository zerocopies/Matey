# Matey File System Integration

## Overview

The File System Access API (FSA) integration module (`matey-fs.js`) provides secure, sandboxed access to local storage for Matey's AI agent. It supports two primary workflows:

1. **Named Workspaces**: Multiple user-designated local folders, each with a custom name (e.g., "Personal," "Work"). The agent operates only within whichever workspace is currently active.
2. **Direct USB Drive (OTG)**: File manipulation on external USB storage via USB-C OTG, treated as an additional directory handle.

## Security Architecture

### Hard Boundary Enforcement

All file operations are strictly scoped to the active workspace directory handle. Path traversal is blocked at the code level:

```javascript
// ❌ Blocked — throws "Path traversal blocked"
await MateyFS.readFile('../../etc/passwd');
await MateyFS.readFile('/etc/passwd');

// ✅ Allowed — resolved relative to workspace root
await MateyFS.readFile('documents/notes.md');
```

The `sanitizePath()` function normalizes all paths and rejects any containing `..` components before they reach the filesystem.

### Permission Health Checks

Permissions are verified at three levels:
1. **On every app launch**: `verifyAndRestore()` checks the last workspace's permission and prompts for reselection if revoked
2. **Before every agent action**: `requireWorkspace()` runs `queryPermission({ mode: 'readwrite' })` before any file operation
3. **Before batch operations**: Each file operation re-verifies permission internally

The File System Access API (Chromium) can silently downgrade folder access after OS updates, browser updates, or if the folder is moved/renamed. This check runs at every launch and before every agent action to catch this immediately.

## Quick Start

```javascript
// Check if FSA is supported
if (MateyFS.supports()) {
  // Restore last workspace on launch
  var ws = await MateyFS.verifyAndRestore();
  if (!ws || !ws.ok) {
    // First time: prompt user to select a folder
    var result = await MateyFS.selectWorkspace('Matey Workspace');
    if (result.ok) {
      await MateyFS.switchWorkspace(result.name);
    }
  }
} else {
  // Fallback: standard <input type="file">
  MateyFS.triggerFallbackPicker();
}
```

## API Reference

### Capability Detection

```javascript
// Check if File System Access API is available
if (MateyFS.supports()) {
  // Full folder access
} else {
  // Use fallback <input type="file" webkitdirectory>
  var input = MateyFS.createFallbackInput({ directory: true, multiple: true });
  input.onchange = function(e) {
    MateyFS.handleFallbackFiles(input, callback);
  };
  input.click();
}
```

### Workspace Management (Multiple Named Workspaces)

```javascript
// Select/create a named workspace (prompts user via showDirectoryPicker)
var result = await MateyFS.selectWorkspace('Personal');
// result: { ok: true, name: 'Personal', type: 'workspace' }

// Connect to a USB drive (OTG)
var result = await MateyFS.selectUSBMount();
// result: { ok: true, name: 'USB_DRIVE', type: 'usb' }

// Switch to a different named workspace
var result = await MateyFS.switchWorkspace('Work');
// If permission revoked: { ok: false, error: 'permission_denied', needs_reselection: true }

// List all configured workspaces
var workspaces = await MateyFS.listWorkspaces();
// [{ name: 'Personal', type: 'workspace' }, { name: 'USB_DRIVE', type: 'usb' }]

// Delete a named workspace
await MateyFS.deleteWorkspace('Personal');

// Restore last-used workspace on app restart (with permission check)
var ws = await MateyFS.verifyAndRestore();
// ws: { ok: true, name: 'Personal' } or null

// Clear current workspace
await MateyFS.clearCachedWorkspace();

// Get current workspace
var ws = MateyFS.getCurrentWorkspace();
// { name: 'Personal', handle: FileSystemDirectoryHandle, type: 'workspace' }
```

### Permission Verification

```javascript
// Verify read or read-write permission (before batch operations or agent actions)
var granted = await MateyFS.verifyPermission(fileHandle, readWrite);
var granted = await MateyFS.verifyDirectoryPermission(dirHandle, readWrite);

// Lightweight health check on launch
var ws = await MateyFS.verifyAndRestore(); // Checks + restores if needed

// Force workspace requirement (throws if no permission)
await MateyFS.requireWorkspace(); // Throws if permission revoked
```

### File Operations (Scoped to Active Workspace)

All operations are scoped to the active workspace's directory handle. Paths are relative to the workspace root.

```javascript
// Create a subfolder
await MateyFS.createSubfolder('logs', 'batch-analysis');
// Creates: <workspace>/logs/batch-analysis/

// Write a file (text)
await MateyFS.writeFile('summaries/notes.md', '# Summary\nContent here');

// Write a file (base64 encoded binary)
await MateyFS.writeFile('images/icon.png', base64Data, { isBase64: true });

// Dry-run mode (preview without writing)
await MateyFS.writeFile('test.txt', 'Hello', { dryRun: true });
// Returns: { dryRun: true, path: 'test.txt', bytes: 5 }

// Force write without confirmation
await MateyFS.writeFile('overwrite.txt', 'New content', { force: true });

// Read a file (text)
var content = await MateyFS.readFile('README.md');

// Read a file (base64 data URL)
var dataUrl = await MateyFS.readFileAsBase64('images/photo.jpg');

// List files in a directory
var entries = await MateyFS.listFiles(''); // root of workspace
// entries: [{ name: "file.txt", kind: "file" }, { name: "subdir", kind: "directory" }]

// Check if file exists
var exists = await MateyFS.fileExists('config.json');

// Delete a file (with confirmation by default)
await MateyFS.deleteFile('temp/old.txt');

// Force delete without confirmation
await MateyFS.deleteFile('temp/old.txt', { force: true });

// Copy a file
await MateyFS.copyFile('source.txt', 'dest/copy.txt');

// Move/rename a file
await MateyFS.moveFile('old/name.txt', 'new/name.txt');

// Safe write (temp file + atomic rename — ideal for USB/OTG)
await MateyFS.safeWrite('important.txt', 'content');

// List all files recursively
var allFiles = await MateyFS.listAllFiles();
```

### Destructive-Action Confirmation

Before overwriting or deleting files, the API shows a one-tap confirmation dialog (unless `{ force: true }` is passed). The dialog shows a preview of the content being written or the file being deleted.

```javascript
// Custom confirmation handler
MateyFS.setConfirmHandler(function(action, path, preview) {
  // Return true to proceed, false to cancel
  // Or implement your own UI
  return window.confirm(action === 'delete' 
    ? `Delete ${path}?` 
    : `Overwrite ${path}?`);
});

// Disable confirmations programmatically
MateyFS.enableConfirmations(false);
```

### Activity Log

The API maintains a running log of all agent file actions. Each entry includes:
- Action type (`create`, `read`, `modify`, `delete`, `copy`, `move`, `dry_run`, `error`, `permission_denied`)
- File path
- Timestamp
- Byte count (where applicable)

```javascript
// Log an action manually
MateyFS.logActivity('create', 'new_file.txt', 'Created 42 bytes');

// Get current log (in-memory)
var log = MateyFS.getActivityLog();
// [{ timestamp: 1234567890, action: 'create', path: 'new_file.txt', details: 'Created 42 bytes', workspace: 'Personal' }]

// Load full log from IndexedDB
var fullLog = await MateyFS.loadActivityLog();

// Clear activity log
MateyFS.clearActivityLog();

// Listen for log changes
var unsubscribe = MateyFS.onFSChange(function(type, data) {
  if (type === 'log') console.log('New log entry:', data);
});
```

### UI Integration

The module automatically injects UI elements:

- **Workspace display**: Shows the active workspace folder name in the header
- **Activity log button**: Collapsible panel showing recent file actions (bottom-right)
- **Confirmation dialog**: Modal overlay for destructive actions
- **Workspace selector**: Dropdown for switching between named workspaces

```javascript
// Manually refresh UI after programmatic changes
MateyFS.updateDisplay('My Workspace');
MateyFS.injectActivityLogUI();
MateyFS.injectConfirmDialog();
```

### Fallback for Unsupported Browsers

For browsers/WebViews that don't support the File System Access API:

```javascript
// Trigger a file/directory picker
var result = MateyFS.triggerFallbackPicker();

// Listen for selected files
var unsub = MateyFS.onFSChange(function(type, data) {
  if (type === 'fallbackFiles') {
    // data is an array of { name, path, content, size, type }
    data.forEach(function(file) {
      console.log('File:', file.path, file.size, 'bytes');
    });
  }
});
```

## Agent Action Handlers

### Example 1: Create a Subfolder and Write Analysis Results

```javascript
async function agentBatchAnalysis(sourceFiles) {
  var workspace = MateyFS.getCurrentWorkspace();
  if (!workspace) {
    var result = await MateyFS.selectWorkspace('Default Workspace');
    if (!result.ok) throw new Error('No workspace');
    await MateyFS.switchWorkspace(result.name);
  }

  // Create a timestamped batch folder
  var timestamp = new Date().toISOString().slice(0, 10).replace(/:/g, '-');
  var batchDir = 'batch-' + timestamp;
  await MateyFS.createSubfolder('', batchDir);

  // Process each source file and write results
  for (var i = 0; i < sourceFiles.length; i++) {
    var content = await MateyFS.readFile(sourceFiles[i]);
    var analysis = await analyzeWithAI(content);
    await MateyFS.writeFile(
      batchDir + '/' + sourceFiles[i] + '.analysis.md',
      analysis
    );
  }

  // Write a summary index
  await MateyFS.writeFile(
    batchDir + '/_summary.md',
    '# Batch Analysis Summary\nProcessed ' + sourceFiles.length + ' files.'
  );

  return batchDir;
}
```

### Example 2: Read Source Code from USB and Stream Modifications

```javascript
async function agentUSBSync() {
  // Ensure USB is connected
  var usb = await MateyFS.verifyAndRestore();
  if (!usb || usb.ok) {
    // Already connected
  } else {
    var result = await MateyFS.selectUSBMount();
    if (!result.ok) throw new Error('USB not connected');
    await MateyFS.switchWorkspace(result.name);
  }

  // Scan for source files
  var allFiles = await MateyFS.listAllFiles();
  var sourceFiles = allFiles.filter(function(f) {
    return f.match(/\.(js|ts|jsx|tsx|py|go|rs)$/);
  });

  // Process each file with safe writes (temp + rename)
  for (var file of sourceFiles) {
    try {
      var content = await MateyFS.readFile(file);
      var modified = optimizeImports(content);
      await MateyFS.safeWrite(file, modified); // Safe write protects against USB disconnect
    } catch (e) {
      console.error('Failed to process ' + file + ':', e.message);
    }
  }
}
```

### Example 3: Copy External Files Into Workspace

```javascript
async function agentImportFiles(externalHandles) {
  for (var handle of externalHandles) {
    if (handle.kind === 'file') {
      var granted = await MateyFS.verifyPermission(handle, false);
      if (!granted) continue;

      var file = await handle.getFile();
      var content = await file.text();

      // Write to workspace with same filename
      await MateyFS.writeFile(handle.name, content);
    }
  }
}
```

## IndexedDB Storage

Handles are persisted in IndexedDB with schema:

```
Database: MateyFS (v2)
Stores:
  workspaces  (keyPath: id)
    Records: { id: workspaceName, handle: <serialized>, name, type, savedAt }
  activity_log (keyPath: auto-increment id)
    Records: { id: auto, timestamp, action, path, details, workspace }
```

The `structuredClone()` API is used for serialization when available, with a JSON-based fallback.

## Lifecycle

- **On app launch**: `verifyAndRestore()` checks the last workspace's permission
- **On workspace switch**: Permission is verified before switching
- **Before every file operation**: Permission is re-verified via `requireWorkspace()`
- **On USB disconnect**: `safeWrite()` surfaces a clear warning rather than failing silently
- **On app termination**: `shutdown()` sets a flag to stop pending operations

## Error Handling

```javascript
try {
  var result = await MateyFS.selectWorkspace('My Workspace');
  if (!result.ok) {
    if (result.error === 'user_cancelled') {
      // User dismissed the picker
    } else if (result.error === 'api_unavailable') {
      // Use fallback <input> approach
    }
  }
} catch (e) {
  // Handle unexpected errors
}
```

### Error Messages

All errors include user-friendly messages:
- `"Path traversal blocked: ".." not allowed"` — security violation
- `"No active workspace. Call selectWorkspace() first."` — no workspace set
- `"Permission denied for file: ..."` — access denied
- `"Write failed — USB may be disconnected. Original file unchanged."` — USB safety
- `"File not found: ..."` — missing file

## Platform Support

- **Desktop (Chrome/Edge/Chromium)**: Full File System Access API support
- **Mobile (Chrome for Android)**: File System Access API support (Chrome 108+)
- **USB OTG**: Available on Android via Chrome for Android when a USB drive is mounted
- **Legacy Fallback**: `<input type="file" webkitdirectory>` for unsupported environments

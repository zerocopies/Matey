# Matey File System Integration

## Overview

The File System Access API (FSA) integration module (`matey-fs.js`) provides secure, sandboxed access to local storage for Matey's Custom Tab Agent. It supports two primary workflows:

1. **Matey Workspace**: A user-selected local folder for autonomous agent file operations.
2. **Direct USB Drive (OTG)**: File manipulation on external USB storage via USB-C OTG.

## API Reference

### Capability Detection

```javascript
// Check if File System Access API is available
if (MateyFS.supports()) {
  // FSA is supported
} else {
  // Fall back to <input type="file" webkitdirectory>
  var input = MateyFS.createFallbackInput({ directory: true, multiple: true });
  input.onchange = function(e) {
    MateyFS.handleFallbackFiles(input, { asBase64: false }, function(err, files) {
      // Process files array: [{ name, path, content, size, type }]
    });
  };
  input.click();
}
```

### Workspace Management

```javascript
// Initialize workspace (prompts user to select folder)
var result = await MateyFS.initializeWorkspace();
// result: { ok: true, name: "Documents", type: "workspace" }
// or: { ok: false, error: "user_cancelled" | "api_unavailable" }

// Connect to a USB drive
var result = await MateyFS.selectUSBMount();
// result: { ok: true, name: "USB_DRIVE", type: "usb" }

// Restore cached workspace on app restart
var ws = await MateyFS.restoreWorkspace();
// ws: { name, handle, type } or null

// Clear cached workspace
await MateyFS.clearCachedWorkspace();

// Get current workspace
var ws = MateyFS.getCurrentWorkspace();
```

### Permission Verification

```javascript
// Verify read or read-write permission
var granted = await MateyFS.verifyPermission(fileHandle, readWrite);
var granted = await MateyFS.verifyDirectoryPermission(dirHandle, readWrite);
```

### File Operations

All file operations are scoped to the active workspace directory handle.

```javascript
// Create a subfolder
await MateyFS.createSubfolder('logs', 'batch-analysis');

// Write a file (text)
await MateyFS.writeFile('summaries/notes.md', '# Summary\nContent here');

// Write a file (base64 encoded binary)
await MateyFS.writeFile('images/icon.png', base64Data, true);

// Read a file (text)
var content = await MateyFS.readFile('README.md');

// Read a file (base64 data URL)
var dataUrl = await MateyFS.readFileAsBase64('images/photo.jpg');

// List files in a directory
var entries = await MateyFS.listFiles(''); // root of workspace
// entries: [{ name: "file.txt", kind: "file" }, { name: "subdir", kind: "directory" }]

// Check if file exists
var exists = await MateyFS.fileExists('config.json');

// Delete a file
await MateyFS.deleteFile('temp/old.txt');

// Copy a file
await MateyFS.copyFile('source.txt', 'dest/copy.txt');

// List all files recursively
var allFiles = await MateyFS.listAllFiles();
```

## Agent Action Handlers

### Example 1: Create a Subfolder and Write Analysis Results

```javascript
async function agentBatchAnalysis(sourceFiles) {
  var workspace = MateyFS.getCurrentWorkspace();
  if (!workspace) {
    var result = await MateyFS.initializeWorkspace();
    if (!result.ok) throw new Error('No workspace');
  }

  // Create a timestamped batch folder
  var timestamp = new Date().toISOString().slice(0, 10).replace(/:/g, '-');
  var batchDir = 'batch-' + timestamp;
  await MateyFS.createSubfolder('', batchDir);

  // Process each source file and write results
  for (var i = 0; i < sourceFiles.length; i++) {
    var content = await MateyFS.readFile(sourceFiles[i]);
    var analysis = await analyzeWithAI(content); // Your AI function
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
  var usb = await MateyFS.restoreWorkspace();
  if (!usb || usb.type !== 'usb') {
    var result = await MateyFS.selectUSBMount();
    if (!result.ok) throw new Error('USB not connected');
  }

  // Scan for source files
  var allFiles = await MateyFS.listAllFiles();
  var sourceFiles = allFiles.filter(function(f) {
    return f.match(/\.(js|ts|jsx|tsx|py|go|rs)$/);
  });

  // Process each file
  for (var file of sourceFiles) {
    try {
      var content = await MateyFS.readFile(file);
      var modified = optimizeImports(content); // Your transformation
      // Write back to USB drive
      await MateyFS.writeFile(file, modified);
      console.log('Updated: ' + file);
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
Database: MateyFS (v1)
Store: handles (keyPath: id)
Records: { id: string, handle: <serialized>, savedAt: number }

IDs:
- "workspace" - cached workspace directory handle
- "usb" - cached USB directory handle
```

The `structuredClone()` API is used for serialization when available, with a JSON-based fallback.

## Security Model

1. **Scoped Access**: All file operations are strictly scoped to the active workspace directory handle.
2. **Permission Verification**: Permissions are re-verified before every operation.
3. **User Gesture Required**: `showDirectoryPicker()` requires transient user activation.
4. **No Path Traversal**: All paths are resolved relative to the workspace root.

## Error Handling

```javascript
try {
  var result = await MateyFS.initializeWorkspace();
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

## Platform Support

- **Desktop (Chrome/Edge/Chromium)**: Full File System Access API support.
- **Mobile (Chrome for Android)**: File System Access API support (Chrome 108+).
- **USB OTG**: Available on Android via Chrome for Android when a USB drive is mounted.
- **Legacy Fallback**: `<input type="file" webkitdirectory>` for unsupported environments.

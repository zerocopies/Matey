/* MateyNativeShell — Android Native Shell Bridge
 * Interfaces with local command-line environments (Termux / Android local shell).
 * Uses Capacitor plugin bridge when available, falls back to Termux intent.
 */
(function () {
  'use strict';

  /* ---- Execute a command and return full output ---- */
  function executeCommand(cmd, timeoutMs) {
    return new Promise(function(resolve, reject) {
      if (!cmd || typeof cmd !== 'string') { reject(new Error('Empty command')); return; }

      // Try native Capacitor shell plugin first
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ShellExec) {
        window.Capacitor.Plugins.ShellExec.execute({ command: cmd })
          .then(function(result) {
            resolve({ stdout: result.output || '', stderr: result.error || '', exitCode: result.exitCode || 0 });
          })
          .catch(function(err) {
            // Fall through to Termux intent
            _executeViaTermux(cmd, resolve, reject);
          });
        return;
      }

      // Try window.ShellExec (older bridge pattern)
      if (window.ShellExec && typeof window.ShellExec.execute === 'function') {
        window.ShellExec.execute(cmd, function(result) {
          resolve({ stdout: result.stdout || '', stderr: result.stderr || '', exitCode: result.exitCode || 0 });
        }, function(err) {
          reject(new Error(err.message || 'Shell execution failed'));
        });
        return;
      }

      // Fall back to Termux intent
      _executeViaTermux(cmd, resolve, reject);
    });
  }

  /* ---- Stream command output line by line ---- */
  function streamCommandOutput(cmd, onData, timeoutMs) {
    return new Promise(function(resolve, reject) {
      if (!cmd || typeof cmd !== 'string') { reject(new Error('Empty command')); return; }
      if (typeof onData !== 'function') { reject(new Error('onData callback required')); return; }

      // Try native streaming shell plugin
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ShellExec) {
        window.Capacitor.Plugins.ShellExec.stream({ command: cmd, onData: onData })
          .then(function(result) {
            resolve({ stdout: result.output || '', exitCode: result.exitCode || 0 });
          })
          .catch(function(err) {
            _streamViaTermux(cmd, onData, resolve, reject);
          });
        return;
      }

      // Fall back to non-streaming with simulated streaming
      executeCommand(cmd).then(function(result) {
        var lines = (result.stdout || '').split('\n');
        lines.forEach(function(line) { onData(line); });
        resolve(result);
      }).catch(reject);
    });
  }

  /* ---- Termux Intent Fallback ---- */
  function _executeViaTermux(cmd, resolve, reject) {
    if (!window.Capacitor || typeof window.Capacitor.openIntent !== 'function') {
      reject(new Error('No shell backend available. Install Termux or configure ShellExec plugin.'));
      return;
    }
    // Launch Termux with command via RUN_COMMAND intent
    window.Capacitor.openIntent({
      action: 'com.termux.RUN_COMMAND',
      extras: {
        'com.termux.RUN_COMMAND_PATH': '/data/data/com.termux/files/usr/bin/bash',
        'com.termux.RUN_COMMAND_ARGUMENTS': ['-c', cmd]
      }
    }).then(function() {
      resolve({ stdout: 'Command launched in Termux.', stderr: '', exitCode: 0 });
    }).catch(function(err) {
      reject(new Error('Termux intent failed: ' + (err.message || 'Termux may not be installed')));
    });
  }

  function _streamViaTermux(cmd, onData, resolve, reject) {
    _executeViaTermux(cmd, function(result) {
      onData(result.stdout);
      resolve(result);
    }, reject);
  }

  /* ---- Check if shell is available ---- */
  function isAvailable() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ShellExec) return true;
    if (window.ShellExec && typeof window.ShellExec.execute === 'function') return true;
    if (window.Capacitor && typeof window.Capacitor.openIntent === 'function') return true;
    return false;
  }

  window.MateyNativeShell = {
    execute: executeCommand,
    stream: streamCommandOutput,
    isAvailable: isAvailable
  };
})();

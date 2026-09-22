/* MateyNativeShell — Android Native Shell Bridge
 * Interfaces with local command-line environments (Termux / Android local shell).
 * Uses the Capacitor ShellExec plugin bridge when available, falls back to the
 * legacy window.ShellExec bridge. Fails closed when MateyShellGuard reports the
 * shell disabled, and every command runs under a timeout.
 */
(function () {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 30000;
  var MAX_CMD_LEN = 4000;

  function _shellEnabled() {
    try {
      if (window.MateyShellGuard && typeof window.MateyShellGuard.isShellEnabled === 'function') {
        return window.MateyShellGuard.isShellEnabled();
      }
      return true; // No guard loaded — treat as enabled but still reject on capability
    } catch (e) { return false; }
  }

  function _ensureShellExecProxy() {
    try {
      if (window.Capacitor && typeof window.Capacitor.registerPlugin === 'function' &&
          !(window.Capacitor.Plugins && window.Capacitor.Plugins.ShellExec)) {
        window.Capacitor.registerPlugin('ShellExec'); // routes nativePromise to ShellExecPlugin.java
      }
    } catch (e) { /* web or non-Capacitor context */ }
  }

  function _nativeBackend() {
    _ensureShellExecProxy();
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ShellExec) {
      return { kind: 'capacitor', impl: window.Capacitor.Plugins.ShellExec };
    }
    if (window.ShellExec && typeof window.ShellExec.execute === 'function') {
      return { kind: 'legacy', impl: window.ShellExec };
    }
    return null;
  }

  function _withTimeout(promise, timeoutMs, label) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () {
        reject(new Error((label || 'Command') + ' timed out after ' + timeoutMs + 'ms; process terminated.'));
      }, timeoutMs || DEFAULT_TIMEOUT_MS);
      promise.then(function (v) { clearTimeout(t); resolve(v); },
                   function (e) { clearTimeout(t); reject(e); });
    });
  }

  function _normalize(result) {
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: (typeof result.exitCode === 'number') ? result.exitCode : 0
    };
  }

  /* ---- Execute a command and return full output ---- */
  function executeCommand(cmd, timeoutMs) {
    return new Promise(function(resolve, reject) {
      if (!cmd || typeof cmd !== 'string') { reject(new Error('Empty command')); return; }
      if (cmd.length > MAX_CMD_LEN) { reject(new Error('Command exceeds ' + MAX_CMD_LEN + ' characters')); return; }
      if (!_shellEnabled()) {
        reject(new Error('Shell access is disabled. Enable it in Settings → Features → Native Shell.'));
        return;
      }

      var backend = _nativeBackend();
      if (!backend) {
        reject(new Error('No shell backend available. Configure the ShellExec Capacitor plugin (see android/app/src/main/java/com/matey/app/ShellExecPlugin.java).'));
        return;
      }

      var timeout = timeoutMs || DEFAULT_TIMEOUT_MS;
      var p;
      if (backend.kind === 'capacitor') {
        p = backend.impl.execute({ command: cmd, timeoutMs: timeout })
          .then(function(result) { return _normalize(result); });
      } else {
        p = new Promise(function(res, rej) {
          backend.impl.execute(cmd, function(result) {
            res(_normalize(result));
          }, function(err) {
            rej(new Error((err && err.message) || 'Shell execution failed'));
          });
        });
      }

      _withTimeout(p, timeout, 'Command').then(resolve, reject);
    });
  }

  /* ---- Stream command output line by line ---- */
  function streamCommandOutput(cmd, onData, timeoutMs) {
    return new Promise(function(resolve, reject) {
      if (!cmd || typeof cmd !== 'string') { reject(new Error('Empty command')); return; }
      if (typeof onData !== 'function') { reject(new Error('onData callback required')); return; }
      if (cmd.length > MAX_CMD_LEN) { reject(new Error('Command exceeds ' + MAX_CMD_LEN + ' characters')); return; }
      if (!_shellEnabled()) {
        reject(new Error('Shell access is disabled. Enable it in Settings → Features → Native Shell.'));
        return;
      }

      var backend = _nativeBackend();
      if (!backend) {
        reject(new Error('No shell backend available. Configure the ShellExec Capacitor plugin (see android/app/src/main/java/com/matey/app/ShellExecPlugin.java).'));
        return;
      }

      var timeout = timeoutMs || DEFAULT_TIMEOUT_MS;

      // Line streaming is emulated over full-output execution: the Capacitor
      // ShellExec plugin resolves with complete output, so we replay it as
      // per-line chunks for the onData callback. Real peripheral streams can be
      // added later without changing this contract.
      var p = executeCommand(cmd, timeout).then(function(result) {
        var lines = (result.stdout || '').split('\n');
        lines.forEach(function(line) { onData(line); });
        return result;
      });

      _withTimeout(p, timeout, 'Stream').then(resolve, reject);
    });
  }

  /* ---- Check if shell is available ---- */
  function isAvailable() {
    var backend = _nativeBackend();
    if (backend) {
      try { if (window.MateyShellGuard && typeof window.MateyShellGuard.isShellEnabled === 'function') { return window.MateyShellGuard.isShellEnabled(); } } catch (e) {}
      return backend !== null;
    }
    return false;
  }

  window.MateyNativeShell = {
    execute: executeCommand,
    stream: streamCommandOutput,
    isAvailable: isAvailable
  };
})();
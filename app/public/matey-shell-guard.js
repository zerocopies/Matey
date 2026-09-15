/* MateyShellGuard — Safety & Permission Guard for Native Shell Execution
 * Classifies commands by risk level and enforces user confirmation for destructive operations.
 * Provides a settings toggle to enable/disable local shell access entirely.
 */
(function () {
  'use strict';

  const _STORAGE_KEY = 'matey-shell-enabled';

  /* ---- Risk Classification ---- */
  var _HIGH_RISK_PATTERNS = [
    /rm\s+(-[rfRF]+\s+.*|\s+\/)/,
    /rmdir\s+/,
    /mkfs/,
    /dd\s+if=/,
    /chmod\s+777/,
    /chown\s+-R\s+root/,
    /sudo\s+/,
    /su\s+/,
    /passwd/,
    /shutdown/,
    /reboot/,
    /halt/,
    /poweroff/,
    /init\s+[06]/,
    /systemctl\s+(stop|disable|mask)/,
    /pm\s+(disable|clear|uninstall)/,
    /cmd\s+package\s+uninstall/,
    /settings\s+put\s+(global|secure)/,
    /putprop\s+/,
    /setprop\s+/,
    /svc\s+(wifi|bluetooth|data)\s+disable/,
    /cmd\s+(connectivity|wifi|battery|deviceidle|appops|notification|role|user|rollback|stats|backup|jobscheduler|media_session|statusbar|slice|shortcut|vibrator|hardware|thermalservice|device_policy|lock_settings|phone_accounts|crossprofileapps|trust|sensorservice|input|telecom|companion|restrictions|usagestats|media_router|netpolicy|netstats|remoteprovider|autofill|content_capture|attention|bg_executor|uimode|night_display)/,
    /cmd\s+am\s+(force-stop|kill)/,
    /cmd\s+am\s+broadcast\s+-a\s+android\.intent\.action\.(MASTER_CLEAR|FACTORY_RESET|WIPE_DATA|SHUTDOWN|REBOOT)/,
    /cmd\s+am\s+start\s+-a\s+android\.intent\.action\.MASTER_CLEAR/,
  ];

  var _MEDIUM_RISK_PATTERNS = [
    /kill\s+/,
    /pkill/,
    /killall/,
    /mount/,
    /umount/,
    /fdisk/,
    /parted/,
    /curl\s+.*\|.*sh/,
    /wget\s+.*\|.*sh/,
    /bash\s+-c/,
    /sh\s+-c/,
    /eval\s+/,
    /exec\s+/,
    /chmod\s+/,
    /chown\s+/,
    /ln\s+-s/,
    /mv\s+/,
    /cp\s+-r/,
    /find\s+.*-delete/,
    /find\s+.*-exec/,
    /tar\s+/,
    /zip\s+/,
    /unzip\s+/,
    /git\s+push/,
    /git\s+reset\s+--hard/,
    /git\s+clean\s+-f/,
    /npm\s+publish/,
    /npm\s+uninstall/,
    /pip\s+uninstall/,
    /docker\s+rm/,
    /docker\s+rmi/,
  ];

  /* ---- Risk Assessment ---- */
  function classifyRisk(cmd) {
    if (!cmd || typeof cmd !== 'string') return 'unknown';
    var trimmed = cmd.trim();
    if (!trimmed) return 'unknown';

    for (var i = 0; i < _HIGH_RISK_PATTERNS.length; i++) {
      if (_HIGH_RISK_PATTERNS[i].test(trimmed)) return 'high';
    }
    for (var j = 0; j < _MEDIUM_RISK_PATTERNS.length; j++) {
      if (_MEDIUM_RISK_PATTERNS[j].test(trimmed)) return 'medium';
    }
    return 'low';
  }

  /* ---- Permission Check ---- */
  function isShellEnabled() {
    try {
      return localStorage.getItem(_STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function setShellEnabled(enabled) {
    try {
      localStorage.setItem(_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch (e) {}
  }

  /* ---- Confirmation ---- */
  function confirmExecution(cmd, riskLevel) {
    if (riskLevel === 'high') {
      return confirm('HIGH RISK COMMAND:\n\n' + cmd + '\n\nThis operation may be destructive or irreversible. Proceed?');
    }
    if (riskLevel === 'medium') {
      return confirm('MEDIUM RISK COMMAND:\n\n' + cmd + '\n\nThis operation modifies system state. Proceed?');
    }
    return true;
  }

  /* ---- Command Sanitization (production: REJECT, do not silently strip) ----
   * Returns { ok:true, command } when safe, { ok:false, reason } when the
   * input contains chaining/substitution characters. Callers must refuse
   * to execute rejected input. Newlines are rejected outright (multiline
   * smuggling). Null bytes are rejected. Length is capped at 4000 chars. */
  var _MAX_CMD_LEN = 4000;
  var _INJECTION_RE = /[;&|`$()<>]/;
  function sanitizeCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') return '';
    var s = String(cmd).replace(/\0/g, '');
    if (/[\r\n]/.test(s)) return '';
    if (s.length > _MAX_CMD_LEN) s = s.slice(0, _MAX_CMD_LEN);
    return s.trim().replace(/[;&|`$()<>]/g, function(match) {
      // Block command chaining, pipes, subshells, redirection
      if (match === ';' || match === '&' || match === '|' || match === '`' || match === '$') return '';
      return match;
    });
  }

  /* Strict gate: true only when the raw input is safe to execute as-is.
   * Any chaining/substitution/redirection char or newline fails closed. */
  function isCommandSafe(cmd) {
    if (!cmd || typeof cmd !== 'string') return false;
    if (cmd.indexOf('\0') !== -1) return false;
    if (/[\r\n]/.test(cmd)) return false;
    if (cmd.length > _MAX_CMD_LEN) return false;
    return !_INJECTION_RE.test(cmd);
  }

  function rejectionReason(cmd) {
    if (!cmd || typeof cmd !== 'string' || !cmd.trim()) return 'Empty command';
    if (cmd.indexOf('\0') !== -1) return 'Null byte detected';
    if (/[\r\n]/.test(cmd)) return 'Multiline input blocked — single command only';
    if (cmd.length > _MAX_CMD_LEN) return 'Command exceeds ' + _MAX_CMD_LEN + ' characters';
    var m = _INJECTION_RE.exec(cmd);
    if (m) return 'Blocked chaining/substitution character: ' + JSON.stringify(m[0]);
    return null;
  }

  window.MateyShellGuard = {
    classifyRisk: classifyRisk,
    isShellEnabled: isShellEnabled,
    setShellEnabled: setShellEnabled,
    confirmExecution: confirmExecution,
    sanitizeCommand: sanitizeCommand,
    isCommandSafe: isCommandSafe,
    rejectionReason: rejectionReason,
    MAX_COMMAND_LENGTH: _MAX_CMD_LEN
  };
})();

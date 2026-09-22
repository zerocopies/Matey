package com.matey.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * ShellExecPlugin — Native shell backend for MateyNativeShell.
 *
 * Runs a single command through the Android shell (<b>/system/bin/sh -c</b>),
 * captures stdout/stderr and the exit code, and enforces a hard timeout with
 * process termination so a hung command can never wedge the agent forever.
 *
 * Security posture: this plugin is a dumb executor. All command allow/deny
 * decisions (MateyShellGuard sanitization, risk classification, user
 * confirmation, and the shell-enabled flag) are enforced in the JS layer
 * before a call ever reaches here.
 *
 * Platform note: the process runs as the app's own UID, so the available
 * command set is the Android toybox (rm, ls, cat, mv, ...) — NOT Termux's
 * package environment. Installing Termux extends the available commands, but
 * Termux's full toolchain runs in its own data directory that the app UID
 * cannot reach without the RUN_COMMAND intent flow.
 */
@CapacitorPlugin(name = "ShellExec")
public class ShellExecPlugin extends Plugin {

    private static final long DEFAULT_TIMEOUT_MS = 30_000L;
    private static final int DEFAULT_MAX_OUTPUT_BYTES = 512 * 1024;

    @PluginMethod
    public void execute(PluginCall call) {
        String command = call.getString("command");
        if (command == null || command.trim().isEmpty()) {
            call.reject("Empty command");
            return;
        }

        Long timeout = call.getLong("timeoutMs", DEFAULT_TIMEOUT_MS);
        if (timeout == null || timeout <= 0) timeout = DEFAULT_TIMEOUT_MS;
        Integer maxOutput = call.getInt("maxOutputBytes", DEFAULT_MAX_OUTPUT_BYTES);
        if (maxOutput == null || maxOutput <= 0) maxOutput = DEFAULT_MAX_OUTPUT_BYTES;

        try {
            Process process = new ProcessBuilder("/system/bin/sh", "-c", command).start();

            StreamReader stdout = new StreamReader(process.getInputStream(), maxOutput, "stdout");
            StreamReader stderr = new StreamReader(process.getErrorStream(), maxOutput, "stderr");
            stdout.start();
            stderr.start();

            int exitCode;
            boolean finished = process.waitFor(timeout, TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                process.waitFor(1, TimeUnit.SECONDS);
                exitCode = 124; // timeout status, mirroring GNU timeout
            } else {
                exitCode = process.exitValue();
            }

            stdout.join(500);
            stderr.join(500);

            JSObject result = new JSObject();
            result.put("stdout", stdout.getOutput());
            result.put("stderr", stderr.getOutput() + (finished ? "" : "\n[Command timed out after " + timeout + "ms; process terminated.]"));
            result.put("exitCode", exitCode);
            result.put("timedOut", !finished);
            call.resolve(result);
        } catch (IOException e) {
            call.reject("Failed to start shell process: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            call.reject("Shell execution interrupted", e);
        }
    }

    /** Reads a stream into a capped buffer on a background thread. */
    private static class StreamReader extends Thread {
        private final InputStream in;
        private final int cap;
        private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();

        StreamReader(InputStream in, int cap, String name) {
            super("shell-" + name);
            this.in = in;
            this.cap = cap;
        }

        @Override
        public void run() {
            byte[] chunk = new byte[8192];
            int n;
            try {
                while ((n = in.read(chunk)) != -1) {
                    int room = cap - buffer.size();
                    if (room <= 0) break;
                    buffer.write(chunk, 0, Math.min(n, room));
                }
            } catch (IOException ignored) {
            } finally {
                try { in.close(); } catch (IOException ignored) {}
            }
        }

        String getOutput() {
            return new String(buffer.toByteArray(), StandardCharsets.UTF_8).trim();
        }
    }
}
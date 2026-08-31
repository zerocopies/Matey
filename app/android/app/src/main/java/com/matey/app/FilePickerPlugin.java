package com.matey.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FilePicker")
public class FilePickerPlugin extends Plugin {

    private static final String TAG = "MateyJS";
    private static final String PREFS_NAME = "MateyFilePicker";
    private static final String KEY_PENDING_URI = "pending_dir_uri";
    private static final String KEY_PENDING_NAME = "pending_dir_name";
    private static final String KEY_PENDING_TIME = "pending_dir_time";

    private static MainActivity mainActivity;
    private static PluginCall pendingDirectoryCall;
    private static PluginCall pendingFileCall;

    static void setMainActivity(MainActivity activity) {
        mainActivity = activity;
    }

    static PluginCall getPendingDirectoryCall() {
        PluginCall call = pendingDirectoryCall;
        pendingDirectoryCall = null;
        return call;
    }

    static PluginCall getPendingFileCall() {
        PluginCall call = pendingFileCall;
        pendingFileCall = null;
        return call;
    }

    @PluginMethod
    public void pickDirectory(@NonNull PluginCall call) {
        Log.i(TAG, "pickDirectory called instance=" + System.identityHashCode(mainActivity));
        if (mainActivity == null) {
            call.reject("MainActivity not available");
            return;
        }
        pendingDirectoryCall = call;
        mainActivity.launchDirectoryPicker();
    }

    @PluginMethod
    public void pickFile(@NonNull PluginCall call) {
        Log.i(TAG, "pickFile called instance=" + System.identityHashCode(mainActivity));
        if (mainActivity == null) {
            call.reject("MainActivity not available");
            return;
        }
        pendingFileCall = call;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);

        mainActivity.startActivityForResult(Intent.createChooser(intent, "Select File"), 9004);
    }

    @PluginMethod
    public void getPendingResult(@NonNull PluginCall call) {
        Log.i(TAG, "getPendingResult called");
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_PENDING_URI, null);
        String name = prefs.getString(KEY_PENDING_NAME, null);

        if (uri != null) {
            Log.i(TAG, "Found pending result: " + name + " uri=" + uri);
            JSObject result = new JSObject();
            result.put("uri", uri);
            result.put("name", name);
            call.resolve(result);
        } else {
            JSObject result = new JSObject();
            result.put("uri", "");
            result.put("name", "");
            call.resolve(result);
        }
    }

    @PluginMethod
    public void clearPendingResult(@NonNull PluginCall call) {
        Log.i(TAG, "clearPendingResult called");
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }
        SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(KEY_PENDING_URI).remove(KEY_PENDING_NAME).remove(KEY_PENDING_TIME).apply();
        call.resolve();
    }

    /* === Native file operations for Android (FSA not available) === */

    @PluginMethod
    public void listFiles(@NonNull PluginCall call) {
        Log.i(TAG, "listFiles called");
        String uriStr = call.getString("uri");
        String subDir = call.getString("subDir", "");
        if (uriStr == null) {
            call.reject("uri is required");
            return;
        }
        try {
            Uri uri = Uri.parse(uriStr);
            // Use DocumentFile to list files
            androidx.documentfile.provider.DocumentFile dir = androidx.documentfile.provider.DocumentFile.fromTreeUri(getContext(), uri);
            if (dir == null || !dir.exists()) {
                call.reject("Directory not found");
                return;
            }
            // Navigate to subdirectory if needed
            if (subDir != null && !subDir.isEmpty()) {
                String[] parts = subDir.split("/");
                for (String part : parts) {
                    if (part.isEmpty()) continue;
                    dir = dir.findFile(part);
                    if (dir == null || !dir.isDirectory()) {
                        call.reject("Subdirectory not found: " + part);
                        return;
                    }
                }
            }
            JSObject result = new JSObject();
            org.json.JSONArray entries = new org.json.JSONArray();
            androidx.documentfile.provider.DocumentFile[] files = dir.listFiles();
            for (androidx.documentfile.provider.DocumentFile f : files) {
                JSObject entry = new JSObject();
                entry.put("name", f.getName());
                entry.put("kind", f.isDirectory() ? "directory" : "file");
                entries.put(entry);
            }
            result.put("entries", entries);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "listFiles failed", e);
            call.reject("listFiles failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readFile(@NonNull PluginCall call) {
        Log.i(TAG, "readFile called");
        String uriStr = call.getString("uri");
        String path = call.getString("fileName");
        if (uriStr == null || path == null) {
            call.reject("uri and fileName are required");
            return;
        }
        try {
            Uri uri = Uri.parse(uriStr);
            androidx.documentfile.provider.DocumentFile dir = androidx.documentfile.provider.DocumentFile.fromTreeUri(getContext(), uri);
            if (dir == null || !dir.exists()) {
                call.reject("Directory not found");
                return;
            }
            // Navigate to subdirectory if path contains /
            String fileName = path;
            if (path.contains("/")) {
                String[] parts = path.split("/");
                for (int i = 0; i < parts.length - 1; i++) {
                    if (parts[i].isEmpty()) continue;
                    dir = dir.findFile(parts[i]);
                    if (dir == null || !dir.isDirectory()) {
                        call.reject("Subdirectory not found: " + parts[i]);
                        return;
                    }
                }
                fileName = parts[parts.length - 1];
            }
            androidx.documentfile.provider.DocumentFile file = dir.findFile(fileName);
            if (file == null || !file.exists()) {
                call.reject("File not found: " + fileName);
                return;
            }
            java.io.InputStream is = getContext().getContentResolver().openInputStream(file.getUri());
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int len;
            while ((len = is.read(buffer)) != -1) {
                baos.write(buffer, 0, len);
            }
            is.close();
            String content = baos.toString("UTF-8");
            JSObject result = new JSObject();
            result.put("content", content);
            call.resolve(result);
        } catch (java.io.FileNotFoundException e) {
            call.reject("File not found: " + path);
        } catch (Exception e) {
            Log.e(TAG, "readFile failed", e);
            call.reject("readFile failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void writeFile(@NonNull PluginCall call) {
        Log.i(TAG, "writeFile called");
        String uriStr = call.getString("uri");
        String path = call.getString("fileName");
        String content = call.getString("content");
        if (uriStr == null || path == null || content == null) {
            call.reject("uri, fileName, and content are required");
            return;
        }
        try {
            Uri uri = Uri.parse(uriStr);
            androidx.documentfile.provider.DocumentFile dir = androidx.documentfile.provider.DocumentFile.fromTreeUri(getContext(), uri);
            if (dir == null || !dir.exists()) {
                call.reject("Directory not found");
                return;
            }
            // Navigate to subdirectory if path contains /
            String fileName = path;
            if (path.contains("/")) {
                String[] parts = path.split("/");
                for (int i = 0; i < parts.length - 1; i++) {
                    if (parts[i].isEmpty()) continue;
                    dir = dir.findFile(parts[i]);
                    if (dir == null || !dir.isDirectory()) {
                        call.reject("Subdirectory not found: " + parts[i]);
                        return;
                    }
                }
                fileName = parts[parts.length - 1];
            }
            // Check if file exists, delete if so
            androidx.documentfile.provider.DocumentFile existing = dir.findFile(fileName);
            if (existing != null && existing.exists()) {
                existing.delete();
            }
            // Create new file
            androidx.documentfile.provider.DocumentFile file = dir.createFile("application/octet-stream", fileName);
            if (file == null) {
                call.reject("Failed to create file");
                return;
            }
            java.io.OutputStream os = getContext().getContentResolver().openOutputStream(file.getUri());
            os.write(content.getBytes("UTF-8"));
            os.close();
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "writeFile failed", e);
            call.reject("writeFile failed: " + e.getMessage());
        }
    }
}
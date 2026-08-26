package com.matey.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "FilePicker")
public class FilePickerPlugin extends Plugin {

    private static final String TAG = "MateyJS";
    private static final int SAVE_REQUEST_CODE = 9001;
    private static final int OPEN_REQUEST_CODE = 9002;

    private PluginCall saveCall;
    private PluginCall openCall;
    private boolean isSaveRequest;

    public void saveFile(@NonNull PluginCall call) {
        String content = call.getString("content", "");
        String filename = call.getString("filename", "note.md");
        String mimeType = call.getString("mimeType", "text/plain");

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        intent.putExtra(Intent.EXTRA_TEXT, content);

        this.saveCall = call;
        this.isSaveRequest = true;

        startActivityForResult(call, intent, SAVE_REQUEST_CODE);
    }

    public void openFile(@NonNull PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);

        this.openCall = call;
        this.isSaveRequest = false;

        startActivityForResult(call, intent, OPEN_REQUEST_CODE);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode == SAVE_REQUEST_CODE && saveCall != null && isSaveRequest) {
            handleSaveResult(resultCode, data);
        } else if (requestCode == OPEN_REQUEST_CODE && openCall != null && !isSaveRequest) {
            handleOpenResult(resultCode, data);
        }
    }

    private void handleSaveResult(int resultCode, @Nullable Intent data) {
        PluginCall call = saveCall;
        saveCall = null;

        if (call == null) return;

        if (resultCode == Activity.RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri != null) {
                String content = call.getString("content", "");
                try {
                    ContentResolver resolver = getActivity().getContentResolver();
                    OutputStream out = resolver.openOutputStream(uri);
                    if (out != null) {
                        out.write(content.getBytes("UTF-8"));
                        out.close();
                    }
                    JSObject result = new JSObject();
                    result.put("uri", uri.toString());
                    result.put("saved", true);
                    call.resolve(result);
                } catch (Exception e) {
                    Log.e(TAG, "Save failed", e);
                    call.reject("Failed to save file: " + e.getMessage());
                }
            } else {
                call.reject("No file selected");
            }
        } else {
            call.reject("Save cancelled by user");
        }
    }

    private void handleOpenResult(int resultCode, @Nullable Intent data) {
        PluginCall call = openCall;
        openCall = null;

        if (call == null) return;

        if (resultCode == Activity.RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri != null) {
                try {
                    String content = readTextFromUri(uri);
                    String name = getFileName(uri);
                    JSObject result = new JSObject();
                    result.put("uri", uri.toString());
                    result.put("name", name);
                    result.put("content", content);
                    call.resolve(result);
                } catch (Exception e) {
                    Log.e(TAG, "Open failed", e);
                    call.reject("Failed to read file: " + e.getMessage());
                }
            } else {
                call.reject("No file selected");
            }
        } else {
            call.reject("Open cancelled by user");
        }
    }

    private String readTextFromUri(Uri uri) throws Exception {
        ContentResolver resolver = getActivity().getContentResolver();
        InputStream inputStream = resolver.openInputStream(uri);
        if (inputStream == null) return "";
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int nRead;
        while ((nRead = inputStream.read(buf)) != -1) {
            buffer.write(buf, 0, nRead);
        }
        buffer.flush();
        inputStream.close();
        return buffer.toString("UTF-8");
    }

    private String getFileName(Uri uri) {
        String displayName = "unknown";
        Cursor cursor = null;
        try {
            cursor = getActivity().getContentResolver().query(
                uri, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                displayName = cursor.getString(cursor.getColumnIndexOrThrow(android.provider.OpenableColumns.DISPLAY_NAME));
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not get file name", e);
        } finally {
            if (cursor != null) cursor.close();
        }
        return displayName;
    }
}

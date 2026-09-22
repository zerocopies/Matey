package com.matey.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import android.Manifest;
import android.content.pm.PackageManager;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MateyJS";

    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private static final int REQ_RECORD_AUDIO = 7001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Pre-grant RECORD_AUDIO at app level so WebView getUserMedia works
        // without the Chromium "requires MODIFY_AUDIO_SETTINGS and RECORD_AUDIO" block.
        // Manifest already declares RECORD_AUDIO + MODIFY_AUDIO_SETTINGS.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            Log.i(TAG, "Requesting RECORD_AUDIO runtime permission");
            ActivityCompat.requestPermissions(
                    this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
        }

        // Register the custom FilePicker plugin for Android system file dialogs
        registerPlugin(FilePickerPlugin.class);

        // Register the native shell backend used by MateyNativeShell/ShellGuard
        registerPlugin(ShellExecPlugin.class);

        // Register the ActivityResultLauncher for the file chooser (WebView file input)
        fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            new ActivityResultCallback<ActivityResult>() {
                @Override
                public void onActivityResult(ActivityResult result) {
                    Log.i(TAG, "DIAG fileChooserLauncher CALLBACK resultCode=" + result.getResultCode() + " data=" + result.getData());
                    handleFileChooserResult(result);
                }
            }
        );
        Log.i(TAG, "DIAG fileChooserLauncher REGISTERED");

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WebView.setWebContentsDebuggingEnabled(true);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.getSettings().setMixedContentMode(
                WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            );
            // Allow getUserMedia without user gesture (required for mic to work)
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
            // Enable DOM storage and JavaScript
            webView.getSettings().setDomStorageEnabled(true);
            webView.getSettings().setJavaScriptEnabled(true);
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(PermissionRequest request) {
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            Log.i(TAG, "Granting microphone permission to WebView");
                            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                            return;
                        }
                    }
                    super.onPermissionRequest(request);
                }

                @Override
                public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, WebChromeClient.FileChooserParams fileChooserParams) {
                    Log.i(TAG, "DIAG onShowFileChooser called, mode=" + fileChooserParams.getMode() + ", acceptTypes=" + java.util.Arrays.toString(fileChooserParams.getAcceptTypes()));
                    if (MainActivity.this.filePathCallback != null) {
                        MainActivity.this.filePathCallback.onReceiveValue(null);
                    }
                    MainActivity.this.filePathCallback = filePathCallback;

                    Intent intent = fileChooserParams.createIntent();
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    // Force multiple selection mode
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                    try {
                        fileChooserLauncher.launch(intent);
                        return true;
                    } catch (Exception e) {
                        Log.e(TAG, "DIAG onShowFileChooser failed to launch", e);
                        filePathCallback.onReceiveValue(null);
                        MainActivity.this.filePathCallback = null;
                        return false;
                    }
                }

                @Override
                public boolean onConsoleMessage(ConsoleMessage cm) {
                    Log.i(TAG, "JS: " + cm.message() + " -- [line:" + cm.lineNumber() + " source:" + cm.sourceId() + "]");
                    return true;
                }
            });
        }
    }

    private void handleFileChooserResult(ActivityResult result) {
        Log.i(TAG, "MainActivity: handleFileChooserResult resultCode=" + result.getResultCode() + " data=" + result.getData());
        if (filePathCallback == null) {
            Log.w(TAG, "MainActivity: handleFileChooserResult - no callback");
            return;
        }
        ValueCallback<Uri[]> callback = filePathCallback;
        filePathCallback = null;
        if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
            Intent data = result.getData();
            ArrayList<Uri> uris = new ArrayList<>();

            // Handle multiple file selection (ClipData)
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                Log.i(TAG, "MainActivity: handleFileChooserResult multiple files count=" + count);
                for (int i = 0; i < count; i++) {
                    Uri uri = data.getClipData().getItemAt(i).getUri();
                    if (uri != null) {
                        uris.add(uri);
                        try {
                            getContentResolver().takePersistableUriPermission(
                                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                            );
                        } catch (Exception e) {
                            Log.w(TAG, "Could not take persistable permission for " + uri, e);
                        }
                    }
                }
            }

            // Handle single file selection
            if (uris.isEmpty() && data.getData() != null) {
                uris.add(data.getData());
                try {
                    getContentResolver().takePersistableUriPermission(
                        data.getData(), Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    );
                } catch (Exception e) {
                    Log.w(TAG, "Could not take persistable permission", e);
                }
            }

            if (!uris.isEmpty()) {
                Log.i(TAG, "MainActivity: handleFileChooserResult uris=" + uris);
                callback.onReceiveValue(uris.toArray(new Uri[0]));
            } else {
                Log.i(TAG, "MainActivity: handleFileChooserResult no uris");
                callback.onReceiveValue(null);
            }
        } else {
            Log.i(TAG, "MainActivity: file chooser cancelled");
            callback.onReceiveValue(null);
        }
    }

    // Called by FilePickerPlugin for directory selection
    public void launchDirectoryPicker() {
        Log.i(TAG, "DIAG launchDirectoryPicker");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(intent, 9003);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        Log.i(TAG, "DIAG onActivityResult req=" + requestCode + " result=" + resultCode + " data=" + data);
        super.onActivityResult(requestCode, resultCode, data);
    }
}


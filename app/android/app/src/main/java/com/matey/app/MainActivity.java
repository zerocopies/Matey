package com.matey.app;

import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MateyJS";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Register the custom FilePicker plugin for Android system file dialogs
        registerPlugin(FilePickerPlugin.class);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WebView.setWebContentsDebuggingEnabled(true);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.getSettings().setMixedContentMode(
                WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            );
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
                public boolean onConsoleMessage(ConsoleMessage cm) {
                    Log.i(TAG, "JS: " + cm.message() + " -- [line:" + cm.lineNumber() + " source:" + cm.sourceId() + "]");
                    return true;
                }
            });
        }
    }
}


package com.matey.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Enable debugging for the Capacitor WebView (Chrome DevTools / logcat JS output)
        WebView.setWebContentsDebuggingEnabled(true);

        // Allow HTTP calls to the local LAN backend from the WebView's secure
        // origin (capacitor://localhost). Chromium blocks these as mixed content
        // by default; the network security config already permits cleartext to
        // the specific dev hosts.
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.getSettings().setMixedContentMode(
                WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            );
        }
    }
}

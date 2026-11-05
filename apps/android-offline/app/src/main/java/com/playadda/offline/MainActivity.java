package com.playadda.offline;

import android.annotation.SuppressLint;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends AppCompatActivity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String ASSET_ORIGIN = "https://" + ASSET_HOST;

    // Only these hosts may reach the network. Everything else keeps the
    // fake 403 "offline" response.
    private static final Set<String> NETWORK_HOSTS = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList(
                    "playadda.duckdns.org",
                    "playaddatest.duckdns.org")));

    private WebView web;

    static boolean isNetworkHost(String host) {
        return host != null && NETWORK_HOSTS.contains(host);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        // Keep cookies for the two Playadda hosts (the page origin is
        // appassets, so their cookies are third-party from its point of view).
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        installApiBase();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (isNetworkHost(host) && "https".equals(uri.getScheme())) {
                    return null; // let the WebView use the network
                }
                if (!ASSET_HOST.equals(host)) {
                    return new WebResourceResponse("text/plain", "utf-8", 403, "offline", null, null);
                }
                String path = uri.getPath();
                if (path == null || path.isEmpty() || "/".equals(path)) {
                    path = "/index.html";
                } else if (path.endsWith("/")) {
                    path = path + "index.html";
                }
                return loader.shouldInterceptRequest(uri.buildUpon().path(path).clearQuery().build());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Top-level navigation stays inside the bundled assets.
                return !ASSET_HOST.equals(request.getUrl().getHost());
            }
        });

        if (savedInstanceState == null) {
            web.loadUrl(ASSET_ORIGIN + "/index.html");
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    // Exposes the configured API base (test or prod, default prod) to the page
    // as window.PLAYADDA_API_BASE before any page script runs.
    private void installApiBase() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            return;
        }
        String script = "window.PLAYADDA_API_BASE=" + quote(BuildConfig.API_BASE) + ";";
        WebViewCompat.addDocumentStartJavaScript(web, script, Collections.singleton(ASSET_ORIGIN));
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }
}

package com.lewdoherz.forte;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

public final class MainActivity extends ComponentActivity {
    private WebView web;
    private FrameLayout root;
    private LinearLayout error;
    private String lastPage = BuildConfig.FORTE_ORIGIN;
    private final Uri origin = Uri.parse(BuildConfig.FORTE_ORIGIN);

    private boolean sameOrigin(Uri url) {
        return safeHttps(url) && origin.getHost().equalsIgnoreCase(url.getHost()) && (url.getPort() == -1 || url.getPort() == 443);
    }
    private boolean safeHttps(Uri url) {
        return "https".equalsIgnoreCase(url.getScheme()) && url.getHost() != null && url.getUserInfo() == null;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) {
            String savedPage = state.getString("lastPage");
            if (savedPage != null && sameOrigin(Uri.parse(savedPage))) lastPage = savedPage;
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (web != null && web.canGoBack()) web.goBack();
                else finish();
            }
        });
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(24,24,27));
        setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsets.CONSUMED;
        });
        error = new LinearLayout(this);
        error.setOrientation(LinearLayout.VERTICAL);
        error.setGravity(android.view.Gravity.CENTER);
        error.setPadding(32,32,32,32);
        TextView message = new TextView(this);
        message.setText(R.string.load_error);
        message.setTextColor(Color.WHITE);
        message.setTextSize(18);
        error.addView(message);
        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setOnClickListener(v -> { if (web == null) createWebView(); error.setVisibility(View.GONE); web.setVisibility(View.VISIBLE); web.loadUrl(lastPage); });
        error.addView(retry);
        root.addView(error, new FrameLayout.LayoutParams(-1,-1));
        error.setVisibility(View.GONE);
        createWebView();
        web.loadUrl(lastPage);
    }
    private void showError() { if (web != null) web.setVisibility(View.GONE); error.setVisibility(View.VISIBLE); }
    private void route(Uri url) {
        if (sameOrigin(url)) web.loadUrl(url.toString());
        else if (safeHttps(url)) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE)); }
            catch (android.content.ActivityNotFoundException ignored) { showError(); }
        }
    }
    private void createWebView() {
        web = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        root.addView(web, 0, new FrameLayout.LayoutParams(-1,-1));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (sameOrigin(url)) return false;
                if (request.isForMainFrame()) route(url);
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!safeHttps(request.getUrl())) return new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (sameOrigin(Uri.parse(url))) lastPage = url;
            }
            @Override public void onPageFinished(WebView view, String url) { CookieManager.getInstance().flush(); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError failure) { if (request.isForMainFrame()) showError(); }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) { if (request.isForMainFrame() && response.getStatusCode() >= 500) showError(); }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                root.removeView(view); view.destroy(); web = null; error.setVisibility(View.VISIBLE); return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, android.os.Message message) {
                if (!gesture) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView ignored, WebResourceRequest request) {
                        route(request.getUrl()); popup.destroy(); return true;
                    }
                });
                ((WebView.WebViewTransport) message.obj).setWebView(popup);
                message.sendToTarget(); return true;
            }
        });
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        String currentPage = web == null ? null : web.getUrl();
        if (currentPage != null && sameOrigin(Uri.parse(currentPage))) lastPage = currentPage;
        state.putString("lastPage", lastPage);
        super.onSaveInstanceState(state);
    }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() { if (web != null) { root.removeView(web); web.destroy(); } super.onDestroy(); }
}

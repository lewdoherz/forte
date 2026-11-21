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
    private NativeAuth auth;
    private boolean browserAway;
    private boolean browserLaunched;
    private final NativeAuth.Listener authListener = success -> {
        if (success) {
            browserAway = false;
            browserLaunched = false;
            if (web == null) createWebView();
            error.setVisibility(View.GONE);
            web.setVisibility(View.VISIBLE);
            web.loadUrl(BuildConfig.FORTE_ORIGIN + "/auth/complete");
        }
        else notifyAuthCancelled();
    };

    private boolean sameOrigin(Uri url) {
        return safeHttps(url) && origin.getHost().equalsIgnoreCase(url.getHost()) && (url.getPort() == -1 || url.getPort() == 443);
    }
    private boolean safeHttps(Uri url) {
        return "https".equalsIgnoreCase(url.getScheme()) && url.getHost() != null && url.getUserInfo() == null;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        auth = NativeAuth.get(this);
        if (state != null) {
            String savedPage = state.getString("lastPage");
            if (savedPage != null && sameOrigin(Uri.parse(savedPage))) lastPage = savedPage;
            browserAway = state.getBoolean("browserAway");
            browserLaunched = state.getBoolean("browserLaunched");
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
        boolean restored = state != null && web.restoreState(state) != null;
        if (!restored) web.loadUrl(lastPage);
        handleCallback(getIntent());
    }
    private void showError() { if (web != null) web.setVisibility(View.GONE); error.setVisibility(View.VISIBLE); }
    private void notifyAuthCancelled() {
        if (web != null && web.getUrl() != null && sameOrigin(Uri.parse(web.getUrl()))) {
            web.evaluateJavascript("window.dispatchEvent(new Event('forte:auth-cancelled'))", null);
        }
    }
    private void openBrowser(Uri url, boolean authentication) {
        try {
            browserLaunched = authentication;
            new androidx.browser.customtabs.CustomTabsIntent.Builder().build().launchUrl(this, url);
        } catch (android.content.ActivityNotFoundException ignored) {
            browserLaunched = false;
            if (authentication) { auth.cancel(); notifyAuthCancelled(); }
            else showError();
        }
    }
    private boolean nativeRoute(Uri url) {
        if (!sameOrigin(url)) return false;
        if ("/auth/native/manage".equals(url.getPath())) {
            openBrowser(origin.buildUpon().path("/account").clearQuery().fragment(null).build(), false);
            return true;
        }
        if (!"/auth/native/start".equals(url.getPath())) return false;
        if (auth.busy()) return true;
        String provider = url.getQueryParameter("provider");
        if (url.getQueryParameterNames().size() != 1 || url.getQueryParameters("provider").size() != 1
                || !java.util.Arrays.asList("google", "apple", "facebook", "linkedin").contains(provider)) {
            notifyAuthCancelled();
            return true;
        }
        try { openBrowser(auth.begin(provider), true); }
        catch (Exception ignored) { auth.cancel(); notifyAuthCancelled(); }
        return true;
    }
    private void handleCallback(Intent intent) {
        Uri callback = intent == null ? null : intent.getData();
        if (callback == null) return;
        if (auth.callback(callback)) {
            browserAway = false;
            browserLaunched = false;
        }
        intent.setData(null);
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCallback(intent);
    }
    @Override protected void onStart() { super.onStart(); auth.attach(authListener); }
    @Override protected void onResume() {
        super.onResume();
        if (browserAway && !auth.busy()) {
            browserAway = false;
            browserLaunched = false;
            auth.cancel();
            notifyAuthCancelled();
        }
    }
    @Override protected void onStop() {
        if (browserLaunched && !isChangingConfigurations()) browserAway = true;
        auth.detach(authListener);
        super.onStop();
    }
    private void route(Uri url) {
        if (nativeRoute(url)) return;
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
        settings.setUserAgentString(settings.getUserAgentString() + " ForteAndroid/1");
        settings.setSupportMultipleWindows(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (request.isForMainFrame() && nativeRoute(url)) return true;
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
        state.putBoolean("browserAway", browserAway || browserLaunched);
        state.putBoolean("browserLaunched", browserLaunched);
        if (web != null) web.saveState(state);
        super.onSaveInstanceState(state);
    }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() { if (web != null) { root.removeView(web); web.destroy(); } super.onDestroy(); }
}

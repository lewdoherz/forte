package com.lewdoherz.forte;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends ComponentActivity {
    private static final int REQUEST_POST_NOTIFICATIONS = 4103;
    private static final int ALARM_REQUEST_CODE = 4104;
    private static final String OFFLINE_START_PATH = "/offline-start";

    private WebView web;
    private FrameLayout root;
    private LinearLayout error;
    private String lastPage = BuildConfig.FORTE_ORIGIN;
    private final Uri origin = Uri.parse(BuildConfig.FORTE_ORIGIN);
    private NativeAuth auth;
    private boolean browserAway;
    private boolean browserLaunched;
    private boolean showingOfflineStart;
    private boolean notificationRequested;
    private boolean activityResumed;
    private final Handler restHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingRestRunnable;

    private final NativeAuth.Listener authListener = success -> {
        if (success) {
            browserAway = false;
            browserLaunched = false;
            showingOfflineStart = false;
            if (web == null) createWebView();
            error.setVisibility(View.GONE);
            web.setVisibility(View.VISIBLE);
            web.loadUrl(BuildConfig.FORTE_ORIGIN + "/auth/complete");
        } else {
            notifyAuthCancelled();
        }
    };

    private boolean sameOrigin(Uri url) {
        return safeHttps(url) && origin.getHost().equalsIgnoreCase(url.getHost()) && (url.getPort() == -1 || url.getPort() == 443);
    }

    private boolean safeHttps(Uri url) {
        return "https".equalsIgnoreCase(url.getScheme()) && url.getHost() != null && url.getUserInfo() == null;
    }

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        auth = NativeAuth.get(this);
        RestTimerReceiver.ensureChannels(this);
        if (state != null) {
            String savedPage = state.getString("lastPage");
            if (savedPage != null && sameOrigin(Uri.parse(savedPage)) && !OFFLINE_START_PATH.equals(Uri.parse(savedPage).getPath())) {
                lastPage = savedPage;
            }
            browserAway = state.getBoolean("browserAway");
            browserLaunched = state.getBoolean("browserLaunched");
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web != null && web.canGoBack() && !showingOfflineStart) web.goBack();
                else finish();
            }
        });
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(13, 21, 18));
        setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsets.CONSUMED;
        });
        error = new LinearLayout(this);
        error.setOrientation(LinearLayout.VERTICAL);
        error.setGravity(android.view.Gravity.CENTER);
        error.setPadding(32, 32, 32, 32);
        TextView message = new TextView(this);
        message.setText(R.string.load_error);
        message.setTextColor(Color.WHITE);
        message.setTextSize(18);
        error.addView(message);
        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setOnClickListener(v -> {
            if (web == null) createWebView();
            showingOfflineStart = false;
            error.setVisibility(View.GONE);
            web.setVisibility(View.VISIBLE);
            web.loadUrl(lastPage);
        });
        error.addView(retry);
        root.addView(error, new FrameLayout.LayoutParams(-1, -1));
        error.setVisibility(View.GONE);
        createWebView();
        boolean restored = state != null && web.restoreState(state) != null;
        if (!restored) web.loadUrl(lastPage);
        handleCallback(getIntent());
    }

    private void showError() {
        if (web != null) web.setVisibility(View.GONE);
        error.setVisibility(View.VISIBLE);
    }

    /** Loads the bundled offline-capable fresh-install shell on same origin without file access. */
    private void showFreshOfflineShell() {
        if (web == null) {
            showError();
            return;
        }
        String html = readOfflineStartAsset();
        if (html == null) {
            showError();
            return;
        }
        showingOfflineStart = true;
        error.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        web.loadDataWithBaseURL(BuildConfig.FORTE_ORIGIN + OFFLINE_START_PATH, html, "text/html", "UTF-8", null);
    }

    private String readOfflineStartAsset() {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(getAssets().open("offline-start.html"), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line).append('\n');
            return sb.toString();
        } catch (Exception ignored) {
            return null;
        }
    }

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
            if (authentication) {
                auth.cancel();
                notifyAuthCancelled();
            } else {
                showError();
            }
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
        try {
            openBrowser(auth.begin(provider), true);
        } catch (Exception ignored) {
            auth.cancel();
            notifyAuthCancelled();
        }
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

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCallback(intent);
    }

    @Override
    protected void onStart() {
        super.onStart();
        auth.attach(authListener);
    }

    @Override
    protected void onResume() {
        super.onResume();
        activityResumed = true;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(RestTimerReceiver.NOTIFICATION_ID);
        if (browserAway && !auth.busy()) {
            browserAway = false;
            browserLaunched = false;
            auth.cancel();
            notifyAuthCancelled();
        }
    }

    @Override
    protected void onStop() {
        if (browserLaunched && !isChangingConfigurations()) browserAway = true;
        auth.detach(authListener);
        super.onStop();
    }

    private void route(Uri url) {
        if (nativeRoute(url)) return;
        if (sameOrigin(url)) {
            showingOfflineStart = false;
            web.loadUrl(url.toString());
        } else if (safeHttps(url)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE));
            } catch (android.content.ActivityNotFoundException ignored) {
                showError();
            }
        }
    }

    private boolean isWebOnSameOrigin() {
        if (web == null) return false;
        String current = web.getUrl();
        if (current == null) return false;
        return sameOrigin(Uri.parse(current));
    }

    private void maybeRequestNotificationPermission() {
        if (notificationRequested || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationRequested = true;
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_POST_NOTIFICATIONS);
        }
    }

    private PendingIntent restAlarmIntent(String key, boolean sound, boolean vibrate, String title, String body) {
        Intent intent = new Intent(this, RestTimerReceiver.class);
        intent.putExtra(RestTimerReceiver.EXTRA_KEY, key);
        intent.putExtra(RestTimerReceiver.EXTRA_SOUND, sound);
        intent.putExtra(RestTimerReceiver.EXTRA_VIBRATE, vibrate);
        intent.putExtra(RestTimerReceiver.EXTRA_TITLE, title);
        intent.putExtra(RestTimerReceiver.EXTRA_BODY, body);
        return PendingIntent.getBroadcast(
                this,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void cancelRestAlarm() {
        if (pendingRestRunnable != null) {
            restHandler.removeCallbacks(pendingRestRunnable);
            pendingRestRunnable = null;
        }
        AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) {
            alarms.cancel(restAlarmIntent("", true, true, "", ""));
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(RestTimerReceiver.NOTIFICATION_ID);
    }

    private void triggerLocalAlert(boolean sound, boolean vibrate) {
        if (sound) {
            try {
                Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                Ringtone ringtone = uri == null ? null : RingtoneManager.getRingtone(getApplicationContext(), uri);
                if (ringtone != null) {
                    ringtone.play();
                } else {
                    ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80);
                    tone.startTone(ToneGenerator.TONE_PROP_BEEP2, 300);
                }
            } catch (Exception ignored) {
                // Non-fatal audio playback fallback.
            }
        }
        if (vibrate) {
            try {
                Vibrator vibrator;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                    vibrator = vm == null ? null : vm.getDefaultVibrator();
                } else {
                    vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                }
                if (vibrator != null && vibrator.hasVibrator()) {
                    vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, 180, 90, 220}, -1));
                }
            } catch (Exception ignored) {
                // Non-fatal vibration fallback.
            }
        }
    }

    /** Tightly scoped non-token JS interface for rest-timer sound/vibration/background notifications only. */
    private final class RestAlertBridge {
        @JavascriptInterface
        public void scheduleRestTimer(String key, long triggerAtMs, boolean sound, boolean vibrate, String title, String body) {
            runOnUiThread(() -> {
                if (!isWebOnSameOrigin()) return;
                cancelRestAlarm();
                if (!sound && !vibrate) return;
                long delay = triggerAtMs - System.currentTimeMillis();
                if (delay <= 500) return;
                maybeRequestNotificationPermission();
                // Exact in-process background timer while app is minimized/locked, deduplicated by key.
                pendingRestRunnable = () -> {
                    pendingRestRunnable = null;
                    if (!activityResumed) {
                        RestTimerReceiver.notifyNow(getApplicationContext(), key, sound, vibrate, title, body);
                    }
                    AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                    if (am != null) am.cancel(restAlarmIntent(key, sound, vibrate, title, body));
                };
                restHandler.postDelayed(pendingRestRunnable, delay);

                // AlarmManager backup in case Android suspends the process while locked.
                AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (alarms == null) return;
                PendingIntent pi = restAlarmIntent(key, sound, vibrate, title, body);
                try {
                    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                } catch (SecurityException ignored) {
                    alarms.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                }
            });
        }

        @JavascriptInterface
        public void cancelRestTimer() {
            runOnUiThread(() -> {
                if (!isWebOnSameOrigin()) return;
                cancelRestAlarm();
            });
        }

        @JavascriptInterface
        public void previewRestAlert(boolean sound, boolean vibrate) {
            runOnUiThread(() -> {
                if (!isWebOnSameOrigin()) return;
                triggerLocalAlert(sound, vibrate);
            });
        }
    }

    private void createWebView() {
        web = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        root.addView(web, 0, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " ForteAndroid/1");
        settings.setSupportMultipleWindows(true);
        try {
            ServiceWorkerController.getInstance().getServiceWorkerWebSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        } catch (Exception ignored) {
            // Older/custom WebView implementation without ServiceWorkerController.
        }
        web.addJavascriptInterface(new RestAlertBridge(), "ForteNativeAlerts");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (request.isForMainFrame() && nativeRoute(url)) return true;
                if (sameOrigin(url)) {
                    if (!OFFLINE_START_PATH.equals(url.getPath())) showingOfflineStart = false;
                    return false;
                }
                if (request.isForMainFrame()) route(url);
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!safeHttps(request.getUrl())) {
                    return new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
                }
                return null;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                Uri parsed = Uri.parse(url);
                if (sameOrigin(parsed) && !OFFLINE_START_PATH.equals(parsed.getPath())) {
                    lastPage = url;
                    showingOfflineStart = false;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                if (url != null && sameOrigin(Uri.parse(url))) {
                    CookieManager.getInstance().flush();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError failure) {
                if (request.isForMainFrame()) {
                    // Only reached when both network AND service worker cannot serve the page
                    // (e.g. a fresh install launched offline before first online setup).
                    showFreshOfflineShell();
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) showError();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                root.removeView(view);
                view.destroy();
                web = null;
                error.setVisibility(View.VISIBLE);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, android.os.Message message) {
                if (!gesture) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView ignored, WebResourceRequest request) {
                        route(request.getUrl());
                        popup.destroy();
                        return true;
                    }
                });
                ((WebView.WebViewTransport) message.obj).setWebView(popup);
                message.sendToTarget();
                return true;
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        String currentPage = web == null ? null : web.getUrl();
        if (currentPage != null && sameOrigin(Uri.parse(currentPage)) && !OFFLINE_START_PATH.equals(Uri.parse(currentPage).getPath())) {
            lastPage = currentPage;
        }
        state.putString("lastPage", lastPage);
        state.putBoolean("browserAway", browserAway || browserLaunched);
        state.putBoolean("browserLaunched", browserLaunched);
        if (web != null && !showingOfflineStart) web.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override
    protected void onPause() {
        activityResumed = false;
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (pendingRestRunnable != null) {
            restHandler.removeCallbacks(pendingRestRunnable);
            pendingRestRunnable = null;
        }
        if (web != null) {
            root.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}

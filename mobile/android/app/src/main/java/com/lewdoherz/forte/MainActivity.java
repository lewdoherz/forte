package com.lewdoherz.forte;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetFileDescriptor;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends ComponentActivity {
    private static final int REQUEST_POST_NOTIFICATIONS = 4103;
    private static final int ALARM_REQUEST_CODE = 4104;
    private static final String BUNDLE_ROOT = "www";

    private WebView web;
    private FrameLayout root;
    private LinearLayout error;
    private String lastPage = BuildConfig.FORTE_ORIGIN;
    private final Uri origin = Uri.parse(BuildConfig.FORTE_ORIGIN);
    private NativeAuth auth;
    private boolean browserAway;
    private boolean browserLaunched;
    private boolean notificationRequested;
    private volatile boolean offlineModeForced;

    private final NativeAuth.Listener authListener = success -> {
        if (success) {
            browserAway = false;
            browserLaunched = false;
            offlineModeForced = false;
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

    /** True when the device is in airplane mode or has no active internet-capable network. */
    private boolean isOfflineNow() {
        try {
            if (Settings.Global.getInt(getContentResolver(), Settings.Global.AIRPLANE_MODE_ON, 0) == 1) {
                return true;
            }
        } catch (Exception ignored) {
        }
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network active = cm.getActiveNetwork();
            if (active == null) return true;
            NetworkCapabilities caps = cm.getNetworkCapabilities(active);
            if (caps == null) return true;
            return !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean hasBundledAsset(String assetPath) {
        try (InputStream ignored = getAssets().open(assetPath)) {
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private WebResourceResponse openBundledResponse(String assetPath, String mimeType) {
        try {
            InputStream stream = getAssets().open(assetPath);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            String encoding = (mimeType.startsWith("text/") || mimeType.contains("javascript") || mimeType.contains("json") || mimeType.contains("svg"))
                    ? "UTF-8"
                    : null;
            return new WebResourceResponse(mimeType, encoding, 200, "OK", headers, stream);
        } catch (IOException ignored) {
            return null;
        }
    }

    private static String mimeTypeFor(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    private static boolean isOfflineNavigableAppPath(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) return true;
        return "/offline-app".equals(path)
                || "/workout".equals(path)
                || "/profile".equals(path)
                || "/progress".equals(path)
                || "/account".equals(path)
                || "/routines".equals(path)
                || path.startsWith("/routines/")
                || "/exercises".equals(path)
                || path.startsWith("/exercises/")
                || "/workouts".equals(path)
                || path.startsWith("/workouts/");
    }

    /**
     * Serves bundled exercise media, body heatmaps, built-in catalog, and
     * offline app shell directly on the real `https://<FORTE_HOST>` origin.
     *
     * This keeps IndexedDB, localStorage, and cookies unified across online and
     * offline launches and eliminates network waits on airplane-mode cold launch.
     */
    private WebResourceResponse interceptSameOriginAsset(Uri url, boolean isMainFrame, String method) {
        if (!sameOrigin(url)) return null;
        if (method != null && !"GET".equalsIgnoreCase(method)) return null;
        String path = url.getPath();
        if (path == null) return null;
        if (path.contains("..")) return null;

        // 1. Always serve bundled static catalogue, thumbnails, body heatmaps, audio, and matching chunks locally.
        if (path.startsWith("/_next/static/")) {
            String assetPath = BUNDLE_ROOT + "/next-static/" + path.substring("/_next/static/".length());
            WebResourceResponse bundled = openBundledResponse(assetPath, mimeTypeFor(path));
            if (bundled != null) return bundled;
        }
        if (path.startsWith("/exercise-media/thumbnails/")
                || path.startsWith("/body-heatmap/")
                || path.startsWith("/audio/")
                || "/offline-catalog.json".equals(path)) {
            String assetPath = BUNDLE_ROOT + path;
            WebResourceResponse bundled = openBundledResponse(assetPath, mimeTypeFor(path));
            if (bundled != null) return bundled;
        }

        // 2. When offline (or after a network failure), serve the full normal Forte offline-first app shell immediately.
        if (isMainFrame && isOfflineNavigableAppPath(path) && (isOfflineNow() || offlineModeForced || "/offline-app".equals(path))) {
            WebResourceResponse shell = openBundledResponse(BUNDLE_ROOT + "/offline-app.html", "text/html");
            if (shell != null) return shell;
        }

        return null;
    }

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        auth = NativeAuth.get(this);
        RestTimerReceiver.ensureChannels(this);
        if (state != null) {
            String savedPage = state.getString("lastPage");
            if (savedPage != null && sameOrigin(Uri.parse(savedPage))) {
                lastPage = savedPage;
            }
            browserAway = state.getBoolean("browserAway");
            browserLaunched = state.getBoolean("browserLaunched");
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web != null && web.canGoBack()) web.goBack();
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
            offlineModeForced = false;
            error.setVisibility(View.GONE);
            web.setVisibility(View.VISIBLE);
            web.loadUrl(lastPage);
        });
        error.addView(retry);
        root.addView(error, new FrameLayout.LayoutParams(-1, -1));
        error.setVisibility(View.GONE);
        createWebView();
        boolean restored = state != null && web.restoreState(state) != null;
        if (!restored) {
            if (isOfflineNow() && hasBundledAsset(BUNDLE_ROOT + "/offline-app.html")) {
                offlineModeForced = true;
                web.loadUrl(BuildConfig.FORTE_ORIGIN + "/offline-app");
            } else {
                offlineModeForced = false;
                web.loadUrl(lastPage);
            }
        }
        handleCallback(getIntent());
    }

    private void showError() {
        if (web != null) web.setVisibility(View.GONE);
        error.setVisibility(View.VISIBLE);
    }

    private void loadBundledOfflineApp() {
        if (web == null || !hasBundledAsset(BUNDLE_ROOT + "/offline-app.html")) {
            showError();
            return;
        }
        offlineModeForced = true;
        error.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        web.loadUrl(BuildConfig.FORTE_ORIGIN + "/offline-app");
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
        if (!isOfflineNow()) {
            offlineModeForced = false;
        }
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
            if (!isOfflineNow()) offlineModeForced = false;
            web.loadUrl(url.toString());
        } else if (safeHttps(url)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE));
            } catch (android.content.ActivityNotFoundException ignored) {
                showError();
            }
        }
    }

    private Vibrator getDeviceVibrator() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm == null ? null : vm.getDefaultVibrator();
        }
        return (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    private boolean isDndBlocking() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return false;
        int filter = nm.getCurrentInterruptionFilter();
        return filter == NotificationManager.INTERRUPTION_FILTER_NONE
                || filter == NotificationManager.INTERRUPTION_FILTER_ALARMS
                || filter == NotificationManager.INTERRUPTION_FILTER_PRIORITY;
    }

    private String getRingerModeLabel() {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return "unknown";
        int mode = am.getRingerMode();
        if (mode == AudioManager.RINGER_MODE_SILENT) return "silent";
        if (mode == AudioManager.RINGER_MODE_VIBRATE) return "vibrate";
        return "normal";
    }

    private boolean isNotificationVolumeZero() {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        return am != null && am.getStreamVolume(AudioManager.STREAM_NOTIFICATION) == 0;
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
        AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) {
            alarms.cancel(restAlarmIntent("", true, true, "", ""));
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(RestTimerReceiver.NOTIFICATION_ID);
    }

    private boolean playLocalChimeWav() {
        MediaPlayer player = new MediaPlayer();
        try (AssetFileDescriptor afd = getResources().openRawResourceFd(R.raw.rest_chime)) {
            if (afd == null) {
                player.release();
                return playSystemNotificationFallback();
            }
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            player.setAudioAttributes(attrs);
            player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            player.setOnCompletionListener(MediaPlayer::release);
            player.setOnErrorListener((mp, what, extra) -> {
                mp.release();
                return true;
            });
            player.prepare();
            player.start();
            return true;
        } catch (Exception ignored) {
            try {
                player.release();
            } catch (Exception ignored2) {
            }
            return playSystemNotificationFallback();
        }
    }

    private boolean playSystemNotificationFallback() {
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            Ringtone ringtone = uri == null ? null : RingtoneManager.getRingtone(getApplicationContext(), uri);
            if (ringtone != null) {
                ringtone.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                ringtone.play();
                return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private boolean vibrateNotificationPattern() {
        try {
            Vibrator vibrator = getDeviceVibrator();
            if (vibrator == null || !vibrator.hasVibrator()) return false;
            VibrationEffect effect = VibrationEffect.createWaveform(RestTimerReceiver.VIBRATION_PATTERN, -1);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                VibrationAttributes attrs = new VibrationAttributes.Builder()
                        .setUsage(VibrationAttributes.USAGE_NOTIFICATION)
                        .build();
                vibrator.vibrate(effect, attrs);
            } else {
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                vibrator.vibrate(effect, attrs);
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * Fires local foreground/preview audio & vibration while strictly respecting
     * Do Not Disturb, Ringer mode, Notification volume, and vibrator presence.
     */
    private String triggerLocalAlertWithReport(boolean sound, boolean vibrate) {
        boolean soundDelivered = false;
        boolean vibrateDelivered = false;
        JSONArray blocked = new JSONArray();

        boolean dnd = isDndBlocking();
        String ringer = getRingerModeLabel();
        boolean volZero = isNotificationVolumeZero();

        if (dnd) {
            blocked.put("dnd");
        } else if ("silent".equals(ringer)) {
            blocked.put("silent");
        } else {
            if (sound) {
                if ("vibrate".equals(ringer)) {
                    blocked.put("vibrate_mode");
                } else if (volZero) {
                    blocked.put("volume_zero");
                } else {
                    soundDelivered = playLocalChimeWav();
                }
            }
            if (vibrate) {
                Vibrator vib = getDeviceVibrator();
                if (vib == null || !vib.hasVibrator()) {
                    blocked.put("no_vibrator");
                } else {
                    vibrateDelivered = vibrateNotificationPattern();
                }
            }
        }

        JSONObject result = new JSONObject();
        try {
            result.put("soundRequested", sound);
            result.put("soundDelivered", soundDelivered);
            result.put("vibrateRequested", vibrate);
            result.put("vibrateDelivered", vibrateDelivered);
            result.put("blockedReasons", blocked);
        } catch (Exception ignored) {
        }
        return result.toString();
    }

    private String buildRestAlertStatusJson(boolean sound, boolean vibrate) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        boolean notificationsEnabled = nm == null || nm.areNotificationsEnabled();
        boolean postGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        boolean channelBlocked = false;
        if (nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = nm.getNotificationChannel(RestTimerReceiver.channelIdFor(sound, vibrate));
            if (ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                channelBlocked = true;
            }
        }
        boolean exactAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                || (alarms != null && alarms.canScheduleExactAlarms());
        Vibrator vib = getDeviceVibrator();
        boolean hasVibrator = vib != null && vib.hasVibrator();

        JSONObject json = new JSONObject();
        try {
            json.put("platform", "android");
            json.put("notificationsEnabled", notificationsEnabled);
            json.put("postNotificationsGranted", postGranted);
            json.put("channelBlocked", channelBlocked);
            json.put("dndBlocking", isDndBlocking());
            json.put("ringerMode", getRingerModeLabel());
            json.put("notificationVolumeZero", isNotificationVolumeZero());
            json.put("hasVibrator", hasVibrator);
            json.put("exactAlarmsAllowed", exactAllowed);
        } catch (Exception ignored) {
        }
        return json.toString();
    }

    /** Tightly scoped non-token JS interface for rest-timer audio/vibration/background notifications only. */
    private final class RestAlertBridge {
        @JavascriptInterface
        public String getRestAlertStatus(boolean sound, boolean vibrate) {
            return buildRestAlertStatusJson(sound, vibrate);
        }

        @JavascriptInterface
        public String previewRestAlert(boolean sound, boolean vibrate) {
            return triggerLocalAlertWithReport(sound, vibrate);
        }

        @JavascriptInterface
        public String triggerForegroundRestAlert(String key, boolean sound, boolean vibrate) {
            RestTimerReceiver.markKeyAlerted(key);
            runOnUiThread(MainActivity.this::cancelRestAlarm);
            return triggerLocalAlertWithReport(sound, vibrate);
        }

        @JavascriptInterface
        public void scheduleRestTimer(String key, long triggerAtMs, boolean sound, boolean vibrate, String title, String body) {
            runOnUiThread(() -> {
                cancelRestAlarm();
                if (!sound && !vibrate) return;
                long delay = triggerAtMs - System.currentTimeMillis();
                if (delay <= 500) return;
                maybeRequestNotificationPermission();
                RestTimerReceiver.ensureChannels(getApplicationContext());

                AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (alarms == null) return;
                PendingIntent pi = restAlarmIntent(key, sound, vibrate, title, body);
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        if (alarms.canScheduleExactAlarms()) {
                            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                        } else {
                            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                        }
                    } else {
                        alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                    }
                } catch (SecurityException ignored) {
                    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                }
            });
        }

        @JavascriptInterface
        public void cancelRestTimer() {
            runOnUiThread(MainActivity.this::cancelRestAlarm);
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    notificationRequested = true;
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_POST_NOTIFICATIONS);
                } else {
                    openNotificationSettings();
                }
            });
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    startActivity(intent);
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void openExactAlarmSettings() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        Intent intent = new Intent(
                                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                                Uri.parse("package:" + getPackageName())
                        );
                        startActivity(intent);
                    } catch (Exception ignored) {
                    }
                }
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
        settings.setUserAgentString(settings.getUserAgentString() + " ForteAndroid/2");
        settings.setSupportMultipleWindows(true);
        try {
            ServiceWorkerController swc = ServiceWorkerController.getInstance();
            swc.getServiceWorkerWebSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
            swc.setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    WebResourceResponse bundled = interceptSameOriginAsset(
                            request.getUrl(),
                            request.isForMainFrame(),
                            request.getMethod()
                    );
                    if (bundled != null) return bundled;
                    return super.shouldInterceptRequest(request);
                }
            });
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
                    if (!isOfflineNow() && !"/offline-app".equals(url.getPath())) {
                        offlineModeForced = false;
                    }
                    return false;
                }
                if (request.isForMainFrame()) route(url);
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!safeHttps(url)) {
                    return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                }
                WebResourceResponse bundled = interceptSameOriginAsset(url, request.isForMainFrame(), request.getMethod());
                if (bundled != null) return bundled;
                return null;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                Uri parsed = Uri.parse(url);
                if (sameOrigin(parsed)) {
                    lastPage = url;
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
                    loadBundledOfflineApp();
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
        if (currentPage != null && sameOrigin(Uri.parse(currentPage))) {
            lastPage = currentPage;
        }
        state.putString("lastPage", lastPage);
        state.putBoolean("browserAway", browserAway || browserLaunched);
        state.putBoolean("browserLaunched", browserLaunched);
        if (web != null) web.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}

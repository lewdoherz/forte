package com.lewdoherz.forte;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.webkit.CookieManager;
import org.json.JSONObject;
import java.io.InputStream;
import java.net.HttpCookie;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

/** Process-scoped exchange survives Activity recreation; no credentials enter the WebView. */
final class NativeAuth {
    interface Listener { void finished(boolean success); }
    private static final long LIFETIME_MS = 5 * 60 * 1000;
    private static NativeAuth instance;
    private final SharedPreferences pending;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private Listener listener;
    private Boolean result;
    private boolean exchanging;

    static synchronized NativeAuth get(Context context) {
        if (instance == null) instance = new NativeAuth(context.getApplicationContext());
        return instance;
    }
    private NativeAuth(Context context) { pending = context.getSharedPreferences("native-auth", Context.MODE_PRIVATE); }
    void attach(Listener next) { listener = next; deliver(); }
    void detach(Listener previous) { if (listener == previous) listener = null; }
    private void deliver() {
        if (listener != null && result != null) {
            boolean success = result;
            result = null;
            listener.finished(success);
        }
    }
    private void finish(boolean success) { exchanging = false; result = success; deliver(); }
    boolean busy() { return exchanging; }
    void cancel() { if (!exchanging) pending.edit().clear().commit(); }
    Uri begin(String provider) throws Exception {
        if (exchanging) throw new IllegalStateException("Exchange in progress");
        String verifier = random();
        String state = random();
        String challenge = encode(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        if (!pending.edit().clear().putString("verifier", verifier).putString("state", state)
                .putLong("created", System.currentTimeMillis()).putLong("elapsed", SystemClock.elapsedRealtime()).commit()) {
            throw new IllegalStateException("Cannot persist authentication state");
        }
        return Uri.parse(BuildConfig.FORTE_ORIGIN).buildUpon().path("/auth/native/start")
                .appendQueryParameter("provider", provider).appendQueryParameter("platform", "android")
                .appendQueryParameter("challenge", challenge).appendQueryParameter("state", state).build();
    }
    private static String encode(byte[] bytes) { return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING); }
    private static String random() { byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes); return encode(bytes); }
    private static boolean token(String value) { return value != null && value.matches("[A-Za-z0-9_-]{43}"); }
    boolean callback(Uri uri) {
        if (uri == null || !"forte".equals(uri.getScheme()) || !"auth".equals(uri.getEncodedAuthority())
                || !"/callback".equals(uri.getEncodedPath()) || uri.getFragment() != null || exchanging) return false;
        try {
            if (uri.getQueryParameterNames().size() != 2 || uri.getQueryParameters("code").size() != 1
                    || uri.getQueryParameters("state").size() != 1) return false;
            String code = uri.getQueryParameter("code"), state = uri.getQueryParameter("state");
            String expected = pending.getString("state", ""), verifier = pending.getString("verifier", "");
            long age = System.currentTimeMillis() - pending.getLong("created", 0);
            long elapsed = SystemClock.elapsedRealtime() - pending.getLong("elapsed", -LIFETIME_MS);
            if (!token(code) || !token(state) || !token(verifier) || age < 0 || age > LIFETIME_MS
                    || elapsed < 0 || elapsed > LIFETIME_MS
                    || !MessageDigest.isEqual(state.getBytes(StandardCharsets.US_ASCII), expected.getBytes(StandardCharsets.US_ASCII))) return false;
            if (!pending.edit().clear().commit()) return false;
            exchanging = true;
            worker.execute(() -> exchange(code, verifier));
            return true;
        } catch (RuntimeException ignored) { return false; }
    }
    private void exchange(String code, String verifier) {
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(BuildConfig.FORTE_ORIGIN + "/api/auth/native/exchange").openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            connection.setDoOutput(true);
            byte[] body = new JSONObject().put("code", code).put("verifier", verifier).put("platform", "android")
                    .toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body); }
            if (connection.getResponseCode() != 200) throw new IllegalStateException("Exchange rejected");
            byte[] response;
            try (InputStream input = connection.getInputStream();
                 java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                byte[] buffer = new byte[1024];
                int count;
                while (output.size() <= 8192 && (count = input.read(buffer, 0, Math.min(buffer.length, 8193 - output.size()))) != -1) {
                    output.write(buffer, 0, count);
                }
                response = output.toByteArray();
            }
            if (response.length > 8192 || !Boolean.TRUE.equals(new JSONObject(new String(response, StandardCharsets.UTF_8)).opt("ok"))) {
                throw new IllegalStateException("Invalid exchange response");
            }
            List<String> cookies = new ArrayList<>();
            for (Map.Entry<String, List<String>> header : connection.getHeaderFields().entrySet()) {
                if ("Set-Cookie".equalsIgnoreCase(header.getKey())) cookies.addAll(header.getValue());
            }
            if (cookies.size() != 1) throw new IllegalStateException("Missing session cookie");
            String cookie = cookies.get(0);
            List<HttpCookie> parsed = HttpCookie.parse(cookie);
            if (parsed.size() != 1 || cookie.indexOf('\r') >= 0 || cookie.indexOf('\n') >= 0) throw new IllegalStateException("Invalid cookie");
            HttpCookie session = parsed.get(0);
            if (!"__Secure-better-auth.session_token".equals(session.getName()) || !session.getSecure() || !session.isHttpOnly()
                    || session.getDomain() != null || !"/".equals(session.getPath()) || session.getValue().isEmpty()
                    || session.getMaxAge() == 0 || !cookie.matches("(?is).*;\\s*SameSite=Lax\\s*(;.*)?")) {
                throw new IllegalStateException("Invalid session cookie scope");
            }
            main.post(() -> CookieManager.getInstance().setCookie(BuildConfig.FORTE_ORIGIN, cookie, accepted -> {
                if (accepted) CookieManager.getInstance().flush();
                finish(accepted);
            }));
        } catch (Exception ignored) { main.post(() -> finish(false)); }
        finally { if (connection != null) connection.disconnect(); }
    }
}

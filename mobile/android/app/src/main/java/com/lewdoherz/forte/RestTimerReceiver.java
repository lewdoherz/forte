package com.lewdoherz.forte;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

public final class RestTimerReceiver extends BroadcastReceiver {
    public static final int NOTIFICATION_ID = 4102;
    public static final String EXTRA_KEY = "key";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_SOUND = "sound";
    public static final String EXTRA_VIBRATE = "vibrate";
    private static volatile String lastPostedKey = null;

    public static void clearLastPostedKey() {
        lastPostedKey = null;
    }

    public static String channelIdFor(boolean sound, boolean vibrate) {
        if (sound && vibrate) return "forte_rest_sv_v1";
        if (sound) return "forte_rest_s_v1";
        if (vibrate) return "forte_rest_v_v1";
        return "forte_rest_quiet_v1";
    }

    public static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        createChannel(manager, channelIdFor(true, true), "Rest timer (sound & vibration)", soundUri, audio, true);
        createChannel(manager, channelIdFor(true, false), "Rest timer (sound only)", soundUri, audio, false);
        createChannel(manager, channelIdFor(false, true), "Rest timer (vibration only)", null, null, true);
        createChannel(manager, channelIdFor(false, false), "Rest timer (silent)", null, null, false);
    }

    private static void createChannel(
            NotificationManager manager,
            String id,
            String name,
            Uri sound,
            AudioAttributes audio,
            boolean vibrate
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (manager.getNotificationChannel(id) != null) return;
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(vibrate);
        if (vibrate) channel.setVibrationPattern(new long[]{0, 180, 90, 220});
        if (sound != null) channel.setSound(sound, audio);
        else channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String key = intent.getStringExtra(EXTRA_KEY);
        boolean sound = intent.getBooleanExtra(EXTRA_SOUND, true);
        boolean vibrate = intent.getBooleanExtra(EXTRA_VIBRATE, true);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        notifyNow(context, key, sound, vibrate, title, body);
    }

    public static synchronized void notifyNow(
            Context context,
            String key,
            boolean sound,
            boolean vibrate,
            String title,
            String body
    ) {
        if (key != null && !key.isEmpty() && key.equals(lastPostedKey)) {
            return;
        }
        if (key != null && !key.isEmpty()) {
            lastPostedKey = key;
        }
        if (title == null || title.isEmpty()) title = "Rest finished";
        if (body == null || body.isEmpty()) body = "Ready for your next set.";

        ensureChannels(context);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(
                context,
                0,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String channelId = channelIdFor(sound, vibrate);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, channelId)
                : new Notification.Builder(context);

        builder.setSmallIcon(R.drawable.ic_forte)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(tap);

        try {
            manager.notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS denied on Android 13+; foreground visual/audio/vibration still works.
        }
    }
}

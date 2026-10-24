package com.hurghadadream.client;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Notifications « Mon séjour » : rappel avant prise en charge, alerte si l'heure change. */
public final class StayNotifier {
  public static final String CHANNEL_ID = "stay-updates";
  static final String EXTRA_OPEN_STAY = "openStay";
  static final String EXTRA_ID = "id";
  static final String EXTRA_TITLE = "title";
  static final String EXTRA_BODY = "body";
  private static final String PREFS = "hd_stay_notifications";
  private static final String KEY_IDS = "alarm_ids";
  private static volatile boolean pendingOpenStay = false;

  private StayNotifier() {}

  static void markOpenStay() {
    pendingOpenStay = true;
  }

  static boolean consumeOpenStay() {
    boolean open = pendingOpenStay;
    pendingOpenStay = false;
    return open;
  }

  static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = context.getSystemService(NotificationManager.class);
    if (manager == null) return;
    NotificationChannel channel = new NotificationChannel(
      CHANNEL_ID,
      "Mon séjour",
      NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription("Heures de prise en charge");
    manager.createNotificationChannel(channel);
  }

  static void show(Context context, int id, String title, String body) {
    ensureChannel(context);
    Intent open = new Intent(context, MainActivity.class);
    open.putExtra(EXTRA_OPEN_STAY, true);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent content = PendingIntent.getActivity(
      context,
      700000 + id,
      open,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_stay)
      .setDefaults(NotificationCompat.DEFAULT_ALL)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setContentTitle(title == null || title.isEmpty() ? "Hurghada Dream" : title)
      .setContentText(body == null ? "" : body)
      .setStyle(new NotificationCompat.BigTextStyle().bigText(body == null ? "" : body))
      .setAutoCancel(true)
      .setContentIntent(content)
      .setPriority(NotificationCompat.PRIORITY_HIGH);
    NotificationManagerCompat.from(context).notify(id, builder.build());
  }

  static void replaceAlarms(Context context, int[] ids, long[] atMs, String[] titles, String[] bodies) {
    cancelStored(context);
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    StringBuilder stored = new StringBuilder();
    AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (alarms == null) return;
    for (int i = 0; i < ids.length; i += 1) {
      if (atMs[i] <= System.currentTimeMillis() + 60_000L) continue;
      Intent intent = new Intent(context, StayAlarmReceiver.class);
      intent.putExtra(EXTRA_ID, ids[i]);
      intent.putExtra(EXTRA_TITLE, titles[i]);
      intent.putExtra(EXTRA_BODY, bodies[i]);
      PendingIntent pending = PendingIntent.getBroadcast(
        context,
        ids[i],
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );
      try {
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs[i], pending);
      } catch (SecurityException ignored) {
        alarms.set(AlarmManager.RTC_WAKEUP, atMs[i], pending);
      }
      if (stored.length() > 0) stored.append(',');
      stored.append(ids[i]);
    }
    prefs.edit().putString(KEY_IDS, stored.toString()).apply();
  }

  private static void cancelStored(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String raw = prefs.getString(KEY_IDS, "");
    if (raw == null || raw.isEmpty()) return;
    AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (alarms == null) return;
    for (String part : raw.split(",")) {
      try {
        int id = Integer.parseInt(part.trim());
        Intent intent = new Intent(context, StayAlarmReceiver.class);
        PendingIntent pending = PendingIntent.getBroadcast(
          context,
          id,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarms.cancel(pending);
      } catch (NumberFormatException ignored) {
        /* skip */
      }
    }
    prefs.edit().remove(KEY_IDS).apply();
  }
}

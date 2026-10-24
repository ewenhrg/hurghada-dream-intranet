package com.hurghadadream.client;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/** Vérifie le programme en arrière-plan et alerte si une heure de prise en charge change. */
public final class StayWatch {
  private static final String PREFS = "hd_stay_watch";
  private static final int REQUEST = 88001;
  private static final long INTERVAL_MS = 20_000L;
  private static final int CHANGE_ID = 910001;

  private StayWatch() {}

  static void arm(Context context, String phone, String siteKey, String supabaseUrl, String anonKey) {
    String digits = digits(phone);
    if (digits.length() < 10 || siteKey == null || siteKey.isEmpty()) return;
    if (supabaseUrl == null || supabaseUrl.isEmpty() || anonKey == null || anonKey.isEmpty()) return;
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString("phone", digits)
      .putString("site", siteKey.trim())
      .putString("url", supabaseUrl.trim())
      .putString("key", anonKey.trim())
      .putBoolean("on", true)
      .apply();
    schedule(context);
  }

  static void disarm(Context context) {
    cancel(context);
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
  }

  static void schedule(Context context) {
    if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("on", false)) return;
    AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (alarms == null) return;
    PendingIntent pending = pending(context);
    long at = System.currentTimeMillis() + INTERVAL_MS;
    try {
      if (Build.VERSION.SDK_INT >= 23) {
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
      } else {
        alarms.set(AlarmManager.RTC_WAKEUP, at, pending);
      }
    } catch (SecurityException ignored) {
      alarms.set(AlarmManager.RTC_WAKEUP, at, pending);
    }
  }

  static void check(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!prefs.getBoolean("on", false)) return;
    String phone = prefs.getString("phone", "");
    String site = prefs.getString("site", "");
    String base = prefs.getString("url", "");
    String anon = prefs.getString("key", "");
    if (phone == null || phone.length() < 10 || site == null || base == null || anon == null) return;
    if (site.isEmpty() || base.isEmpty() || anon.isEmpty()) return;

    HttpURLConnection conn = null;
    try {
      String root = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
      URL url = new URL(root + "/rest/v1/rpc/get_client_stay_by_phone");
      conn = (HttpURLConnection) url.openConnection();
      conn.setConnectTimeout(12_000);
      conn.setReadTimeout(12_000);
      conn.setRequestMethod("POST");
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");
      conn.setRequestProperty("apikey", anon);
      conn.setRequestProperty("Authorization", "Bearer " + anon);
      JSONObject body = new JSONObject();
      body.put("p_site_key", site);
      body.put("p_phone", phone);
      byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
      try (OutputStream out = conn.getOutputStream()) {
        out.write(payload);
      }
      int code = conn.getResponseCode();
      InputStream stream = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
      if (code < 200 || code >= 300 || stream == null) return;
      String raw = read(stream);
      JSONObject json = new JSONObject(raw);
      if (!json.optBoolean("found", false)) return;
      String next = fingerprint(json.optJSONArray("items"));
      String prev = prefs.getString("fp", null);
      if (prev != null && !prev.equals(next)) {
        StayNotifier.show(context, CHANGE_ID, "Hurghada Dream", changeBody(prev, next));
      }
      prefs.edit().putString("fp", next).apply();
    } catch (Exception ignored) {
      /* réseau indisponible : on réessaiera au prochain cycle */
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static void cancel(Context context) {
    AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (alarms == null) return;
    alarms.cancel(pending(context));
  }

  private static PendingIntent pending(Context context) {
    Intent intent = new Intent(context, StayWatchReceiver.class);
    return PendingIntent.getBroadcast(
      context,
      REQUEST,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
  }

  private static String fingerprint(JSONArray items) {
    if (items == null) return "";
    StringBuilder out = new StringBuilder();
    for (int i = 0; i < items.length(); i += 1) {
      JSONObject item = items.optJSONObject(i);
      if (item == null) continue;
      if (out.length() > 0) out.append('\n');
      out.append(item.optString("activityName", ""));
      out.append('|');
      out.append(item.optString("date", ""));
      out.append('|');
      out.append(item.optString("pickupTime", ""));
    }
    return out.toString();
  }

  private static String changeBody(String prev, String next) {
    String[] prevLines = prev.split("\n", -1);
    String[] nextLines = next.split("\n", -1);
    String changed = null;
    int count = 0;
    int n = Math.max(prevLines.length, nextLines.length);
    for (int i = 0; i < n; i += 1) {
      String before = i < prevLines.length ? prevLines[i] : "";
      String after = i < nextLines.length ? nextLines[i] : "";
      if (before.equals(after)) continue;
      count += 1;
      changed = after.isEmpty() ? before : after;
    }
    if (count == 1 && changed != null) {
      String[] parts = splitLine(changed);
      String time = parts[2].isEmpty() ? "heure à confirmer" : parts[2];
      String name = parts[0].isEmpty() ? "Activité" : parts[0];
      return "Prise en charge mise à jour : " + name + " à " + time + ".";
    }
    return "Vos heures de prise en charge ont été mises à jour. Ouvrez Mon séjour.";
  }

  private static String[] splitLine(String line) {
    int last = line.lastIndexOf('|');
    int earlier = last < 0 ? -1 : line.lastIndexOf('|', last - 1);
    if (last < 0 || earlier < 0) return new String[] { line, "", "" };
    return new String[] {
      line.substring(0, earlier),
      line.substring(earlier + 1, last),
      line.substring(last + 1)
    };
  }

  private static String digits(String phone) {
    if (phone == null) return "";
    StringBuilder out = new StringBuilder();
    for (int i = 0; i < phone.length(); i += 1) {
      char c = phone.charAt(i);
      if (c >= '0' && c <= '9') out.append(c);
    }
    return out.toString();
  }

  private static String read(InputStream stream) throws Exception {
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    byte[] chunk = new byte[4096];
    int n;
    int total = 0;
    while ((n = stream.read(chunk)) >= 0) {
      total += n;
      if (total > 1_000_000) break;
      buffer.write(chunk, 0, n);
    }
    return buffer.toString(StandardCharsets.UTF_8.name());
  }
}

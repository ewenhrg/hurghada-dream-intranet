package com.hurghadadream.client;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

@CapacitorPlugin(
  name = "StayNotifications",
  permissions = {
    @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
  }
)
public class StayNotificationsPlugin extends Plugin {
  @PluginMethod
  public void isGranted(PluginCall call) {
    boolean ok = Build.VERSION.SDK_INT < 33
      || getPermissionState("notifications") == PermissionState.GRANTED;
    call.resolve(granted(ok));
  }

  @PluginMethod
  public void requestPermission(PluginCall call) {
    if (Build.VERSION.SDK_INT < 33) {
      call.resolve(granted(true));
      return;
    }
    if (getPermissionState("notifications") == PermissionState.GRANTED) {
      call.resolve(granted(true));
      return;
    }
    requestPermissionForAlias("notifications", call, "permissionCallback");
  }

  @PermissionCallback
  private void permissionCallback(PluginCall call) {
    call.resolve(granted(getPermissionState("notifications") == PermissionState.GRANTED));
  }

  @PluginMethod
  public void sync(PluginCall call) {
    JSArray list = call.getArray("notifications");
    int count = list == null ? 0 : list.length();
    int[] ids = new int[count];
    long[] atMs = new long[count];
    String[] titles = new String[count];
    String[] bodies = new String[count];
    int kept = 0;
    for (int i = 0; i < count; i += 1) {
      try {
        JSONObject item = list.getJSONObject(i);
        ids[kept] = item.getInt("id");
        atMs[kept] = item.getLong("atMs");
        titles[kept] = item.optString("title", "Hurghada Dream");
        bodies[kept] = item.optString("body", "");
        kept += 1;
      } catch (Exception ignored) {
        /* skip a bad row */
      }
    }
    if (kept != count) {
      ids = copy(ids, kept);
      atMs = copyLong(atMs, kept);
      titles = copyStr(titles, kept);
      bodies = copyStr(bodies, kept);
    }
    StayNotifier.ensureChannel(getContext());
    StayNotifier.replaceAlarms(getContext(), ids, atMs, titles, bodies);
    call.resolve();
  }

  @PluginMethod
  public void showNow(PluginCall call) {
    StayNotifier.show(
      getContext(),
      910001,
      call.getString("title", "Hurghada Dream"),
      call.getString("body", "")
    );
    call.resolve();
  }

  @PluginMethod
  public void armWatch(PluginCall call) {
    StayWatch.arm(
      getContext(),
      call.getString("phone", ""),
      call.getString("siteKey", ""),
      call.getString("supabaseUrl", ""),
      call.getString("anonKey", "")
    );
    call.resolve();
  }

  @PluginMethod
  public void disarmWatch(PluginCall call) {
    StayWatch.disarm(getContext());
    call.resolve();
  }

  @PluginMethod
  public void consumeOpen(PluginCall call) {
    JSObject result = new JSObject();
    result.put("open", StayNotifier.consumeOpenStay());
    call.resolve(result);
  }

  private static JSObject granted(boolean ok) {
    JSObject result = new JSObject();
    result.put("granted", ok);
    return result;
  }

  private static int[] copy(int[] src, int n) {
    int[] out = new int[n];
    System.arraycopy(src, 0, out, 0, n);
    return out;
  }

  private static long[] copyLong(long[] src, int n) {
    long[] out = new long[n];
    System.arraycopy(src, 0, out, 0, n);
    return out;
  }

  private static String[] copyStr(String[] src, int n) {
    String[] out = new String[n];
    System.arraycopy(src, 0, out, 0, n);
    return out;
  }
}

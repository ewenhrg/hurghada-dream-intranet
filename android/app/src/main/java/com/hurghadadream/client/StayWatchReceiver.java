package com.hurghadadream.client;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

public class StayWatchReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    Context app = context.getApplicationContext();
    PendingResult pending = goAsync();
    PowerManager power = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
    PowerManager.WakeLock lock = power == null
      ? null
      : power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "hd:stay-watch");
    if (lock != null) lock.acquire(20_000L);
    new Thread(() -> {
      try {
        StayWatch.check(app);
      } finally {
        StayWatch.schedule(app);
        if (lock != null && lock.isHeld()) lock.release();
        pending.finish();
      }
    }, "stay-watch").start();
  }
}

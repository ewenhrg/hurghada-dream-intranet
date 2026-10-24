package com.hurghadadream.client;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class StayAlarmReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    StayNotifier.show(
      context,
      intent.getIntExtra(StayNotifier.EXTRA_ID, 0),
      intent.getStringExtra(StayNotifier.EXTRA_TITLE),
      intent.getStringExtra(StayNotifier.EXTRA_BODY)
    );
  }
}

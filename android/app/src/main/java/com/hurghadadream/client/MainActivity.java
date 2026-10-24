package com.hurghadadream.client;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final int NOTIFICATION_PERMISSION_REQUEST = 4401;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(StayNotificationsPlugin.class);
    super.onCreate(savedInstanceState);
    askNotificationPermission();
    noteOpenStay(getIntent());

    getWindow().setStatusBarColor(Color.parseColor("#FAF6EF"));
    getWindow().setNavigationBarColor(Color.parseColor("#FAF6EF"));

    View decor = getWindow().getDecorView();
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decor);
    controller.setAppearanceLightStatusBars(true);
    controller.setAppearanceLightNavigationBars(true);

    View content = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
      Insets bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
      );
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      return WindowInsetsCompat.CONSUMED;
    });
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    noteOpenStay(intent);
  }

  private void askNotificationPermission() {
    if (Build.VERSION.SDK_INT < 33) return;
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
      return;
    }
    ActivityCompat.requestPermissions(
      this,
      new String[] { Manifest.permission.POST_NOTIFICATIONS },
      NOTIFICATION_PERMISSION_REQUEST
    );
  }

  private static void noteOpenStay(Intent intent) {
    if (intent != null && intent.getBooleanExtra(StayNotifier.EXTRA_OPEN_STAY, false)) {
      StayNotifier.markOpenStay();
    }
  }
}

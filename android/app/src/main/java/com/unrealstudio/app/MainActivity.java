package com.unrealstudio.app;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // La web no usa env(safe-area-inset-*): la WebView va entre barra de estado, barra de navegación y
        // teclado (como en iOS); detrás, el crema del tema. Sustituye a SystemBars (insetsHandling 'disable').
        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, insets) -> {
            int bars = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets b = insets.getInsets(bars);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(b.left, b.top, b.right, Math.max(b.bottom, ime.bottom));
            // A cero en vez de CONSUMED (bug de Chromium; mismo criterio que SystemBars de Capacitor).
            return new WindowInsetsCompat.Builder(insets).setInsets(bars | WindowInsetsCompat.Type.ime(), Insets.NONE).build();
        });
    }
}

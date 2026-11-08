package com.unrealstudio.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import com.getcapacitor.WebViewListener;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    // jsPDF/html2pdf descargan con un <a download> que no está en el DOM y Android no nos pasa su nombre:
    // la página apunta aquí el último nombre (solo se lee al descargar).
    private static final String DOWNLOAD_NAME_HOOK =
        "(function(){var p=HTMLAnchorElement.prototype,d=Object.getOwnPropertyDescriptor(p,'download');" +
        "if(!d||!d.set||p.__unrealDl)return;p.__unrealDl=1;Object.defineProperty(p,'download',{configurable:true," +
        "enumerable:d.enumerable,get:d.get,set:function(v){window.__unrealDlName=v;d.set.call(this,v)}})})()";

    // Últimas barras medidas, en px CSS: se re-inyectan en cada página nueva (recarga, otro portal).
    private String safeAreaJs = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Pantalla completa también en Android < 15 (en 15+ ya lo impone targetSdk 36): sin franjas crema.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        // La WebView va DEBAJO de la barra de estado y de la de navegación; la web se aparta con --safe-area-inset-*
        // (solo html.native-app, index.css). Las WebView < 140 no dan env(safe-area-inset-*), por eso se inyectan.
        // Solo el teclado encoge la WebView. Sustituye a SystemBars (insetsHandling 'disable').
        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, insets) -> {
            int bars = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets b = insets.getInsets(bars);
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            v.setPadding(0, 0, 0, keyboard ? insets.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0);
            float d = getResources().getDisplayMetrics().density;
            safeAreaJs = String.format(
                Locale.US,
                "(function(s){s.setProperty('--safe-area-inset-top','%dpx');s.setProperty('--safe-area-inset-right','%dpx');" +
                "s.setProperty('--safe-area-inset-bottom','%dpx');s.setProperty('--safe-area-inset-left','%dpx')})(document.documentElement.style)",
                Math.round(b.top / d), Math.round(b.right / d), keyboard ? 0 : Math.round(b.bottom / d), Math.round(b.left / d)
            );
            injectSafeArea();
            // A cero en vez de CONSUMED (bug de Chromium; mismo criterio que SystemBars de Capacitor): env() = 0, manda la variable.
            return new WindowInsetsCompat.Builder(insets).setInsets(bars | WindowInsetsCompat.Type.ime(), Insets.NONE).build();
        });
        getBridge().addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    injectSafeArea();
                }

                @Override
                public void onPageLoaded(WebView webView) {
                    injectSafeArea();
                }
            }
        );
        setUpDocuments(getBridge().getWebView());
    }

    private void injectSafeArea() {
        String js = safeAreaJs;
        if (js == null || getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
    }

    /**
     * Capacitor no pone DownloadListener: sin él, pulsar un PDF (folleto, recibo) no hacía nada.
     * - URL http(s) (folletos, informes de Supabase o /r/…): se abre con el visor del sistema (navegador / app de PDF).
     * - blob:/data: (recibos que genera la web con jsPDF): solo existen dentro de la página, así que la página nos
     *   pasa el contenido, lo guardamos en caché y se abre con el visor (o compartir si no hay visor).
     */
    private void setUpDocuments(WebView web) {
        web.addJavascriptInterface(new Documents(), "UnrealDocs");
        getBridge().addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    webView.evaluateJavascript(DOWNLOAD_NAME_HOOK, null);
                }
            }
        );
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                web.evaluateJavascript(
                    "fetch(" + JSONObject.quote(url) + ").then(function(r){return r.blob()}).then(function(b){" +
                    "var f=new FileReader();f.onload=function(){UnrealDocs.open(f.result,window.__unrealDlName||'')};" +
                    "f.readAsDataURL(b)})",
                    null
                );
            } else {
                view(Uri.parse(url), null);
            }
        });
    }

    private class Documents {

        /** dataUrl = "data:<mime>;base64,<contenido>" (FileReader.readAsDataURL). */
        @JavascriptInterface
        public void open(String dataUrl, String name) {
            try {
                int comma = dataUrl.indexOf(',');
                String mime = dataUrl.substring(5, comma).split(";")[0];
                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
                // Nombre seguro: sin separadores ni caracteres de control, sin '.' inicial (nada de "..").
                String file = (name == null ? "" : name).replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", "-").replaceAll("^[.\\s]+", "").trim();
                if (file.isEmpty()) file = "Unreal Studio";
                if (ext != null && !file.toLowerCase(Locale.ROOT).endsWith("." + ext)) file += "." + ext;
                File dir = new File(getCacheDir(), "docs"); // shortcut: la caché la limpia Android; no borramos a mano
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("no cache dir");
                File out = new File(dir, file);
                try (FileOutputStream stream = new FileOutputStream(out)) {
                    stream.write(bytes);
                }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", out);
                runOnUiThread(() -> view(uri, mime));
            } catch (Exception e) {
                Logger.error("UnrealDocs", "no se pudo abrir el documento", e);
            }
        }
    }

    /** Abre con el visor del sistema; si no hay visor para ese tipo de fichero, ofrece compartirlo. */
    private void view(Uri uri, String mime) {
        Intent intent = new Intent(Intent.ACTION_VIEW).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (mime == null) intent.setData(uri);
        else intent.setDataAndType(uri, mime);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            if (mime == null) return;
            Intent share = new Intent(Intent.ACTION_SEND)
                .setType(mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(share, null));
        }
    }
}

# Apps iOS / Android (Capacitor)

4 apps nativas que cargan **en vivo** su portal de unrealstudiobali.com (los cambios de la web
llegan a las apps sin pasar por tienda). Rama: `apps/capacitor-2026-11` — **no** se despliega con la web.

| Flavor (`APP_FLAVOR`) | Bundle / package | Nombre en el móvil | Abre |
|---|---|---|---|
| `clientes` (por defecto) | com.unrealstudio.clientes | Unreal Clientes | /cliente |
| `agencias` | com.unrealstudio.agencias | Unreal Agencias | /agencias/login |
| `equipo` | com.unrealstudio.equipo | Unreal Equipo | /empleados |
| `admin` | com.unrealstudio.admin | Unreal Admin | /admin/login |

- `capacitor.config.ts`: flavors, `server.url`, `allowNavigation`, splash/status bar (crema `#F3E5D8`).
- `app-shell/`: solo la página **sin conexión** (`server.errorPath`), en es/en/ro/id.
- `scripts/app-assets.mjs`: icono (marca + etiqueta del flavor) y splash → `android/`, `ios/` y `~/jobs/apps/store-assets/<flavor>/`.
- Nativo: cámara + ubicación (fichaje de empleados, ya en la web por `getUserMedia`/`geolocation`), push (plugin instalado; falta FCM/APNs + backend para enviar).
- Nativo (sensación de app): iOS deslizar-atrás (`AppViewController` en `SceneDelegate.swift`), Android atrás/pop-ups (web `lib/nativeApp.ts`) e insets (`MainActivity`), vibración (`@capacitor/haptics`), sin vista previa de enlaces.

## Android (se compila en el VPS)
```bash
APP_FLAVOR=clientes bash scripts/app-build-android.sh <versionCode> <versionName>
# → ~/jobs/apps/builds/com.unrealstudio.clientes-<versionName>-<versionCode>.aab (firmado con la upload key)
```
Requisitos: JDK 21 + SDK (platform 36, build-tools 36) en `~/android-sdk`; upload key en
`~/.config/android-upload-keystore.jks` + `~/.config/android-keystore.env` (600). Aborta si hay <2 GB RAM libre.
Usar **Play App Signing** (Google guarda la clave de la app; la nuestra es solo de subida).

## iOS (GitHub Actions, macOS) → TestFlight
Workflow `.github/workflows/ios-testflight.yml`: corre al hacer push a `apps/**` que toque `ios/`, config o scripts
(compila las 4 apps en matriz) o a mano cuando esté en `main` (Actions → iOS TestFlight → Run workflow → flavor).
Firma **manual**: certificado Apple Distribution (secret) + perfil App Store creado por API (`scripts/asc-profile.mjs`),
así no hace falta ningún iPhone registrado. Solo iPhone (`TARGETED_DEVICE_FAMILY = 1`).

**GitHub → repo → Settings → Secrets and variables → Actions** (ya configurados el 06-nov-2026):
- Secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (texto del `.p8`), `IOS_DIST_P12` (base64), `IOS_DIST_P12_PASSWORD`.
  Origen en el VPS: `~/.config/appstore-connect.env`, `~/.config/ios-dist/` (600). El cert caduca el 06-nov-2027.
- Variable: `APPLE_TEAM_ID` = `8CX5UN59YK`.

**Antes del primer build:** cada app debe existir en App Store Connect → Apps → “+” → Nueva app
(plataforma iOS, nombre, idioma, bundle id de la tabla, SKU). La API de Apple no permite crearlas.

## 06-nov-2026 — Sensación de app nativa
- **Web (en vivo desde v3.840, commit `394834e` en main)**: `lib/nativeApp.ts` solo actúa dentro de la app
  (`window.Capacitor.isNativePlatform()`; en el navegador no cambia nada). Android Atrás = cierra pop-up/menú →
  sección anterior → app a segundo plano; vibración ligera (casillas, envíos, idioma); fundido 220 ms entre secciones
  (no en "atrás" ni con "reducir movimiento"); sin selección ni menú de pulsación larga en controles/enlaces; iOS sin
  zoom al enfocar; el splash nativo se funde con la carga; sin service worker en la app; tirar-para-refrescar (nunca
  con un pop-up abierto); no se auto-recarga con un pop-up o un campo activos.
- **Nativo (commit `fbc96ea`)**: iOS deslizar-atrás (`AppViewController`) y `allowsLinkPreview:false`; Android insets en
  `MainActivity` + `SystemBars.insetsHandling:'disable'` + crema detrás de las barras; `@capacitor/haptics@8.0.2`.
- **Builds**: Android versionCode 2 (1.0.0) ×4 en `~/jobs/apps/builds/`; iOS build 31 (Actions run 3) VALID y asignada a la
  versión 1.0 de las 4 apps en App Store Connect (solo metadatos: nada enviado a revisión).
- **Pruebas**: web `node --experimental-strip-types scripts/check-native-app.ts`; `BASE=<url> node ~/jobs/apps/bin/native-feel-check.mjs`
  (window.Capacitor falso, 28 comprobaciones); vídeo `node ~/jobs/apps/bin/native-motions-video.mjs`.
  Falta en dispositivo real: iPhone (TestFlight) y un Android 15+ (insets/teclado/Atrás).

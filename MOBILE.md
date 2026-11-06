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

## Android (se compila en el VPS)
```bash
APP_FLAVOR=clientes bash scripts/app-build-android.sh <versionCode> <versionName>
# → ~/jobs/apps/builds/com.unrealstudio.clientes-<versionName>-<versionCode>.aab (firmado con la upload key)
```
Requisitos: JDK 21 + SDK (platform 36, build-tools 36) en `~/android-sdk`; upload key en
`~/.config/android-upload-keystore.jks` + `~/.config/android-keystore.env` (600). Aborta si hay <2 GB RAM libre.
Usar **Play App Signing** (Google guarda la clave de la app; la nuestra es solo de subida).

## iOS (GitHub Actions, macOS) → TestFlight
Workflow `.github/workflows/ios-testflight.yml`: corre al hacer push a `apps/**` (las 4 apps) o a mano
(Actions → iOS TestFlight → Run workflow → flavor). Firma automática en la nube con la API key.

**Configurar en GitHub → repo → Settings → Secrets and variables → Actions:**
- Secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (texto completo del `.p8`). La key necesita rol **Admin**
  (firma gestionada en la nube).
- Variable: `APPLE_TEAM_ID` = `8CX5UN59YK`.

**Antes del primer build:** cada app debe existir en App Store Connect → Apps → “+” → Nueva app
(plataforma iOS, nombre, idioma, bundle id de la tabla, SKU). La API de Apple no permite crearlas.

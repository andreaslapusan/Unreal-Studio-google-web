# Apps nativas (iOS + Android) — Unreal Studio

Esta web React se empaqueta como **app nativa** con [Capacitor](https://capacitorjs.com).
Reutiliza el 100% del código de la web; lo que ves en la app es la misma SPA servida
desde el bundle local (`dist/`), con acceso a APIs nativas (push, cámara, GPS).

> Esta integración vive en la rama `feature/capacitor-apps`. **NO está en `main`**
> (la web en producción se despliega desde `main` y no debe arrastrar `ios/`/`android/`).

## Identidad de la app
- **appId / bundle id:** `com.unrealstudio.app`
- **Nombre:** Unreal Studio
- **Iconos/Splash:** generados desde `assets/icon.png` y `assets/splash.png` (el favicon
  de las tablas). Regenerar: `npm run app:icons`.
- **Color de marca:** fondo crema `#f3e5d8`, icono sobre marrón `#2b1a05`.

## Requisitos para compilar/publicar
- **Android:** Android Studio (JDK 17 + Android SDK). Cuenta Google Play Developer (25 $ pago único).
- **iOS:** un **Mac** con Xcode (o un CI en la nube tipo Codemagic / EAS / Xcode Cloud).
  Cuenta Apple Developer Program (99 $/año) — **la del titular Andreas, no la de Parkbnb**.
- Para subir builds sin abrir Xcode/Studio a mano: App Store Connect API Key + un CI.

## Flujo de trabajo
```bash
# 1) Construir la web + copiar a las apps
npm run app:sync           # = npm run build && npx cap sync

# 2) Abrir el proyecto nativo (en una máquina con las herramientas)
npm run app:android        # abre Android Studio
npm run app:ios            # abre Xcode (solo en Mac)
```
Desde Android Studio / Xcode se firma y se genera el `.aab` / `.ipa` para subir a las tiendas.

## Permisos ya configurados
- **Android** (`android/app/src/main/AndroidManifest.xml`): INTERNET, ubicación (fina/gruesa),
  cámara, lectura de imágenes, notificaciones (POST_NOTIFICATIONS).
- **iOS** (`ios/App/App/Info.plist`): cámara, fotos, ubicación-en-uso (con textos en español).

## Plugins instalados
`@capacitor/app`, `status-bar`, `splash-screen`, `geolocation`, `camera`,
`push-notifications`, `preferences`. La inicialización nativa está en `lib/native.ts`
(oculta el splash, ajusta la status bar, botón atrás de Android, registra el token de push).

> ⚠️ **Push:** `lib/native.ts` solo OBTIENE el token del dispositivo. **No envía ninguna
> notificación.** El envío se decide en backend y está deshabilitado a propósito.
> Para push real falta: FCM (Android) / APNs (iOS) configurados con la cuenta del dueño.

## Pendiente para publicar (necesita cuentas del dueño)
1. Cuenta Apple Developer propia de Andreas (ver mensajes; ahora mismo solo está en la
   org de Daniel/Parkbnb, caducada). Inscribirse como Individual evita el trámite del DUNS.
2. Cuenta Google Play Console.
3. Firmar (keystore Android + certificados/perfiles iOS) y subir.
4. Fichas de tienda (capturas, descripción, política de privacidad — ya hay /privacidad).
5. (Opcional) FCM/APNs para push notifications reales.

## Alternativa "auto-update sin pasar por tienda"
En `capacitor.config.ts` está comentado `server.url`. Si lo activas, la app cargará
SIEMPRE `https://unrealstudiobali.com` en vivo (cualquier cambio web aparece sin
resubir a la tienda). Por defecto va el bundle local (más rápido y funciona offline).

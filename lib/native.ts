/**
 * Integración NATIVA (Capacitor) — solo se activa cuando la app corre dentro del
 * caparazón iOS/Android. En la web normal no hace nada (los imports son dinámicos
 * para no engordar el bundle web ni romper el build cuando Capacitor no está).
 *
 * Hace: oculta el splash al cargar, ajusta la status bar a la marca, gestiona el
 * botón "atrás" de Android, y registra el dispositivo para push notifications
 * (SOLO obtiene el token; NO envía ninguna notificación — el envío se decide en
 * backend y está deshabilitado hasta el OK del dueño).
 */
export async function initNative(): Promise<void> {
  // Carga perezosa: si @capacitor/core no está (web pura sin Capacitor), salimos.
  let Capacitor: any;
  try {
    ({ Capacitor } = await import('@capacitor/core'));
  } catch {
    return;
  }
  if (!Capacitor?.isNativePlatform?.()) return;

  // Splash screen: ocúltalo en cuanto la web está lista.
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch { /* plugin opcional */ }

  // Status bar con los colores de la marca.
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#f3e5d8' });
    }
  } catch { /* opcional */ }

  // Android: botón atrás → navegar atrás; si no hay historial, no cerrar de golpe.
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
  } catch { /* opcional */ }

  // Push notifications: pide permiso y registra el token del dispositivo.
  // IMPORTANTE: esto solo OBTIENE el token; NO envía nada a nadie.
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === 'granted') {
      await PushNotifications.register();
      PushNotifications.addListener('registration', (token) => {
        // Aquí, en el futuro, se guardaría el token en backend para poder enviar
        // push. De momento solo se registra en consola (sin envíos).
        // eslint-disable-next-line no-console
        console.log('[push] device token:', token.value);
      });
    }
  } catch { /* opcional */ }
}

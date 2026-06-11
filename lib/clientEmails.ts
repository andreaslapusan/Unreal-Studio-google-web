/**
 * Plantillas de email al cliente (cuerpo INTERIOR — la marca/cabecera/footer la
 * añade la edge fn send-client-email vía brandWrap). No incluir aquí header/footer.
 */
const BROWN = '#3F2305';

export interface WelcomeEmailData {
  firstName: string;
  portalUrl: string;
  email: string;
  tempPassword?: string | null;
}

const li = (txt: string) =>
  `<tr><td style="padding:5px 0;vertical-align:top;width:26px;color:${BROWN}">·</td><td style="padding:5px 0;font-size:14px;line-height:1.6;color:${BROWN}">${txt}</td></tr>`;

/** Email de bienvenida / credenciales de acceso al portal. */
export function welcomeEmailHtml(d: WelcomeEmailData): string {
  const name = (d.firstName || '').trim();
  const hi = name ? `¡Bienvenido a Unreal Studio, ${name}!` : '¡Bienvenido a Unreal Studio!';
  const creds = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;font-size:14px;line-height:1.9;color:${BROWN}">
      <tr><td style="padding-right:14px;color:rgba(63,35,5,.55)">Acceso</td><td><a href="${d.portalUrl}" style="color:${BROWN};font-weight:700">${d.portalUrl}</a></td></tr>
      <tr><td style="padding-right:14px;color:rgba(63,35,5,.55)">Email</td><td><b>${d.email}</b></td></tr>
      ${d.tempPassword ? `<tr><td style="padding-right:14px;color:rgba(63,35,5,.55)">Contraseña temporal</td><td><b>${d.tempPassword}</b></td></tr>` : ''}
    </table>`;
  return `
    <h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;font-weight:700;margin:0 0 14px;color:${BROWN}">${hi}</h1>
    <p style="font-size:15px;line-height:1.7;margin:0 0 10px;color:${BROWN}">
      Tu portal de cliente ya está activo. Es tu espacio privado para seguir tu inversión de principio a fin, desde donde estés y cuando quieras:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px">
      ${li('El <b>avance de tu obra</b>, con fotos y porcentaje actualizado.')}
      ${li('Tu <b>calendario de pagos</b>: importes, fechas límite y lo ya recibido.')}
      ${li('La <b>descarga de tus recibís</b> oficiales.')}
      ${li('Tu <b>documentación privada</b> (contratos, planos) en Google Drive.')}
    </table>
    <p style="font-size:15px;line-height:1.7;margin:0 0 4px;color:${BROWN}">Todo en un único sitio, siempre a tu alcance — y seguiremos añadiendo más.</p>
    ${creds}
    <p style="text-align:center;margin:26px 0 8px">
      <a href="${d.portalUrl}" style="background:${BROWN};color:#ffffff;text-decoration:none;font-weight:700;padding:14px 30px;border-radius:12px;display:inline-block;font-size:14px">Entrar a mi portal</a>
    </p>
    <p style="font-size:12px;line-height:1.6;color:rgba(63,35,5,.55);margin:16px 0 0">Por tu seguridad, cambia la contraseña temporal la primera vez que entres. Si tienes cualquier duda, estamos a un mensaje de distancia.</p>`;
}

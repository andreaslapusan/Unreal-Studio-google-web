/**
 * Plantillas de email al cliente (cuerpo INTERIOR — la marca/cabecera/footer la
 * añade la edge fn send-client-email vía brandWrap). No incluir aquí header/footer.
 *
 * i18n: se renderizan en el idioma del CLIENTE (preferred_language) vía
 * i18n.getFixedT(lang). Las claves viven en locales/*.json bajo `emails.*`.
 */
import i18n from './i18n';

const BROWN = '#3F2305';

export interface WelcomeEmailData {
  firstName: string;
  portalUrl: string;
  email: string;
  tempPassword?: string | null;
  lang?: string;
}

const li = (txt: string) =>
  `<tr><td style="padding:5px 0;vertical-align:top;width:26px;color:${BROWN}">·</td><td style="padding:5px 0;font-size:14px;line-height:1.6;color:${BROWN}">${txt}</td></tr>`;

/** Email de bienvenida / credenciales de acceso al portal (en el idioma del cliente). */
export function welcomeEmailHtml(d: WelcomeEmailData): string {
  const t = i18n.getFixedT(d.lang || 'es');
  const name = (d.firstName || '').trim();
  const hi = name ? t('emails.welcome.greetingName', { name }) : t('emails.welcome.greeting');
  const creds = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;font-size:14px;line-height:1.9;color:${BROWN}">
      <tr><td style="padding-right:14px;color:rgba(63,35,5,.55)">${t('emails.welcome.access')}</td><td><a href="${d.portalUrl}" style="color:${BROWN};font-weight:700">${d.portalUrl}</a></td></tr>
      <tr><td style="padding-right:14px;color:rgba(63,35,5,.55)">${t('emails.welcome.emailLabel')}</td><td><b>${d.email}</b></td></tr>
      ${d.tempPassword ? `<tr><td style="padding-right:14px;color:rgba(63,35,5,.55)">${t('emails.welcome.tempPassword')}</td><td><b>${d.tempPassword}</b></td></tr>` : ''}
    </table>`;
  return `
    <h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;font-weight:700;margin:0 0 14px;color:${BROWN}">${hi}</h1>
    <p style="font-size:15px;line-height:1.7;margin:0 0 10px;color:${BROWN}">${t('emails.welcome.intro')}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px">
      ${li(t('emails.welcome.b1'))}
      ${li(t('emails.welcome.b2'))}
      ${li(t('emails.welcome.b3'))}
    </table>
    ${creds}
    <p style="text-align:center;margin:26px 0 8px">
      <a href="${d.portalUrl}" style="background:${BROWN};color:#ffffff;text-decoration:none;font-weight:700;padding:14px 30px;border-radius:12px;display:inline-block;font-size:14px">${t('emails.welcome.cta')}</a>
    </p>
    <p style="font-size:12px;line-height:1.6;color:rgba(63,35,5,.55);margin:16px 0 0">${t('emails.welcome.security')}</p>`;
}

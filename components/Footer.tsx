import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { WHATSAPP_URL } from '../constants';
import { APP_VERSION } from '../lib/version';
import { supabase } from '../lib/supabase';
import { SocialIcon, networkClass } from '../lib/socials';
import BrandLogo from './BrandLogo';
import { useLangPath } from './LocaleRoute';
import { reopenConsent } from '../lib/consent';
import { landingLink } from '../lib/landings';

const DAY_LABEL: Record<string, string> = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };

/** compact: versión para portales (sin hueco inferior para el CTA flotante de la web pública). */
const Footer: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { t, i18n } = useTranslation();
  const lp = useLangPath();
  const guides = ['invertir-en-bali', 'sobre-nosotros'].map((id) => landingLink(id, (i18n.language || 'es').slice(0, 2))).filter((l): l is NonNullable<typeof l> => !!l);
  const [brand, setBrand] = useState<any>(null);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('app_config').select('value').eq('key', 'brand').maybeSingle();
      setBrand(data?.value || {});
    })();
  }, []);

  const socials: { network?: string; label?: string; url: string }[] = ((brand?.socials && brand.socials.length)
    ? brand.socials.filter((s: any) => s?.url)
    : [{ network: 'instagram', url: 'https://instagram.com/unrealstudiobali' }])
    // WhatsApp retirado de TODO el sitio (Andreas): nunca mostrarlo aunque esté en config.
    .filter((s: any) => {
      const id = String(s?.network || s?.label || '').toLowerCase();
      const u = String(s?.url || '').toLowerCase();
      return id !== 'whatsapp' && !u.includes('wa.me') && !u.includes('whatsapp');
    });
  const hours: Record<string, string> = brand?.hours || {};
  const hoursEntries = Object.entries(hours).filter(([, v]) => v);

  const bottomBar = (
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-[10px] font-bold uppercase tracking-widest text-primary/30 border-t border-primary/5 pt-4">
        <p>{t('footer.rights')} <span className="text-primary/40 normal-case">· v{APP_VERSION}</span></p>
        <div className="flex flex-wrap justify-center md:justify-end gap-x-5 gap-y-2 mt-3 md:mt-0">
          <Link className="hover:text-primary transition" to={lp("/privacidad")}>{t('footer.privacy')}</Link>
          <Link className="hover:text-primary transition" to={lp("/terminos")}>{t('footer.terms')}</Link>
          <Link className="hover:text-primary transition" to={lp("/aviso-legal")}>{t('footer.legalNotice')}</Link>
          <button type="button" className="hover:text-primary transition uppercase tracking-widest font-bold" onClick={reopenConsent}>{t('footer.cookies')}</button>
          {/* Enlaces de portal: <a> con carga COMPLETA (no react-router Link) a propósito,
              para que al entrar quede fijado el manifest del portal y se pueda instalar
              cada uno como su propia app desde aquí. Ver index.html (script de manifest). */}
          <a className="hover:text-primary transition flex items-center gap-1" href="/cliente">
            <span className="material-symbols-outlined text-xs">person</span> {t('footer.clients')}
          </a>
          <a className="hover:text-primary transition flex items-center gap-1" href="/agencias/login">
            <span className="material-symbols-outlined text-xs">handshake</span> {t('footer.agencies')}
          </a>
          <a className="hover:text-primary transition flex items-center gap-1" href="/empleados">
            <span className="material-symbols-outlined text-xs">badge</span> {t('footer.team')}
          </a>
          <a className="hover:text-primary transition flex items-center gap-1" href="/admin/login">
            <span className="material-symbols-outlined text-xs">settings</span> {t('footer.admin')}
          </a>
        </div>
      </div>
  );

  // Portales: solo una línea mínima (Andreas 6-nov: "muchísimo más pequeño" en portales; la web pública intacta).
  if (compact) {
    return (
      <footer className="bg-white border-t border-gray-100 py-3 px-4 md:px-12 text-[9px]">
        {bottomBar}
      </footer>
    );
  }

  return (
    <footer className={`bg-white border-t border-gray-100 pt-8 md:pt-12 ${compact ? 'pb-6 md:pb-6' : 'pb-20 md:pb-8'} px-6 md:px-12 text-sm`}>
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-6 md:gap-12 mb-6 md:mb-8 text-left">
        {/* Brand Column */}
        <div className="col-span-2 md:col-span-1">
          <Link to={lp("/")} className="block mb-3 md:mb-4">
            <BrandLogo tagline imgClassName="h-7 w-auto object-contain" textClassName="font-serif text-xl font-bold text-primary tracking-tight" taglineClassName="brand-lema text-primary/50 text-xs tracking-wide mt-1" />
          </Link>
          <p className="text-primary/60 text-xs leading-relaxed max-w-xs font-medium">
            {t('footer.tagline')}
          </p>
        </div>

        {/* Menu Column */}
        <div>
          <h5 className="font-black text-[11px] uppercase tracking-widest text-primary mb-2">{t('footer.menu')}</h5>
          <ul className="space-y-1.5 text-primary/50 text-[11px] font-bold uppercase tracking-wider">
            <li><Link className="hover:text-primary transition" to={lp("/")}>{t('footer.home')}</Link></li>
            <li><Link className="hover:text-primary transition" to={lp("/proyectos")}>{t('footer.projects')}</Link></li>
            <li><Link className="hover:text-primary transition" to={lp("/blog")}>{t('footer.blog')}</Link></li>
            <li><Link className="hover:text-primary transition" to={lp("/faq")}>{t('nav.faq')}</Link></li>
            {guides.map((g) => <li key={g.href}><Link className="hover:text-primary transition" to={g.href}>{g.label}</Link></li>)}
            <li><Link className="hover:text-primary transition" to={lp("/contacto")}>{t('footer.contact')}</Link></li>
          </ul>
        </div>

        {/* Offices, hours & social (desde Configuración → Datos de empresa) */}
        <div>
          <h5 className="font-black text-[11px] uppercase tracking-widest text-primary mb-2">{t('footer.offices')}</h5>
          <ul className="space-y-2 text-primary/50 text-[11px] font-bold tracking-wider mb-4">
            {/* Direcciones completas solo en /contacto (regla de negocio + SEO). */}
            <li>
              <Link to={lp("/contacto")} className="flex items-start gap-2 hover:text-primary transition">
                <span className="material-symbols-outlined text-base">location_on</span> Madrid · Bali
              </Link>
            </li>
          </ul>

          {hoursEntries.length > 0 && (
            <div className="mb-4 text-[11px] text-primary/50 font-medium space-y-0.5">
              {hoursEntries.map(([k, v]) => (
                <div key={k} className="flex gap-2"><span className="font-bold text-primary/70 w-8">{t('footer.days.' + k, { defaultValue: DAY_LABEL[k] || k })}</span> {v}</div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {socials.map((s, i) => {
              const net = s.network || s.label || 'website';
              return (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={net}
                   className={`w-9 h-9 rounded-full flex items-center justify-center hover:text-white transition duration-300 ${networkClass(net)}`}>
                  <SocialIcon network={net} />
                </a>
              );
            })}
            <Link to={lp("/contacto")} className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition duration-300" aria-label={t('footer.scheduleVideocall')}>
              <span className="material-symbols-outlined text-lg">videocam</span>
            </Link>
          </div>
        </div>
      </div>
      <p className="max-w-7xl mx-auto text-[10px] italic text-primary/40 leading-snug mb-3">{t('footer.disclaimer')}</p>
      {bottomBar}
    </footer>
  );
};

export default Footer;

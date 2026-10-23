import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../lib/version';
import { supabase } from '../lib/supabase';
import { SocialIcon } from '../lib/socials';
import { BRAND_LEMA } from './BrandLogo';
import { bookingLink } from '../lib/bookingLink';

const DAY_LABEL: Record<string, string> = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };

// Una dirección puede ser texto plano (compat) o {text, maps}. Normaliza.
interface AddressN { text: string; maps: string; }
const normAddress = (a: any): AddressN =>
  typeof a === 'string' ? { text: a, maps: '' } : { text: a?.text || '', maps: a?.maps || '' };
const addressHref = (a: AddressN) => a.maps || `https://maps.google.com/?q=${encodeURIComponent(a.text)}`;

const Footer: React.FC = () => {
  const { t } = useTranslation();
  const [brand, setBrand] = useState<any>(null);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('app_config').select('value').eq('key', 'brand').maybeSingle();
      setBrand(data?.value || {});
    })();
  }, []);

  const addresses: AddressN[] = ((brand?.addresses && brand.addresses.length) ? brand.addresses : ['Jl. Pratu Rai Madra No.15, Cemagi, Bali'])
    .map(normAddress).filter((a: AddressN) => a.text);
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

  const linkCls = 'inline-block py-1.5 text-almond/70 hover:text-almond transition-colors duration-300';
  return (
    <footer className="bg-primary text-almond pt-16 md:pt-24 pb-28 md:pb-10 overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-5 md:px-12">
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-x-6 gap-y-12 pb-14 md:pb-20 border-b border-almond/15 text-left">
          {/* Marca + lema */}
          <div className="col-span-2 lg:col-span-5">
            <p className="font-serif text-2xl md:text-3xl leading-snug text-almond max-w-md">{t('footer.tagline')}</p>
            <a href={bookingLink({ medium: 'cta_footer' })} target="_blank" rel="noopener noreferrer" className="us-btn us-btn-light mt-8">
              {t('nav.scheduleCall')} <span className="material-symbols-outlined">arrow_forward</span>
            </a>
          </div>

          {/* Menú */}
          <div className="lg:col-span-2 lg:col-start-7">
            <h2 className="us-label text-almond/45 mb-4">{t('footer.menu')}</h2>
            <ul className="space-y-1 text-[15px]">
              <li><Link className={linkCls} to="/">{t('footer.home')}</Link></li>
              <li><Link className={linkCls} to="/proyectos">{t('footer.projects')}</Link></li>
              <li><Link className={linkCls} to="/blog">{t('footer.blog')}</Link></li>
              <li><Link className={linkCls} to="/faq">{t('nav.faq')}</Link></li>
              <li><Link className={linkCls} to="/contacto">{t('footer.contact')}</Link></li>
            </ul>
          </div>

          {/* Sedes, horario y redes (Configuración → Datos de empresa) */}
          <div className="lg:col-span-4">
            <h2 className="us-label text-almond/45 mb-4">{t('footer.offices')}</h2>
            <ul className="space-y-3 text-[15px] mb-6">
              {addresses.map((addr, i) => (
                <li key={i}>
                  <a href={addressHref(addr)} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 text-almond/70 hover:text-almond transition-colors">
                    <span className="material-symbols-outlined text-[18px] mt-0.5 text-clay-light">location_on</span> <span>{addr.text}</span>
                  </a>
                </li>
              ))}
            </ul>

            {hoursEntries.length > 0 && (
              <div className="mb-6 text-sm text-almond/60 space-y-0.5 us-num">
                {hoursEntries.map(([k, v]) => (
                  <div key={k} className="flex gap-3"><span className="font-semibold text-almond/80 w-10">{t('footer.days.' + k, { defaultValue: DAY_LABEL[k] || k })}</span> {v}</div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {socials.map((s, i) => {
                const net = s.network || s.label || 'website';
                return (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={net}
                     className="w-11 h-11 rounded-full border border-almond/25 text-almond flex items-center justify-center hover:bg-almond hover:text-primary transition-colors duration-300">
                    <SocialIcon network={net} />
                  </a>
                );
              })}
              <Link to="/contacto" className="w-11 h-11 rounded-full border border-almond/25 text-almond flex items-center justify-center hover:bg-almond hover:text-primary transition-colors duration-300" aria-label={t('footer.scheduleVideocall')}>
                <span className="material-symbols-outlined text-xl">videocam</span>
              </Link>
            </div>
          </div>
        </div>

        {/* El logotipo a escala de fachada + lema oficial. */}
        <Link to="/" className="block pt-10 md:pt-14 outline-none focus-visible:ring-2 focus-visible:ring-clay-light" aria-label="Unreal Studio">
          <span className="font-logo block text-almond leading-[0.85] text-[15.5vw] xl:text-[14rem] whitespace-nowrap">Unreal Studio</span>
          <span className="brand-lema block text-almond/55 text-lg md:text-2xl mt-3 md:mt-4">{BRAND_LEMA}</span>
        </Link>

        <div className="mt-10 md:mt-14 pt-6 border-t border-almond/15 flex flex-col md:flex-row justify-between md:items-center gap-5 us-label text-almond/40">
          <p>{t('footer.rights')} <span className="normal-case tracking-normal">· v{APP_VERSION}</span></p>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Link className="py-1 hover:text-almond transition-colors" to="/privacidad">{t('footer.privacy')}</Link>
            <Link className="py-1 hover:text-almond transition-colors" to="/terminos">{t('footer.terms')}</Link>
            {/* Enlaces de portal: <a> con carga COMPLETA a propósito (manifest por portal). */}
            <a className="py-1 hover:text-almond transition-colors flex items-center gap-1.5" href="/cliente">
              <span className="material-symbols-outlined text-sm">person</span> {t('footer.clients')}
            </a>
            {/* Agencias OCULTO temporalmente de la web pública (Andreas, 2026-06-18) */}
            <a className="py-1 hover:text-almond transition-colors flex items-center gap-1.5" href="/empleados">
              <span className="material-symbols-outlined text-sm">badge</span> {t('footer.team')}
            </a>
            <a className="py-1 hover:text-almond transition-colors flex items-center gap-1.5" href="/admin/login">
              <span className="material-symbols-outlined text-sm">settings</span> {t('footer.admin')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

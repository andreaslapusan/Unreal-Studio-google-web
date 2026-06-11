import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { WHATSAPP_URL } from '../constants';
import { APP_VERSION } from '../lib/version';
import { supabase } from '../lib/supabase';
import { SocialIcon, networkClass } from '../lib/socials';
import BrandLogo from './BrandLogo';

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

  return (
    <footer className="bg-white border-t border-gray-100 pt-10 md:pt-20 pb-24 md:pb-12 px-6 md:px-12 text-sm">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-8 md:gap-16 mb-8 md:mb-16 text-left">
        {/* Brand Column */}
        <div className="col-span-2 md:col-span-1">
          <Link to="/" className="block mb-4 md:mb-8">
            <BrandLogo tagline imgClassName="h-9 w-auto object-contain" textClassName="font-serif text-2xl font-bold text-primary tracking-tight" taglineClassName="brand-lema text-primary/50 text-sm tracking-wide mt-1.5" />
          </Link>
          <p className="text-primary/60 text-sm leading-relaxed max-w-xs font-medium">
            {t('footer.tagline')}
          </p>
        </div>

        {/* Menu Column */}
        <div>
          <h5 className="font-black text-xs uppercase tracking-widest text-primary mb-3">{t('footer.menu')}</h5>
          <ul className="space-y-2 text-primary/50 text-xs font-bold uppercase tracking-wider">
            <li><Link className="hover:text-primary transition" to="/">{t('footer.home')}</Link></li>
            <li><Link className="hover:text-primary transition" to="/proyectos">{t('footer.projects')}</Link></li>
            <li><Link className="hover:text-primary transition" to="/blog">{t('footer.blog')}</Link></li>
            <li><Link className="hover:text-primary transition" to="/contacto">{t('footer.contact')}</Link></li>
          </ul>
        </div>

        {/* Offices, hours & social (desde Configuración → Datos de empresa) */}
        <div>
          <h5 className="font-black text-xs uppercase tracking-widest text-primary mb-3">{t('footer.offices')}</h5>
          <ul className="space-y-3 text-primary/50 text-xs font-bold tracking-wider mb-6">
            {addresses.map((addr, i) => (
              <li key={i}>
                <a href={addressHref(addr)} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 hover:text-primary transition">
                  <span className="material-symbols-outlined text-base">location_on</span> {addr.text}
                </a>
              </li>
            ))}
          </ul>

          {hoursEntries.length > 0 && (
            <div className="mb-6 text-[11px] text-primary/50 font-medium space-y-0.5">
              {hoursEntries.map(([k, v]) => (
                <div key={k} className="flex gap-2"><span className="font-bold text-primary/70 w-8">{DAY_LABEL[k] || k}</span> {v}</div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            {socials.map((s, i) => {
              const net = s.network || s.label || 'website';
              return (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={net}
                   className={`w-11 h-11 rounded-full flex items-center justify-center hover:text-white transition duration-300 ${networkClass(net)}`}>
                  <SocialIcon network={net} />
                </a>
              );
            })}
            <Link to="/contacto" className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition duration-300" aria-label="Agendar Videollamada">
              <span className="material-symbols-outlined text-xl">videocam</span>
            </Link>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-[10px] font-bold uppercase tracking-widest text-primary/30 border-t border-primary/5 pt-6">
        <p>{t('footer.rights')} <span className="text-primary/40 normal-case">· v{APP_VERSION}</span></p>
        <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-3 mt-6 md:mt-0">
          <Link className="hover:text-primary transition" to="/privacidad">{t('footer.privacy')}</Link>
          <Link className="hover:text-primary transition" to="/terminos">{t('footer.terms')}</Link>
          {/* Enlaces de portal: <a> con carga COMPLETA (no react-router Link) a propósito,
              para que al entrar quede fijado el manifest del portal y se pueda instalar
              cada uno como su propia app desde aquí. Ver index.html (script de manifest). */}
          <a className="hover:text-primary transition flex items-center gap-1" href="/cliente">
            <span className="material-symbols-outlined text-xs">person</span> {t('footer.clients')}
          </a>
          <a className="hover:text-primary transition flex items-center gap-1" href="/agencias/login">
            <span className="material-symbols-outlined text-xs">person_add</span> {t('footer.agencies')}
          </a>
          <a className="hover:text-primary transition flex items-center gap-1" href="/empleados">
            <span className="material-symbols-outlined text-xs">badge</span> {t('footer.team')}
          </a>
          <a className="hover:text-primary transition flex items-center gap-1" href="/admin/login">
            <span className="material-symbols-outlined text-xs">settings</span> {t('footer.admin')}
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

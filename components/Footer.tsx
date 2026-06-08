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
  const socials: { network?: string; label?: string; url: string }[] = (brand?.socials && brand.socials.length)
    ? brand.socials.filter((s: any) => s?.url)
    : [{ network: 'instagram', url: 'https://instagram.com/unrealstudiobali' }, { network: 'whatsapp', url: WHATSAPP_URL }];
  const hours: Record<string, string> = brand?.hours || {};
  const hoursEntries = Object.entries(hours).filter(([, v]) => v);

  return (
    <footer className="bg-white border-t border-gray-100 pt-16 md:pt-24 pb-28 md:pb-12 px-6 md:px-12 text-sm">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16 mb-16 md:mb-20 text-left">
        {/* Brand Column */}
        <div className="col-span-1">
          <Link to="/" className="block mb-6 md:mb-8">
            <BrandLogo imgClassName="h-9 w-auto object-contain" textClassName="font-serif text-2xl font-bold text-primary tracking-tight" />
          </Link>
          <p className="text-primary/60 text-sm leading-relaxed max-w-xs font-medium">
            {t('footer.tagline')}
          </p>
        </div>

        {/* Menu Column */}
        <div>
          <h5 className="font-black text-xs uppercase tracking-widest text-primary mb-6">{t('footer.menu')}</h5>
          <ul className="space-y-4 text-primary/50 text-xs font-bold uppercase tracking-wider">
            <li><Link className="hover:text-primary transition" to="/">{t('footer.home')}</Link></li>
            <li><Link className="hover:text-primary transition" to="/proyectos">{t('footer.projects')}</Link></li>
            <li><Link className="hover:text-primary transition" to="/blog">{t('footer.blog')}</Link></li>
            <li><Link className="hover:text-primary transition" to="/contacto">{t('footer.contact')}</Link></li>
          </ul>
        </div>

        {/* Offices, hours & social (desde Configuración → Datos de empresa) */}
        <div>
          <h5 className="font-black text-xs uppercase tracking-widest text-primary mb-6">{t('footer.offices')}</h5>
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
                   className={`w-10 h-10 rounded-full flex items-center justify-center hover:text-white transition duration-300 ${networkClass(net)}`}>
                  <SocialIcon network={net} />
                </a>
              );
            })}
            <Link to="/contacto" className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition duration-300" aria-label="Agendar Videollamada">
              <span className="material-symbols-outlined text-xl">videocam</span>
            </Link>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-[10px] font-bold uppercase tracking-widest text-primary/30 border-t border-primary/5 pt-10">
        <p>{t('footer.rights')} <span className="text-primary/40 normal-case">· v{APP_VERSION}</span></p>
        <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-3 mt-6 md:mt-0">
          <Link className="hover:text-primary transition" to="/privacidad">{t('footer.privacy')}</Link>
          <Link className="hover:text-primary transition" to="/terminos">{t('footer.terms')}</Link>
          <Link className="hover:text-primary transition flex items-center gap-1" to="/cliente">
            <span className="material-symbols-outlined text-xs">person</span> {t('footer.clients')}
          </Link>
          <Link className="hover:text-primary transition flex items-center gap-1" to="/agencias/login">
            <span className="material-symbols-outlined text-xs">person_add</span> {t('footer.agencies')}
          </Link>
          <Link className="hover:text-primary transition flex items-center gap-1" to="/empleados">
            <span className="material-symbols-outlined text-xs">badge</span> {t('footer.team')}
          </Link>
          <Link className="hover:text-primary transition flex items-center gap-1" to="/admin/login">
            <span className="material-symbols-outlined text-xs">settings</span> {t('footer.admin')}
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

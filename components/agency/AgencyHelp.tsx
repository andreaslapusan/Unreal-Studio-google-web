/** Ayuda: cómo funciona el programa de agencias + contacto con el equipo Unreal. */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { whatsappUrl } from '../../constants';
import { card, btnPrimary, btnGhost, SectionTitle } from './ui';

export default function AgencyHelp({ agencyName }: { agencyName: string }) {
  const { t } = useTranslation();
  const steps = [1, 2, 3, 4].map((i) => ({ title: t(`agencyPortal.help.step${i}Title`), body: t(`agencyPortal.help.step${i}Body`) }));

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <SectionTitle title={t('agencyPortal.nav.help')} sub={t('agencyPortal.help.sub')} />

      <section className={card}>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('agencyPortal.help.howTitle')}</h3>
        <ol className="grid md:grid-cols-2 gap-4">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-primary text-white text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
              <div>
                <p className="text-sm font-bold text-primary">{s.title}</p>
                <p className="text-sm text-primary/60 mt-0.5 leading-relaxed">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={card}>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('agencyPortal.help.commTitle')}</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-3xl font-black text-primary">5%</p>
            <p className="text-sm font-bold text-primary mt-1">{t('agencyPortal.help.modeATitle')}</p>
            <p className="text-sm text-primary/60 mt-1">{t('agencyPortal.help.modeABody')}</p>
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-3xl font-black text-primary">3%</p>
            <p className="text-sm font-bold text-primary mt-1">{t('agencyPortal.help.modeBTitle')}</p>
            <p className="text-sm text-primary/60 mt-1">{t('agencyPortal.help.modeBBody')}</p>
          </div>
        </div>
        <p className="text-xs text-primary/50 mt-4 leading-relaxed">{t('agencyPortal.help.commNote')}</p>
      </section>

      <section className={card}>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-1">{t('agencyPortal.help.contactTitle')}</h3>
        <p className="text-sm text-primary/60 mb-4">{t('agencyPortal.help.contactBody')}</p>
        <div className="flex flex-wrap gap-2">
          <a href={whatsappUrl(t('agencyPortal.help.waText', { agency: agencyName }))} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
            <span className="material-symbols-outlined text-base">chat</span>WhatsApp
          </a>
          <a href="mailto:hello@unrealstudiobali.com" className={btnGhost}>
            <span className="material-symbols-outlined text-base">mail</span>hello@unrealstudiobali.com
          </a>
        </div>
      </section>
    </div>
  );
}

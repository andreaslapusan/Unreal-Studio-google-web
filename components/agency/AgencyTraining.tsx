/** Formación: guía rápida de venta (argumentos, objeciones, proceso, reglas). Contenido estático vía i18n. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { card, SectionTitle } from './ui';

const N = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export default function AgencyTraining() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(1);

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <SectionTitle title={t('agencyPortal.nav.training')} sub={t('agencyPortal.training.sub')} />

      <section className={card}>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('agencyPortal.training.pitchTitle')}</h3>
        <ul className="grid md:grid-cols-2 gap-4">
          {N(4).map((i) => (
            <li key={i} className="flex gap-3">
              <span className="material-symbols-outlined text-xl text-green-700 shrink-0">check_circle</span>
              <p className="text-sm text-primary/80 leading-relaxed">{t(`agencyPortal.training.pitch${i}`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${card} !p-0 overflow-hidden`}>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 px-5 pt-5 pb-2">{t('agencyPortal.training.objTitle')}</h3>
        <ul className="divide-y divide-gray-100">
          {N(6).map((i) => (
            <li key={i}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition">
                <span className="flex-1 text-sm font-bold text-primary">{t(`agencyPortal.training.q${i}`)}</span>
                <span className="material-symbols-outlined text-primary/40">{open === i ? 'expand_less' : 'expand_more'}</span>
              </button>
              {open === i && <p className="px-5 pb-4 -mt-1 text-sm text-primary/70 leading-relaxed">{t(`agencyPortal.training.a${i}`)}</p>}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [&>*]:min-w-0">
        <section className={card}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('agencyPortal.training.processTitle')}</h3>
          <ol className="space-y-4">
            {N(6).map((i) => (
              <li key={i} className="flex gap-3">
                <span className="w-7 h-7 rounded-full bg-primary text-white text-xs font-black flex items-center justify-center shrink-0">{i}</span>
                <p className="text-sm text-primary/80 leading-relaxed pt-0.5">{t(`agencyPortal.training.p${i}`)}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className={card}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('agencyPortal.training.rulesTitle')}</h3>
          <ul className="space-y-4">
            {N(4).map((i) => (
              <li key={i} className="flex gap-3">
                <span className="material-symbols-outlined text-xl text-amber-600 shrink-0">priority_high</span>
                <p className="text-sm text-primary/80 leading-relaxed">{t(`agencyPortal.training.r${i}`)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

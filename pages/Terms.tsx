import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const Terms: React.FC = () => {
  const { t } = useTranslation();
  useEffect(() => { document.title = t('terms.docTitle'); }, [t]);

  return (
    <div className="bg-almond min-h-screen pt-16 pb-24 px-6 md:px-12 transition-colors duration-300">
      <div className="max-w-4xl mx-auto bg-white rounded-[3rem] p-10 md:p-20 shadow-xl text-left border border-primary/5">
        <h1 className="text-5xl text-primary mb-12">{t('terms.title')}</h1>

        <div className="space-y-10 text-primary/70 leading-relaxed font-light text-lg">
          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('terms.s1H')}</h2>
            <p>{t('terms.s1P')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('terms.s2H')}</h2>
            <p>{t('terms.s2P')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('terms.s3H')}</h2>
            <p>{t('terms.s3P')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('terms.s4H')}</h2>
            <p>{t('terms.s4P')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('terms.s5H')}</h2>
            <p>
              {t('terms.s5P_pre')}<em>{t('terms.s5P_em')}</em>{t('terms.s5P_post')}
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('terms.s6H')}</h2>
            <p>{t('terms.s6P')}</p>
          </section>

          <section className="pt-10 border-t border-primary/10 text-sm italic">
            <p>{t('terms.copyright')}</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Terms;

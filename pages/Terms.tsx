import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const Terms: React.FC = () => {
  const { t } = useTranslation();
  useEffect(() => { document.title = t('terms.docTitle'); }, [t]);

  return (
    <div className="bg-almond min-h-screen pt-10 md:pt-16 pb-24 md:pb-32 px-5 md:px-12">
      <div className="max-w-[1440px] mx-auto text-left">
                <h1 className="font-display uppercase text-[2.4rem] leading-[0.95] sm:text-6xl md:text-7xl text-primary mb-12 md:mb-20 max-w-5xl us-rise">{t('terms.title')}</h1>

        <div className="space-y-12 text-primary/70 leading-relaxed text-base md:text-lg max-w-[68ch] lg:ml-[33%]">
          <section>
            <h2 className="us-label text-clay mb-4">{t('terms.s1H')}</h2>
            <p>{t('terms.s1P')}</p>
          </section>

          <section>
            <h2 className="us-label text-clay mb-4">{t('terms.s2H')}</h2>
            <p>{t('terms.s2P')}</p>
          </section>

          <section>
            <h2 className="us-label text-clay mb-4">{t('terms.s3H')}</h2>
            <p>{t('terms.s3P')}</p>
          </section>

          <section>
            <h2 className="us-label text-clay mb-4">{t('terms.s4H')}</h2>
            <p>{t('terms.s4P')}</p>
          </section>

          <section>
            <h2 className="us-label text-clay mb-4">{t('terms.s5H')}</h2>
            <p>
              {t('terms.s5P_pre')}<em>{t('terms.s5P_em')}</em>{t('terms.s5P_post')}
            </p>
          </section>

          <section>
            <h2 className="us-label text-clay mb-4">{t('terms.s6H')}</h2>
            <p>{t('terms.s6P')}</p>
          </section>

          <section className="pt-10 border-t border-primary/15 text-sm text-primary/55">
            <p>{t('terms.copyright')}</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Terms;

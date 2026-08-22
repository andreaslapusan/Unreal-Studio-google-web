import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const Privacy: React.FC = () => {
  const { t } = useTranslation();
  useEffect(() => { document.title = t('privacy.docTitle'); }, [t]);

  const purposeList = t('privacy.purposeList', { returnObjects: true }) as string[];
  const collectList1 = t('privacy.collectList1', { returnObjects: true }) as string[];
  const collectList2 = t('privacy.collectList2', { returnObjects: true }) as string[];
  const legitimacyList = t('privacy.legitimacyList', { returnObjects: true }) as string[];
  const rightsList = t('privacy.rightsList', { returnObjects: true }) as string[];

  return (
    <div className="bg-almond min-h-screen pt-16 pb-24 px-6 md:px-12 transition-colors duration-300">
      <div className="max-w-4xl mx-auto bg-white rounded-[3rem] p-8 md:p-16 lg:p-20 shadow-xl text-left border border-primary/5">
        <h1 className="text-4xl md:text-5xl text-primary mb-12">{t('privacy.title')}</h1>

        <div className="space-y-12 text-primary/80 leading-relaxed font-light text-base md:text-lg">
          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.whoWeAreH')}</h2>
            <p>
              {t('privacy.whoWeArePre')} <a href="https://unrealstudiobali.com" className="underline font-medium">https://unrealstudiobali.com</a>{t('privacy.whoWeArePost')}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.controllerH')}</h2>
            <p>{t('privacy.controllerP')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.dataH')}</h2>
            <p>{t('privacy.dataP1')}</p>
            <p className="mt-4">{t('privacy.dataP2')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.purposeH')}</h2>
            <p>{t('privacy.purposeP')}</p>
            <ul className="list-disc ml-6 mt-4 space-y-2">
              {purposeList.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.collectH')}</h2>
            <p>{t('privacy.collectP1')}</p>
            <ul className="list-disc ml-6 mt-4 space-y-2">
              {collectList1.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
            <p className="mt-6">{t('privacy.collectP2')}</p>
            <ul className="list-disc ml-6 mt-4 space-y-2">
              {collectList2.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.legitimacyH')}</h2>
            <p>{t('privacy.legitimacyP')}</p>
            <ul className="list-disc ml-6 mt-4 space-y-2">
              {legitimacyList.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.cookiesH')}</h2>
            <p>{t('privacy.cookiesP1')}</p>
            <p className="mt-4">{t('privacy.cookiesP2')}</p>
            <p className="mt-4">{t('privacy.cookiesP3')}</p>
            <p className="mt-4">{t('privacy.cookiesP4')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.embeddedH')}</h2>
            <p>{t('privacy.embeddedP1')}</p>
            <p className="mt-4">{t('privacy.embeddedP2')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.shareH')}</h2>
            <p>{t('privacy.shareP1')}</p>
            <p className="mt-4">{t('privacy.shareP2')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.retentionH')}</h2>
            <p>{t('privacy.retentionP1')}</p>
            <p className="mt-4">{t('privacy.retentionP2')}</p>
            <p className="mt-4">{t('privacy.retentionP3')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.rightsH')}</h2>
            <p>{t('privacy.rightsP1')}</p>
            <p className="mt-4">{t('privacy.rightsP2')}</p>
            <ul className="list-disc ml-6 mt-4 space-y-2">
              {rightsList.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
            <p className="mt-6">{t('privacy.rightsP3')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.complaintH')}</h2>
            <p>{t('privacy.complaintP1')}</p>
            <p className="mt-4">{t('privacy.complaintP2')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.securityH')}</h2>
            <p>{t('privacy.securityP1')}</p>
            <p className="mt-4">{t('privacy.securityP2')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.changesH')}</h2>
            <p>{t('privacy.changesP1')}</p>
            <p className="mt-4 italic">{t('privacy.changesP2')}</p>
          </section>

          <section className="pt-10 border-t border-primary/10">
            <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-widest text-sm">{t('privacy.contactH')}</h2>
            <p>{t('privacy.contactP')}</p>
            <div className="mt-4 p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="font-bold text-primary">{t('privacy.contactName')}</p>
              <p className="text-sm">{t('privacy.contactWebsiteLabel')} <a href="https://unrealstudiobali.com" className="underline">https://unrealstudiobali.com</a></p>
            </div>
          </section>

          <section className="text-[10px] uppercase font-bold tracking-widest text-primary/40 pt-10">
            {t('privacy.compliance')}
          </section>
        </div>
      </div>
    </div>
  );
};

export default Privacy;

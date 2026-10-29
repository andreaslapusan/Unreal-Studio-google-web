/** Landing SEO (content/landings/<id>/<lang>.html) con la presentación de los posts. */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ArticleView from '../components/ArticleView';
import { usePageMeta } from '../components/PageMeta';
import { getImageUrl } from '../lib/supabase';
import { uiLocale } from '../lib/dateLocale';
import { landingById, loadLandingBody, type LandingLang } from '../lib/landings';

export default function LandingPage({ id, lang }: { id: string; lang: LandingLang }) {
  const { t } = useTranslation();
  const landing = landingById(id)!;
  const meta = landing.meta[lang] ?? landing.meta.en!;
  const image = getImageUrl(landing.image);
  const [html, setHtml] = useState('');
  useEffect(() => {
    let alive = true;
    void loadLandingBody(id, lang).then((h) => { if (alive) setHtml(h); });
    return () => { alive = false; };
  }, [id, lang]);
  usePageMeta({ title: meta.title, description: meta.description, image, type: 'article' });
  const dateText = new Date(landing.dateModified).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  return <ArticleView title={meta.h1} image={image} dateText={dateText} html={html} backTo={`/${lang}/proyectos`} backLabel={t('nav.projects')} />;
}

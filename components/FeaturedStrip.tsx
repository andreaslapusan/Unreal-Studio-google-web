/** Franja "Aparecemos en": logos de medios/perfiles donde sale Unreal Studio Bali (datos en public/featured/featured.json). */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Featured = { outlet: string; url: string; logo: string };

export default function FeaturedStrip() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Featured[]>([]);

  useEffect(() => {
    fetch('/featured/featured.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setItems(Array.isArray(d) ? d.filter((x) => x?.outlet && /^https:\/\//.test(x.url) && x.logo) : []))
      .catch(() => setItems([]));
  }, []);

  if (items.length < 3) return null;

  const label = t('home.featuredIn');
  const list = (dup: boolean) => (
    <ul className="featured-marquee__list" aria-hidden={dup || undefined}>
      {items.map((it) => (
        <li key={it.url}>
          <a href={it.url} target="_blank" rel="noopener noreferrer" tabIndex={dup ? -1 : undefined} title={it.outlet}>
            <img src={it.logo} alt={dup ? '' : it.outlet} loading="lazy" decoding="async" />
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-label={label} className="px-6 md:px-12 pb-10 md:pb-12 max-w-7xl mx-auto">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 mb-4 text-center">{label}</p>
      <div className="featured-marquee">
        <div className="featured-marquee__track">
          {list(false)}
          {list(true)}
        </div>
      </div>
    </section>
  );
}

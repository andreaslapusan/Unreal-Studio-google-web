import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LazyMapProps {
  embedUrl: string;
  className?: string;
}

// Don't ship the iframe DOM until the section is near the viewport.
// Chrome's loading="lazy" still kicks off the connection eagerly enough
// that this section was costing ~155 KiB on initial project-page load.
// IntersectionObserver with a generous rootMargin keeps the perceived
// experience identical (the map is ready by the time the user scrolls
// to it) without the upfront cost.
const LazyMap: React.FC<LazyMapProps> = ({ embedUrl, className }) => {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (shouldMount) return;
    const node = wrapRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldMount(true);
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setShouldMount(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [shouldMount]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ height: '400px', background: '#f5f1ea' }}
    >
      {shouldMount && (
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={t('fix.map.iframeTitle')}
        />
      )}
    </div>
  );
};

export default LazyMap;

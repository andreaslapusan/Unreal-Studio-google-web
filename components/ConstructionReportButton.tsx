import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { portalPath } from '../lib/portalUrls';

/** Botón público "Último reporte de obra": el reporte es privado, así que abre un
 *  popup con acceso al portal de clientes o un mailto a hello@ para pedir acceso. */
const ConstructionReportButton: React.FC<{ projectName: string; className?: string }> = ({ projectName, className }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const mailto = `mailto:hello@unrealstudiobali.com?subject=${encodeURIComponent(t('projectDetail.reportMailSubject', { project: projectName }))}&body=${encodeURIComponent(t('projectDetail.reportMailBody', { project: projectName }))}`;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <span className="material-symbols-outlined">construction</span>
        {t('projectDetail.reportBtn')}
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="relative bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close', { defaultValue: 'Cerrar' })} className="absolute top-4 right-4 text-primary/50 hover:text-primary">
              <span className="material-symbols-outlined">close</span>
            </button>
            <h3 className="text-2xl font-serif text-primary mb-2 pr-8">{t('projectDetail.reportModalTitle')}</h3>
            <p className="text-sm text-primary/60 mb-6">{t('projectDetail.reportModalText')}</p>
            <div className="space-y-3">
              <Link to={portalPath('cliente')} className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 min-h-14 text-center leading-tight rounded-2xl font-bold border border-primary hover:bg-almond hover:text-primary transition">
                <span className="material-symbols-outlined">login</span>{t('projectDetail.reportLogin')}
              </Link>
              <a href={mailto} className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 min-h-14 text-center leading-tight rounded-2xl font-bold border border-primary hover:bg-almond hover:text-primary transition">
                <span className="material-symbols-outlined">mail</span>{t('projectDetail.reportRequest')}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ConstructionReportButton;

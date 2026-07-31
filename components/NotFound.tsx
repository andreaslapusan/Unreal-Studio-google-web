import React from 'react';
import { useTranslation } from 'react-i18next';

// Pantalla 404 traducida (antes iba hardcodeada en español).
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-almond px-6 text-center">
      <h1 className="text-8xl font-serif text-primary mb-4">404</h1>
      <p className="text-2xl text-primary/70 mb-8">{t('notFound.msg', { defaultValue: 'Esta página no existe o ha sido movida.' })}</p>
      <a href="/" className="bg-primary text-white px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition">
        {t('notFound.back', { defaultValue: 'Volver al inicio' })}
      </a>
    </div>
  );
}

/**
 * PhotoManager — gestor de fotos UNIFICADO para los dos editores (propiedad en
 * AdminDashboard y formulario de listing en /listing). Pedido por Andreas
 * (2026-10-05):
 *  - Miniaturas a COLOR REAL (sin filtro oscuro cubriendo la foto; las acciones
 *    van en una esquina con un degradado mínimo).
 *  - Click en la foto → se AMPLÍA en un lightbox (color/tamaño real).
 *  - ARRASTRAR para reordenar (la 1ª foto es la principal).
 *  - Botón para marcar una foto como PRINCIPAL (en vez de un campo aparte).
 *  - Botón de eliminar.
 *
 * Trabaja sobre un array de URLs/paths (getImageUrl resuelve a URL pública).
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getImageUrl } from '../lib/supabase';
import { thumbSrc, imgFallback } from '../lib/imageOptimize';

interface PhotoManagerProps {
  photos: string[];
  onReorder: (next: string[]) => void;
  onRemove: (url: string, index: number) => void;
  /** Foto marcada como principal (si no se pasa, se asume la 1ª del array). */
  mainImage?: string;
  /** Marcar una foto como principal. Si no se pasa, el botón de estrella no se muestra. */
  onSetMain?: (url: string) => void;
  /** Borrar TODAS las fotos de golpe. Si no se pasa, el botón no se muestra. */
  onRemoveAll?: () => void;
  /** Columnas del grid (desktop). Por defecto 6. */
  cols?: number;
}

const PhotoManager: React.FC<PhotoManagerProps> = ({ photos, onReorder, onRemove, mainImage, onSetMain, onRemoveAll, cols = 6 }) => {
  const { t } = useTranslation();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (!photos || photos.length === 0) return null;

  const isMain = (url: string, idx: number) =>
    mainImage ? getImageUrl(url) === getImageUrl(mainImage) : idx === 0;

  const handleDrop = (dropIdx: number) => {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setOverIdx(null); return; }
    const next = [...photos];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dropIdx, 0, moved);
    onReorder(next);
    setDragIdx(null);
    setOverIdx(null);
  };

  const gridCls = cols === 4
    ? 'grid grid-cols-3 sm:grid-cols-4 gap-3'
    : 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3';

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[11px] text-primary/45 font-semibold flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm text-primary/35">drag_indicator</span>
          {t('photoManager.dragHint')}
        </p>
        {onRemoveAll && (
          <button
            type="button"
            onClick={() => { if (window.confirm(t('photoManager.removeAllConfirm', { count: photos.length, defaultValue: `¿Borrar las ${photos.length} fotos de la galería? No se puede deshacer.` }))) onRemoveAll(); }}
            className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-red-500/90 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-lg px-2.5 py-1 transition outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
            {t('photoManager.removeAll', { count: photos.length, defaultValue: `Borrar todas (${photos.length})` })}
          </button>
        )}
      </div>
      <div className={gridCls}>
        {photos.map((img, idx) => {
          const main = isMain(img, idx);
          return (
            <div
              key={`${img}-${idx}`}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              onDragOver={(e) => { e.preventDefault(); if (overIdx !== idx) setOverIdx(idx); }}
              onDrop={() => handleDrop(idx)}
              className={`relative aspect-square rounded-xl overflow-hidden group border transition-[border-color,box-shadow,transform,opacity] duration-200 cursor-grab active:cursor-grabbing
                ${main ? 'border-primary ring-2 ring-primary/40' : 'border-gray-200'}
                ${overIdx === idx && dragIdx !== idx ? 'ring-2 ring-primary/60 scale-[0.97]' : ''}
                ${dragIdx === idx ? 'opacity-40' : ''}`}
            >
              {/* Miniatura LIGERA (thumbSrc ~400px/~40KB) para no congelar el scroll
                  con 20-30 fotos grandes; si el proxy falla, cae a la imagen directa.
                  El lightbox sí usa la original a tamaño/color real. */}
              <img
                src={thumbSrc(getImageUrl(img), 400)}
                onError={imgFallback(getImageUrl(img))}
                loading="lazy"
                decoding="async"
                onClick={() => setLightbox(idx)}
                className="w-full h-full object-cover cursor-zoom-in"
                alt={main ? t('photoManager.main') : ''}
              />

              {/* Badge PRINCIPAL (esquina superior izquierda). */}
              {main && (
                <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase tracking-wider bg-primary text-white px-1.5 py-0.5 rounded-md shadow-sm pointer-events-none">
                  {t('photoManager.main')}
                </span>
              )}

              {/* Acciones: esquina superior derecha, en un chip con degradado
                  mínimo — NO cubren la foto (se ve el color real). */}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                {onSetMain && !main && (
                  <button type="button" title={t('photoManager.setMain')} aria-label={t('photoManager.setMain')}
                    onClick={(e) => { e.stopPropagation(); onSetMain(img); }}
                    className="w-7 h-7 rounded-lg bg-white/90 backdrop-blur text-primary/70 hover:text-primary hover:bg-white shadow flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]">star</span>
                  </button>
                )}
                <button type="button" title={t('photoManager.enlarge')} aria-label={t('photoManager.enlarge')}
                  onClick={(e) => { e.stopPropagation(); setLightbox(idx); }}
                  className="w-7 h-7 rounded-lg bg-white/90 backdrop-blur text-primary/70 hover:text-primary hover:bg-white shadow flex items-center justify-center">
                  <span className="material-symbols-outlined text-[16px]">zoom_in</span>
                </button>
                <button type="button" title={t('photoManager.remove')} aria-label={t('photoManager.remove')}
                  onClick={(e) => { e.stopPropagation(); onRemove(img, idx); }}
                  className="w-7 h-7 rounded-lg bg-white/90 backdrop-blur text-red-500/80 hover:text-white hover:bg-red-500 shadow flex items-center justify-center">
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox: foto a tamaño/color real sobre fondo oscuro. */}
      {lightbox !== null && photos[lightbox] && (
        <div className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightbox(null)}>
          <button type="button" aria-label="×" className="absolute top-6 right-6 text-white/80 hover:text-white hover:scale-110 transition"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
            <span className="material-symbols-outlined text-4xl">close</span>
          </button>
          {photos.length > 1 && (
            <>
              <button type="button" aria-label="‹" className="absolute left-4 md:left-8 text-white/70 hover:text-white hover:scale-110 transition"
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + photos.length) % photos.length); }}>
                <span className="material-symbols-outlined text-4xl md:text-5xl">chevron_left</span>
              </button>
              <button type="button" aria-label="›" className="absolute right-4 md:right-8 text-white/70 hover:text-white hover:scale-110 transition"
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % photos.length); }}>
                <span className="material-symbols-outlined text-4xl md:text-5xl">chevron_right</span>
              </button>
            </>
          )}
          <img src={thumbSrc(getImageUrl(photos[lightbox]), 1600)} onError={imgFallback(getImageUrl(photos[lightbox]))} alt="" onClick={(e) => e.stopPropagation()}
            decoding="async" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200" />
          <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-xs font-bold tracking-widest bg-white/10 px-3 py-1.5 rounded-full">
            {lightbox + 1} / {photos.length}
          </span>
        </div>
      )}
    </div>
  );
};

export default PhotoManager;

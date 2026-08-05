/**
 * PropertyReportsModal — visor de TODOS los reportes de obra subidos a un proyecto.
 *
 * Se abre desde la tarjeta de cada propiedad (Admin → Gestión de propiedades,
 * botón "Reportes" junto a Editar). Lee los mismos datos que sube el equipo en
 * /equipo/upload: property_updates (el reporte) + update_assets (sus ficheros:
 * fotos/vídeos/PDF). Solo lectura — no crea ni borra nada.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { uiLocale } from '../../lib/dateLocale';
import { useEscapeKey } from '../../lib/useEscapeKey';

interface Asset { update_id: string; asset_type: string; external_url: string; file_name: string; position: number; }
interface Report {
  id: string; title: string; summary: string | null; pct_progress_at_update: number | null;
  posted_at: string; posted_by: string | null; visibility: string | null; _assets: Asset[];
}

const PropertyReportsModal: React.FC<{ propertyId: string; propertyName: string; onClose: () => void }> = ({ propertyId, propertyName, onClose }) => {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [supersededCount, setSupersededCount] = useState(0);
  const [loading, setLoading] = useState(true);
  useEscapeKey(onClose, true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: ups } = await supabase
      .from('property_updates')
      .select('id, title, summary, pct_progress_at_update, posted_at, posted_by, visibility')
      .eq('property_id', propertyId)
      .order('posted_at', { ascending: false });
    const rows = (ups ?? []) as Report[];
    const ids = rows.map((r) => r.id);
    const byUpdate: Record<string, Asset[]> = {};
    if (ids.length) {
      const { data: assets } = await supabase
        .from('update_assets')
        .select('update_id, asset_type, external_url, file_name, position')
        .in('update_id', ids);
      for (const a of (assets ?? []) as Asset[]) (byUpdate[a.update_id] = byUpdate[a.update_id] || []).push(a);
    }
    for (const r of rows) r._assets = (byUpdate[r.id] || []).sort((a, b) => (a.position || 0) - (b.position || 0));
    // Adam a veces sube un reporte por error y lo vuelve a subir; NO puede borrar
    // el erróneo. Como cada reporte semanal lleva la fecha en el título
    // ("Reporte de obra | DD MMM YYYY"), nos quedamos SOLO con la última subida
    // (posted_at más reciente) de cada título = la definitiva. rows viene ordenado
    // por posted_at desc, así que la primera aparición de cada título es la buena.
    const seen = new Set<string>();
    const deduped: Report[] = [];
    let hidden = 0;
    for (const r of rows) {
      const key = (r.title || r.id).trim().toLowerCase();
      if (seen.has(key)) { hidden++; continue; }
      seen.add(key);
      deduped.push(r);
    }
    setSupersededCount(hidden);
    setReports(deduped);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { void load(); }, [load]);

  const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; } };

  const icon = (type: string) => type === 'video' ? 'movie' : type === 'pdf' ? 'picture_as_pdf' : type === 'image' ? 'image' : 'attach_file';

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-6 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl font-serif text-primary flex items-center gap-2">
              <span className="material-symbols-outlined">description</span> {t('empleados.reports.title')}
            </h2>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mt-1 truncate">{propertyName}</p>
          </div>
          <button onClick={onClose} aria-label={t('empleados.reports.close')} className="text-primary/40 hover:text-primary shrink-0"><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="overflow-y-auto overscroll-contain p-6 space-y-4">
          {loading ? (
            <p className="text-center text-gray-400 py-10">{t('empleados.reports.loading')}</p>
          ) : reports.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-4xl text-gray-200">folder_open</span>
              <p className="text-gray-400 mt-2">{t('empleados.reports.empty')}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400">
                {t('empleados.reports.count', { n: reports.length })}
                {supersededCount > 0 && <span className="text-gray-300"> · {t('empleados.reports.superseded', { n: supersededCount })}</span>}
              </p>
              {reports.map((r) => (
                <div key={r.id} className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-primary">{r.title}</h3>
                    {r.pct_progress_at_update != null && (
                      <span className="shrink-0 text-[10px] font-black uppercase bg-almond text-primary px-2.5 py-1 rounded-lg">{t('empleados.reports.progress')} {r.pct_progress_at_update}%</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {fmtDate(r.posted_at)}{r.posted_by ? ` · ${r.posted_by}` : ''}
                  </p>
                  {r.summary && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{r.summary}</p>}
                  {r._assets.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                      {r._assets.map((a, i) => (
                        <a key={i} href={a.external_url} target="_blank" rel="noopener noreferrer"
                          className="relative block aspect-square rounded-xl overflow-hidden border border-gray-200 bg-white hover:ring-2 hover:ring-primary/40 transition group/asset"
                          title={a.file_name}>
                          {a.asset_type === 'image' ? (
                            <img src={a.external_url} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-primary/50 gap-1 p-1">
                              <span className="material-symbols-outlined">{icon(a.asset_type)}</span>
                              <span className="text-[8px] text-center truncate w-full px-1">{a.file_name}</span>
                            </div>
                          )}
                          <span className="absolute bottom-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover/asset:opacity-100 transition"><span className="material-symbols-outlined text-[14px] leading-none">open_in_new</span></span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropertyReportsModal;

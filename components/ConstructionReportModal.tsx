/**
 * ConstructionReportModal — popup para subir un REPORTE DE OBRA (solo PDF).
 *
 * Simplísimo (regla de Andreas): elige proyecto + fecha + sube UN PDF. Nada de
 * título, progreso, resumen ni visibilidad. Se abre como modal desde el portal
 * del empleado (no es una página aparte).
 *
 * Los proyectos salen de la tabla `projects` (la viva; `properties` está vacía).
 * El PDF se sube a storage (bucket público `images`) y luego una RPC
 * SECURITY DEFINER (`employee_post_construction_report`) deja el reporte en el
 * historial Y lo fija en el proyecto (construction_update_url/date), de modo que
 * el cliente lo ve al instante en su portal. Así evitamos fricción de RLS.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uiLocale } from '../lib/dateLocale';
import { baliToday } from '../lib/timezone';
import { supabase } from '../lib/supabase';
import { useEscapeKey } from '../lib/useEscapeKey';
import { compressPdf } from '../lib/compressPdf';

interface ProjectOpt { id: string; name: string; }

const ConstructionReportModal: React.FC<{ postedBy: string; onClose: () => void }> = ({ postedBy, onClose }) => {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState('');
  const [reportDate, setReportDate] = useState(baliToday());
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState('');
  // Último reporte fijado en el proyecto (lo que ven los clientes ahora mismo).
  const [last, setLast] = useState<{ url: string | null; date: string | null } | null>(null);
  const [loadingLast, setLoadingLast] = useState(false);
  useEscapeKey(onClose);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('projects').select('id, name').order('name');
      const rows = (data as ProjectOpt[]) ?? [];
      setProjects(rows);
      // Sin preselección: el empleado DEBE elegir un proyecto (regla de Andreas).
    })();
  }, []);

  // Al elegir proyecto, carga el último reporte que ven los clientes.
  const loadLast = async (pid: string) => {
    if (!pid) { setLast(null); return; }
    setLoadingLast(true);
    const { data } = await supabase.from('projects').select('construction_update_url, construction_update_date').eq('id', pid).maybeSingle();
    setLast({ url: (data as any)?.construction_update_url ?? null, date: (data as any)?.construction_update_date ?? null });
    setLoadingLast(false);
  };
  useEffect(() => { void loadLast(projectId); }, [projectId]);

  const pickFile = (f: File | null) => {
    setError('');
    if (f && f.type !== 'application/pdf') { setError(t('empleados.reportModal.onlyPdf')); setFile(null); return; }
    setFile(f);
  };

  const submit = async () => {
    if (!projectId || !file) { setError(t('empleados.reportModal.pickBoth')); return; }
    setState('sending'); setError('');
    try {
      // Comprime el PDF si es pesado (baja ~40MB a ~5-8MB, calidad buena). Si falla
      // o ya es ligero, sube el original — nunca bloquea.
      const toUpload = await compressPdf(file);
      const path = `property-updates/${projectId}/${Date.now()}.pdf`;
      const up = await supabase.storage.from('images').upload(path, toUpload, { contentType: 'application/pdf', upsert: false });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from('images').getPublicUrl(path);
      const { data: res, error: rpcErr } = await supabase.rpc('employee_post_construction_report', {
        p_project_id: projectId,
        p_report_date: reportDate,
        p_pdf_url: pub.publicUrl,
        p_path: path,
        p_file_name: file.name,
        p_file_size: toUpload.size,
      });
      if (rpcErr) throw rpcErr;
      if (res && res.success === false) throw new Error(res.error || 'error');
      setState('ok');
      setFile(null);
      // Refresca el "último reporte" para que Adam CONFIRME que el nuevo ya está
      // fijado (lo que ven los clientes). No cerramos solos: que lo vea él.
      void loadLast(projectId);
    } catch (e) {
      // No mostramos el error crudo de Postgres/RLS al usuario (idioma/internals);
      // mensaje genérico traducido y el detalle a consola.
      console.error('[ConstructionReportModal] upload failed:', e);
      setState('error');
      setError(t('fix.report.uploadFailed', { defaultValue: 'No se pudo subir el reporte. Inténtalo de nuevo.' }));
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-serif text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">description</span> {t('empleados.reportModal.title')}
          </h2>
          <button onClick={onClose} aria-label={t('empleados.reportModal.close')} className="text-primary/40 hover:text-primary"><span className="material-symbols-outlined">close</span></button>
        </div>

        <label className="block mb-4">
          <span className="block text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">{t('empleados.reportModal.project')}</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm">
            <option value="">{projects.length === 0 ? t('empleados.reportModal.noProjects') : t('empleados.reportModal.selectProject')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        {/* Último reporte que ven los clientes para ese proyecto */}
        {projectId && (
          <div className="mb-4 rounded-2xl border border-primary/10 bg-primary/5 p-4">
            <span className="block text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">{t('empleados.reportModal.lastUploaded', { defaultValue: 'Último reporte subido (lo que ven los clientes)' })}</span>
            {loadingLast ? (
              <p className="text-sm text-primary/50">{t('admin.common.loading')}</p>
            ) : last?.url ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary flex items-center gap-1"><span className="material-symbols-outlined text-green-600 text-base leading-none">check_circle</span>{(() => { try { return last.date ? new Date(last.date + 'T00:00:00').toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; } catch { return last.date || '—'; } })()}</p>
                </div>
                <a href={last.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-black bg-primary text-white px-3 py-2 rounded-xl">
                  <span className="material-symbols-outlined text-base leading-none">picture_as_pdf</span> {t('empleados.reportModal.viewPdf', { defaultValue: 'Ver PDF' })}
                </a>
              </div>
            ) : (
              <p className="text-sm text-primary/50">{t('empleados.reportModal.noLast', { defaultValue: 'Aún no hay reporte subido para este proyecto.' })}</p>
            )}
          </div>
        )}

        <label className="block mb-4">
          <span className="block text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">{t('empleados.reportModal.reportDate')}</span>
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm" />
        </label>

        {/* iOS: el selector de archivos solo se abre de forma fiable con un <label
            htmlFor> nativo (no con .click() por JS sobre un input display:none). */}
        <div className="block mb-2">
          <span className="block text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">{t('empleados.reportModal.pdf')}</span>
          <label htmlFor="cr-file" className="block border-2 border-dashed border-primary/25 rounded-2xl p-6 text-center cursor-pointer hover:bg-primary/5 transition">
            <span className="material-symbols-outlined text-3xl text-primary/40">upload_file</span>
            <p className="text-sm text-primary/70 mt-1">{file ? file.name : t('empleados.reportModal.pickPdf')}</p>
            {file && <p className="text-[11px] text-primary/40">{(file.size / 1024 / 1024).toFixed(1)} MB</p>}
          </label>
          <input id="cr-file" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </div>

        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        {state === 'ok' && <p className="text-green-700 text-sm mt-2 font-bold">✓ {t('empleados.reportModal.done')}</p>}

        <button onClick={() => void submit()} disabled={state === 'sending' || !file || !projectId}
          className="w-full mt-5 bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs disabled:opacity-50 flex items-center justify-center gap-2">
          {state === 'sending' && <span className="material-symbols-outlined animate-spin text-base">refresh</span>}
          {state === 'sending' ? t('empleados.reportModal.uploading') : t('empleados.reportModal.submit')}
        </button>
      </div>
    </div>
  );
};

export default ConstructionReportModal;

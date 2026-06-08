/**
 * ConstructionReportModal — popup para subir un REPORTE DE OBRA (solo PDF).
 *
 * Simplísimo (regla de Andreas): elige proyecto + sube UN PDF. Nada de título,
 * progreso, resumen ni visibilidad. Se abre como modal desde el portal del
 * empleado (no es una página aparte). Guarda el PDF en storage y crea un
 * property_update con su asset, con título automático por fecha.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface PropertyOpt { id: string; name: string; }

const ConstructionReportModal: React.FC<{ postedBy: string; onClose: () => void }> = ({ postedBy, onClose }) => {
  const [properties, setProperties] = useState<PropertyOpt[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('properties').select('id, name').order('name');
      const rows = (data as PropertyOpt[]) ?? [];
      setProperties(rows);
      if (rows[0]) setPropertyId(rows[0].id);
    })();
  }, []);

  const pickFile = (f: File | null) => {
    setError('');
    if (f && f.type !== 'application/pdf') { setError('Solo se admite PDF.'); setFile(null); return; }
    setFile(f);
  };

  const submit = async () => {
    if (!propertyId || !file) { setError('Elige proyecto y un PDF.'); return; }
    setState('sending'); setError('');
    try {
      const niceDate = new Date(`${reportDate}T00:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      const { data: upd, error: insErr } = await supabase.from('property_updates').insert({
        property_id: propertyId,
        title: `Reporte de obra · ${niceDate}`,
        posted_by: postedBy,
        visibility: 'all',
        posted_at: new Date(`${reportDate}T12:00:00`).toISOString(),
      }).select('id').single();
      if (insErr) throw insErr;
      const path = `property-updates/${propertyId}/${upd.id}/${Date.now()}.pdf`;
      const up = await supabase.storage.from('images').upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from('images').getPublicUrl(path);
      const { error: aErr } = await supabase.from('update_assets').insert({
        update_id: upd.id, asset_type: 'pdf', storage_path: path, external_url: pub.publicUrl,
        file_name: file.name, file_size: file.size, mime_type: 'application/pdf', position: 0,
      });
      if (aErr) throw aErr;
      setState('ok');
      setTimeout(onClose, 1200);
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-serif text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">description</span> Reporte de obra
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-primary/40 hover:text-primary"><span className="material-symbols-outlined">close</span></button>
        </div>

        <label className="block mb-4">
          <span className="block text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">Proyecto</span>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm">
            {properties.length === 0 && <option value="">No hay proyectos</option>}
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        <label className="block mb-4">
          <span className="block text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">Fecha del informe</span>
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm" />
        </label>

        <label className="block mb-2">
          <span className="block text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">PDF del reporte</span>
          <div className="border-2 border-dashed border-primary/25 rounded-2xl p-6 text-center cursor-pointer hover:bg-primary/5 transition"
            onClick={() => document.getElementById('cr-file')?.click()}>
            <span className="material-symbols-outlined text-3xl text-primary/40">upload_file</span>
            <p className="text-sm text-primary/70 mt-1">{file ? file.name : 'Toca para elegir el PDF'}</p>
            {file && <p className="text-[11px] text-primary/40">{(file.size / 1024 / 1024).toFixed(1)} MB</p>}
            <input id="cr-file" type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </div>
        </label>

        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        {state === 'ok' && <p className="text-green-700 text-sm mt-2 font-bold">✓ Reporte subido.</p>}

        <button onClick={() => void submit()} disabled={state === 'sending' || !file || !propertyId}
          className="w-full mt-5 bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs disabled:opacity-50 flex items-center justify-center gap-2">
          {state === 'sending' && <span className="material-symbols-outlined animate-spin text-base">refresh</span>}
          {state === 'sending' ? 'Subiendo…' : 'Subir reporte'}
        </button>
      </div>
    </div>
  );
};

export default ConstructionReportModal;

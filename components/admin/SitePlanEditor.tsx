import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, uploadImage, getImageUrl } from '../../lib/supabase';

/**
 * SitePlanEditor — plano interactivo por proyecto.
 * El admin sube el plano del proyecto y coloca un "pin" por cada unidad,
 * marcándola como disponible / vendida / reservada. Se guarda en la tabla
 * project_site_plans (plan_image + units jsonb). Pensado para reutilizarse
 * tanto en el editor de propiedades (admin) como, más adelante, en la ficha pública.
 */

export type UnitStatus = 'available' | 'sold' | 'reserved';

export interface SitePlanUnit {
  id: string;
  label: string;
  x: number; // 0..1 relativo al ancho de la imagen
  y: number; // 0..1 relativo al alto
  status: UnitStatus;
  note?: string;
}

const STATUS_META: Record<UnitStatus, { bg: string; ring: string; dot: string }> = {
  available: { bg: 'bg-emerald-500', ring: 'ring-emerald-500/30', dot: 'bg-emerald-500' },
  sold:      { bg: 'bg-rose-600',    ring: 'ring-rose-600/30',    dot: 'bg-rose-600' },
  reserved:  { bg: 'bg-amber-500',   ring: 'ring-amber-500/30',   dot: 'bg-amber-500' },
};

const NEXT_STATUS: Record<UnitStatus, UnitStatus> = {
  available: 'sold',
  sold: 'reserved',
  reserved: 'available',
};

const uid = () => 'u' + Math.random().toString(36).slice(2, 9);

interface Props {
  projectId?: string;
  projectName?: string;
}

const SitePlanEditor: React.FC<Props> = ({ projectId, projectName }) => {
  const { t } = useTranslation();
  const [planImage, setPlanImage] = useState<string | null>(null);
  const [units, setUnits] = useState<SitePlanUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState('');
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);

  const saved = !!projectId && !String(projectId).startsWith('proj-');

  useEffect(() => {
    let active = true;
    (async () => {
      if (!saved) { setLoading(false); return; }
      setLoading(true);
      const { data } = await supabase
        .from('project_site_plans')
        .select('plan_image, units')
        .eq('project_id', projectId)
        .maybeSingle();
      if (!active) return;
      setPlanImage(data?.plan_image || null);
      setUnits(Array.isArray(data?.units) ? (data!.units as SitePlanUnit[]) : []);
      setDirty(false);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [projectId, saved]);

  const markDirty = () => { setDirty(true); setSavedMsg(''); };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = await uploadImage(file, 'projects/site_plans');
    if (path) { setPlanImage(path); markDirty(); }
    e.target.value = '';
  };

  const addUnitAt = (x: number, y: number) => {
    const n = units.length + 1;
    const label = String(n).padStart(2, '0');
    const u: SitePlanUnit = { id: uid(), label, x, y, status: 'available' };
    setUnits(prev => [...prev, u]);
    setSelected(u.id);
    markDirty();
  };

  const onPlanClick = (e: React.MouseEvent) => {
    if (!placing || !imgWrapRef.current) return;
    const r = imgWrapRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    addUnitAt(x, y);
  };

  // Arrastre de pines
  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || !imgWrapRef.current) return;
    d.moved = true;
    const r = imgWrapRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setUnits(prev => prev.map(u => u.id === d.id ? { ...u, x, y } : u));
  }, []);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    if (d) { if (d.moved) markDirty(); dragRef.current = null; }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const startDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    dragRef.current = { id, moved: false };
    setSelected(id);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const cycleStatus = (id: string) => {
    setUnits(prev => prev.map(u => u.id === id ? { ...u, status: NEXT_STATUS[u.status] } : u));
    markDirty();
  };

  const updateUnit = (id: string, patch: Partial<SitePlanUnit>) => {
    setUnits(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u));
    markDirty();
  };

  const removeUnit = (id: string) => {
    setUnits(prev => prev.filter(u => u.id !== id));
    if (selected === id) setSelected(null);
    markDirty();
  };

  const save = async () => {
    if (!saved) return;
    setSaving(true);
    const { error } = await supabase.from('project_site_plans').upsert({
      project_id: projectId,
      plan_image: planImage,
      units,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' });
    setSaving(false);
    if (error) { setSavedMsg(t('admin.siteplan.saveError', { defaultValue: 'Error al guardar' })); }
    else { setDirty(false); setSavedMsg(t('admin.siteplan.saved', { defaultValue: 'Guardado ✓' })); }
  };

  const counts = units.reduce((a, u) => { a[u.status]++; return a; }, { available: 0, sold: 0, reserved: 0 } as Record<UnitStatus, number>);
  const selUnit = units.find(u => u.id === selected) || null;

  if (!saved) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
        {t('admin.siteplan.saveFirst', { defaultValue: 'Guarda primero el proyecto para poder añadir el plano y sus unidades.' })}
      </div>
    );
  }
  if (loading) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-400">…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 transition cursor-pointer text-sm font-bold text-primary">
          <span className="material-symbols-outlined text-[18px]">upload</span>
          {planImage ? t('admin.siteplan.changePlan', { defaultValue: 'Cambiar plano' }) : t('admin.siteplan.uploadPlan', { defaultValue: 'Subir plano' })}
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </label>

        {planImage && (
          <button type="button" onClick={() => setPlacing(p => !p)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition ${placing ? 'bg-primary text-white' : 'bg-gray-100 text-primary hover:bg-gray-200'}`}>
            <span className="material-symbols-outlined text-[18px]">add_location_alt</span>
            {placing ? t('admin.siteplan.placingOn', { defaultValue: 'Toca el plano para añadir' }) : t('admin.siteplan.addUnit', { defaultValue: 'Añadir unidad' })}
          </button>
        )}

        <div className="flex-1" />

        {dirty && <span className="text-[11px] font-bold text-amber-600">{t('admin.siteplan.unsaved', { defaultValue: 'Cambios sin guardar' })}</span>}
        {savedMsg && <span className="text-[11px] font-bold text-emerald-600">{savedMsg}</span>}
        <button type="button" onClick={save} disabled={saving || !dirty}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-black transition disabled:opacity-40">
          <span className="material-symbols-outlined text-[18px]">save</span>
          {saving ? t('admin.common.saving', { defaultValue: 'Guardando…' }) : t('admin.common.save', { defaultValue: 'Guardar' })}
        </button>
      </div>

      {/* Leyenda + contadores */}
      {planImage && (
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-primary/70">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" />{t('admin.siteplan.available', { defaultValue: 'Disponible' })} ({counts.available})</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-600" />{t('admin.siteplan.sold', { defaultValue: 'Vendida' })} ({counts.sold})</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500" />{t('admin.siteplan.reserved', { defaultValue: 'Reservada' })} ({counts.reserved})</span>
          <span className="text-primary/40">· {t('admin.siteplan.tip', { defaultValue: 'Clica un pin para cambiar estado; arrástralo para moverlo.' })}</span>
        </div>
      )}

      {/* Lienzo del plano */}
      {planImage ? (
        <div
          ref={imgWrapRef}
          onClick={onPlanClick}
          className={`relative inline-block w-full rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 select-none ${placing ? 'cursor-crosshair' : ''}`}
        >
          <img src={getImageUrl(planImage)} alt={projectName || 'site plan'} className="w-full block pointer-events-none" draggable={false} />
          {units.map(u => {
            const m = STATUS_META[u.status];
            const isSel = selected === u.id;
            return (
              <button
                key={u.id}
                type="button"
                onPointerDown={(e) => startDrag(e, u.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragRef.current?.moved) return;
                  if (isSel) cycleStatus(u.id); else setSelected(u.id);
                }}
                style={{ left: `${u.x * 100}%`, top: `${u.y * 100}%` }}
                title={`${u.label} — ${t('admin.siteplan.' + u.status, { defaultValue: u.status })}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 min-w-[26px] h-[26px] px-1.5 rounded-full ${m.bg} text-white text-[11px] font-black flex items-center justify-center shadow-md ring-2 ring-white hover:scale-110 transition ${isSel ? 'ring-4 ' + m.ring + ' z-20 scale-110' : 'z-10'}`}
              >
                {u.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
          {t('admin.siteplan.noPlan', { defaultValue: 'Sube el plano del proyecto para empezar a marcar unidades.' })}
        </div>
      )}

      {/* Editor de la unidad seleccionada */}
      {selUnit && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-gray-400">{t('admin.siteplan.unit', { defaultValue: 'Unidad' })}</span>
            <button type="button" onClick={() => removeUnit(selUnit.id)} className="text-rose-500 hover:text-rose-700 inline-flex items-center gap-1 text-xs font-bold">
              <span className="material-symbols-outlined text-[16px]">delete</span>{t('admin.common.delete', { defaultValue: 'Eliminar' })}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t('admin.siteplan.label', { defaultValue: 'Nº / Etiqueta' })}</label>
              <input value={selUnit.label} onChange={(e) => updateUnit(selUnit.id, { label: e.target.value })} className="w-full px-4 py-2.5 bg-gray-50 rounded-2xl font-bold" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t('admin.siteplan.status', { defaultValue: 'Estado' })}</label>
              <div className="flex gap-2">
                {(['available', 'sold', 'reserved'] as UnitStatus[]).map(s => (
                  <button key={s} type="button" onClick={() => updateUnit(selUnit.id, { status: s })}
                    className={`flex-1 py-2.5 rounded-2xl text-xs font-bold transition ${selUnit.status === s ? STATUS_META[s].bg + ' text-white' : 'bg-gray-100 text-primary/70 hover:bg-gray-200'}`}>
                    {t('admin.siteplan.' + s, { defaultValue: s })}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t('admin.siteplan.note', { defaultValue: 'Nota (opcional)' })}</label>
            <input value={selUnit.note || ''} onChange={(e) => updateUnit(selUnit.id, { note: e.target.value })} placeholder={t('admin.siteplan.notePh', { defaultValue: 'p.ej. precio, titular, tipología…' })} className="w-full px-4 py-2.5 bg-gray-50 rounded-2xl font-medium" />
          </div>
        </div>
      )}
    </div>
  );
};

export default SitePlanEditor;

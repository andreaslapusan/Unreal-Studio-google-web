/**
 * /manager/propiedades — Editor de fichas de propiedad para el EQUIPO.
 *
 * Acceso: roles admin/team, O empleado (tabla employees) con el permiso
 * `edit_properties` (se activa en Admin → Empleados). Guarda vía la RPC
 * `team_save_project`, que vuelve a comprobar el permiso en servidor.
 *
 * Pensado para que el equipo actualice el avance de obra y la ficha completa
 * sin tener que pasar por Andreas.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { hasPermission } from '../lib/permissions';

type Project = Record<string, any>;

const field = 'w-full px-4 py-3 bg-gray-50 rounded-xl font-medium border border-gray-200 focus:border-primary focus:outline-none';
const labelCls = 'block text-[10px] font-black uppercase text-gray-400 mb-1.5';

const EquipoProperties: React.FC = () => {
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [galleryText, setGalleryText] = useState('');
  const [conGalleryText, setConGalleryText] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const isStaff = role === 'admin' || role === 'team';

  useEffect(() => {
    if (authLoading) return;
    if (!user?.email) { setAllowed(false); return; }
    if (isStaff) { setAllowed(true); return; }
    void (async () => {
      const { data } = await supabase.from('employees').select('permissions, can_upload_reports').eq('email', user.email).maybeSingle();
      setAllowed(hasPermission(data, 'edit_properties'));
    })();
  }, [user, authLoading, isStaff]);

  const loadProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('sort_order', { ascending: true });
    setProjects(data ?? []);
  };
  useEffect(() => { if (allowed) void loadProjects(); }, [allowed]);

  const openEdit = (p: Project) => {
    setCurrent({ ...p });
    setGalleryText((Array.isArray(p.gallery) ? p.gallery : []).join('\n'));
    setConGalleryText((Array.isArray(p.construction_gallery) ? p.construction_gallery : []).join('\n'));
    setMsg('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    setSaving(true); setMsg('');
    const toArr = (s: string) => s.split(/[\n;]+/).map((x) => x.trim()).filter(Boolean);
    const payload = {
      ...current,
      gallery: toArr(galleryText),
      construction_gallery: toArr(conGalleryText),
    };
    const { data, error } = await supabase.rpc('team_save_project', { p_project: payload });
    setSaving(false);
    if (error || !data?.success) { setMsg('Error: ' + (data?.error || error?.message || 'no se pudo guardar')); return; }
    setMsg('Guardado ✓');
    await loadProjects();
    setTimeout(() => { setCurrent(null); setMsg(''); }, 900);
  };

  const sorted = useMemo(() => [...projects].sort((a, b) => (a.name || '').localeCompare(b.name || '')), [projects]);

  if (authLoading || allowed === null) return <div className="min-h-screen flex items-center justify-center">Cargando…</div>;
  if (!user) return <Navigate to="/empleados" replace />;
  if (!allowed) return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center bg-almond">
      <div>
        <h1 className="text-2xl font-serif text-primary mb-3">Sin acceso</h1>
        <p className="text-primary/60">Tu cuenta no tiene permiso para editar propiedades. Pídeselo a Andreas.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-almond">
      <header className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-primary/10 bg-white">
        <h1 className="font-serif text-xl text-primary">Propiedades · Equipo</h1>
        <button onClick={() => navigate('/empleados/dashboard')} className="text-xs font-bold uppercase tracking-widest text-primary/60 hover:text-primary">Volver</button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {!current && (
          <div className="grid sm:grid-cols-2 gap-4">
            {sorted.map((p) => (
              <button key={p.id} onClick={() => openEdit(p)} className="text-left bg-white rounded-2xl p-5 border border-primary/5 shadow-sm hover:shadow-md hover:border-primary/30 transition">
                <p className="font-serif text-lg text-primary">{p.name}</p>
                <p className="text-xs text-primary/50">{p.location} · {p.status}</p>
                <p className="text-[11px] mt-2 text-primary/60">Avance de obra: <b>{p.completion_percent ?? 0}%</b></p>
              </button>
            ))}
          </div>
        )}

        {current && (
          <form onSubmit={save} className="bg-white rounded-3xl p-6 md:p-9 shadow-sm border border-primary/5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl text-primary">{current.name}</h2>
              <button type="button" onClick={() => setCurrent(null)} className="text-xs font-bold uppercase tracking-widest text-primary/50 hover:text-primary">← Lista</button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <label className={labelCls}>Avance de obra (%)</label>
              <input type="number" min={0} max={100} className={field} value={current.completion_percent ?? 0}
                onChange={(e) => setCurrent({ ...current, completion_percent: parseInt(e.target.value) || 0 })} />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>Nombre</label><input className={field} value={current.name || ''} onChange={(e) => setCurrent({ ...current, name: e.target.value })} /></div>
              <div><label className={labelCls}>Estado</label><input className={field} value={current.status || ''} onChange={(e) => setCurrent({ ...current, status: e.target.value })} /></div>
              <div><label className={labelCls}>Ubicación</label><input className={field} value={current.location || ''} onChange={(e) => setCurrent({ ...current, location: e.target.value })} /></div>
              <div><label className={labelCls}>Tipo</label><input className={field} value={current.property_type || ''} onChange={(e) => setCurrent({ ...current, property_type: e.target.value })} /></div>
              <div><label className={labelCls}>Precio inversor</label><input type="number" className={field} value={current.investor_price ?? 0} onChange={(e) => setCurrent({ ...current, investor_price: parseFloat(e.target.value) || 0 })} /></div>
              <div><label className={labelCls}>Precio mercado</label><input type="number" className={field} value={current.market_price ?? 0} onChange={(e) => setCurrent({ ...current, market_price: parseFloat(e.target.value) || 0 })} /></div>
              <div><label className={labelCls}>Moneda</label>
                <select className={field} value={current.price_currency || 'EUR'} onChange={(e) => setCurrent({ ...current, price_currency: e.target.value })}>
                  <option>EUR</option><option>USD</option><option>IDR</option>
                </select>
              </div>
              <div><label className={labelCls}>Fecha de entrega</label><input className={field} value={current.completion_date || ''} onChange={(e) => setCurrent({ ...current, completion_date: e.target.value })} placeholder="Q4 2026" /></div>
              <div><label className={labelCls}>Dormitorios</label><input type="number" className={field} value={current.bedrooms ?? 0} onChange={(e) => setCurrent({ ...current, bedrooms: parseInt(e.target.value) || 0 })} /></div>
              <div><label className={labelCls}>Baños</label><input type="number" className={field} value={current.bathrooms ?? 0} onChange={(e) => setCurrent({ ...current, bathrooms: parseInt(e.target.value) || 0 })} /></div>
              <div><label className={labelCls}>Área (m²)</label><input type="number" className={field} value={current.area_m2 ?? 0} onChange={(e) => setCurrent({ ...current, area_m2: parseInt(e.target.value) || 0 })} /></div>
              <div><label className={labelCls}>Distancia playa</label><input className={field} value={current.distance_beach || ''} onChange={(e) => setCurrent({ ...current, distance_beach: e.target.value })} /></div>
              <div><label className={labelCls}>Unidades disponibles</label><input className={field} value={current.available_units || ''} onChange={(e) => setCurrent({ ...current, available_units: e.target.value })} /></div>
              <div><label className={labelCls}>Fecha último reporte obra</label><input className={field} value={current.construction_update_date || ''} onChange={(e) => setCurrent({ ...current, construction_update_date: e.target.value })} /></div>
            </div>

            <div><label className={labelCls}>Descripción</label><textarea className={`${field} h-24 resize-none`} value={current.description || ''} onChange={(e) => setCurrent({ ...current, description: e.target.value })} /></div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>Imagen principal (URL/ruta)</label><input className={field} value={current.image || ''} onChange={(e) => setCurrent({ ...current, image: e.target.value })} /></div>
              <div><label className={labelCls}>Brochure (URL)</label><input className={field} value={current.brochure_url || ''} onChange={(e) => setCurrent({ ...current, brochure_url: e.target.value })} /></div>
              <div><label className={labelCls}>Reporte de obra (URL)</label><input className={field} value={current.construction_update_url || ''} onChange={(e) => setCurrent({ ...current, construction_update_url: e.target.value })} /></div>
              <div><label className={labelCls}>Google Maps (URL)</label><input className={field} value={current.google_maps_url || ''} onChange={(e) => setCurrent({ ...current, google_maps_url: e.target.value })} /></div>
            </div>

            <div><label className={labelCls}>Galería (una URL por línea)</label><textarea className={`${field} h-24 resize-none font-mono text-xs`} value={galleryText} onChange={(e) => setGalleryText(e.target.value)} /></div>
            <div><label className={labelCls}>Galería de obra (una URL por línea)</label><textarea className={`${field} h-24 resize-none font-mono text-xs`} value={conGalleryText} onChange={(e) => setConGalleryText(e.target.value)} /></div>

            <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-4 border border-gray-100">
              <span className="text-[10px] font-black uppercase text-primary/60">Oculto en la web pública</span>
              <button type="button" onClick={() => setCurrent({ ...current, is_hidden: !current.is_hidden })} className={`w-12 h-6 rounded-full transition-all flex items-center px-1 ${current.is_hidden ? 'bg-primary justify-end' : 'bg-gray-300 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-md" /></button>
            </div>

            {msg && <p className={`text-sm font-bold ${msg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{msg}</p>}

            <div className="flex gap-4 pt-2">
              <button type="button" onClick={() => setCurrent(null)} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 text-gray-400 hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary text-white shadow-lg hover:bg-black disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
};

export default EquipoProperties;

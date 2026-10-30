import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Dashboard en tiempo casi-real de la Raspberry Pi de casa (Madrid). Lee la fila pi_status (id=1) que
// alimenta el daemon ~/jobs/pi_metrics_push.py cada ~8s. Solo lectura; es una herramienta interna de ops.
type PiData = Record<string, any>;

const fmtUptime = (s: number): string => {
  if (!s) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};
const tempColor = (t: number): string => (t >= 78 ? 'text-red-600' : t >= 68 ? 'text-amber-500' : 'text-emerald-600');
const barColor = (p: number): string => (p >= 90 ? 'bg-red-500' : p >= 70 ? 'bg-amber-500' : 'bg-emerald-500');

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
    <div className="text-[11px] font-black uppercase tracking-widest text-primary/40">{label}</div>
    <div className={`text-3xl font-bold mt-1 ${color || 'text-primary'}`}>{value}</div>
    {sub && <div className="text-xs text-primary/50 mt-1">{sub}</div>}
  </div>
);
const Gauge: React.FC<{ label: string; pct: number; sub: string }> = ({ label, pct, sub }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
    <div className="text-[11px] font-black uppercase tracking-widest text-primary/40">{label}</div>
    <div className="text-3xl font-bold mt-1 text-primary">{pct}%</div>
    <div className="text-xs text-primary/50 mt-1">{sub}</div>
    <div className="h-2 rounded-full bg-gray-100 mt-2 overflow-hidden"><div className={`h-full ${barColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
  </div>
);
const Badge: React.FC<{ ok: boolean | null | undefined; label: string }> = ({ ok, label }) => (
  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold ${ok === true ? 'bg-emerald-50 text-emerald-700' : ok === false ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-primary/50'}`}>
    <span className={`w-2.5 h-2.5 rounded-full ${ok === true ? 'bg-emerald-500' : ok === false ? 'bg-red-500' : 'bg-gray-400'}`} />{label}
  </div>
);

const PiDashboard: React.FC = () => {
  const [d, setD] = useState<PiData | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [stale, setStale] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>();

  const load = async () => {
    const { data } = await supabase.from('pi_status').select('data,ops,updated_at').eq('id', 1).maybeSingle();
    if (data) { setD({ ...((data as any).data || {}), ...((data as any).ops || {}) }); setUpdatedAt((data as any).updated_at); }
  };
  useEffect(() => { void load(); timer.current = setInterval(() => void load(), 1000); return () => clearInterval(timer.current); }, []);
  useEffect(() => {
    const t = setInterval(() => { if (updatedAt) setStale(Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000)); }, 1000);
    return () => clearInterval(t);
  }, [updatedAt]);

  if (!d) return <div className="text-primary/50 p-8">Cargando estado del Pi…</div>;
  const live = stale < 25;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary">Raspberry Pi · Madrid</h2>
          <div className="text-sm text-primary/50">IP {d.ip || '—'} · Tailscale {d.tailscale_ip || '—'} · uptime {fmtUptime(d.uptime_s)}</div>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />{live ? 'En vivo' : `Hace ${stale}s`}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Temperatura" value={`${d.temp_c ?? '—'}°C`} color={tempColor(d.temp_c)} sub={d.throttled_ok ? 'Sin throttling' : '⚠ Throttling'} />
        <Stat label="CPU" value={`${d.load_pct ?? 0}%`} sub={`carga ${(d.load || []).join(' / ')} · ${d.cpu_mhz || 0} MHz`} />
        <Gauge label="RAM" pct={d.mem_pct || 0} sub={`${d.mem_used_mb} / ${d.mem_total_mb} MB`} />
        <Gauge label="Disco" pct={d.disk_pct || 0} sub={`${d.disk_used_gb} / ${d.disk_total_gb} GB`} />
      </div>

      <div>
        <div className="text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">Servicios</div>
        <div className="flex flex-wrap gap-2">
          <Badge ok={d.throttled_ok} label="Alimentación OK" />
          <Badge ok={d.tailscale_up} label="Tailscale (VPN casa)" />
          <Badge ok={d.adguard_up} label="AdGuard (DNS / anuncios)" />
          <Badge ok={d.tunnel_up} label="Túnel SSH" />
          <Badge ok={d.cdp_up} label="Navegador residencial" />
          <Badge ok={d.pi_unreachable ? false : true} label="Pi accesible" />
        </div>
      </div>

      {Array.isArray(d.tasks) && d.tasks.length > 0 && (
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">Tareas activas en la Pi</div>
          <div className="flex flex-wrap gap-2">
            {d.tasks.map((tk: any, i: number) => <Badge key={i} ok={tk.on} label={tk.name} />)}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] font-black uppercase tracking-widest text-primary/40 mb-2">Internet</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Bajada" value={d.speed_down_mbps != null ? `${d.speed_down_mbps} Mbps` : '—'} color="text-emerald-600" />
          <Stat label="Subida" value={d.speed_up_mbps != null ? `${d.speed_up_mbps} Mbps` : '—'} />
          <Stat label="Ping" value={d.ping_ms != null ? `${d.ping_ms} ms` : '—'} />
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-widest text-primary/40">IP pública</div>
            <div className="text-base font-bold mt-1 text-primary break-all">{d.pub_ip || '—'}</div>
            <div className="text-xs text-primary/50 mt-1">{d.isp || ''}{d.city ? ' · ' + d.city : ''}</div>
          </div>
        </div>
        {(d.speed_down_mbps != null) && <div className="text-[10px] text-primary/30 mt-1">Velocidad medida cada ~30 min.</div>}
      </div>

      {Array.isArray(d.devices) && d.devices.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-widest text-primary/40 mb-3">Dispositivos conectados ({d.device_count ?? d.devices.length})</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {d.devices.map((dev: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-gray-50 pb-1.5 gap-2">
                <span className="font-medium text-primary truncate">{dev.name || dev.vendor || 'Dispositivo'}</span>
                <span className="text-xs text-primary/40 font-mono shrink-0">{dev.ip}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-[11px] font-black uppercase tracking-widest text-primary/40">Scraper Idealista · toda España</div>
          <Badge ok={d.scraper_running} label={d.scraper_status || (d.scraper_running ? 'En marcha' : 'Parado')} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 items-start">
          <div><div className="text-2xl font-bold text-primary">{d.agencies_scraped ?? 0}</div><div className="text-xs text-primary/50">inmobiliarias sacadas</div></div>
          <div><div className="text-2xl font-bold text-primary">{d.agencies_pushed_qm ?? 0}</div><div className="text-xs text-primary/50">nuevas → QuickMail</div></div>
          <div className="col-span-2 sm:col-span-1"><div className="text-[11px] font-mono text-primary/40 break-all leading-snug">{d.scraper_last || ''}</div></div>
        </div>
      </div>

      {d.dns_today != null && (
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Consultas DNS hoy" value={d.dns_today} />
          <Stat label="Anuncios bloqueados hoy" value={d.blocked_today ?? 0} color="text-emerald-600" />
        </div>
      )}

      <div className="text-[11px] text-primary/30">En vivo (~1 s) desde casa. Última lectura: {updatedAt ? new Date(updatedAt).toLocaleTimeString() : '—'}.</div>
    </div>
  );
};

export default PiDashboard;

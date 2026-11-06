/** Piezas visuales del portal de agencias, calcadas del panel admin (DashboardOverview). */
import React from 'react';

export const card = 'bg-white rounded-2xl p-5 shadow-sm border border-primary/5';
export const btnPrimary = 'inline-flex items-center justify-center gap-1.5 bg-primary text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-black transition disabled:opacity-50';
export const btnGhost = 'inline-flex items-center justify-center gap-1.5 bg-white border border-primary/15 text-primary px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-gray-50 transition';
export const input = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-primary focus:outline-none focus:border-primary/40';

export const SectionTitle: React.FC<{ title: string; sub?: string; action?: React.ReactNode }> = ({ title, sub, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
    <div>
      <h2 className="text-2xl font-serif text-primary">{title}</h2>
      {sub && <p className="text-sm text-primary/60 mt-1 max-w-2xl">{sub}</p>}
    </div>
    {action}
  </div>
);

export const Stat: React.FC<{ icon: string; label: string; value: React.ReactNode; onClick?: () => void; accent?: boolean }> = ({ icon, label, value, onClick, accent }) => (
  <button type="button" onClick={onClick} disabled={!onClick} className={`${card} text-left w-full hover:border-primary/20 transition disabled:cursor-default`}>
    <div className="flex items-center justify-between gap-2">
      <span className={`material-symbols-outlined text-2xl ${accent ? 'text-green-600' : 'text-primary/40'}`}>{icon}</span>
      <span className={`text-2xl md:text-3xl font-black truncate ${accent ? 'text-green-700' : 'text-primary'}`}>{value}</span>
    </div>
    <p className="text-[11px] font-black uppercase tracking-widest text-primary/40 mt-3">{label}</p>
  </button>
);

export const Empty: React.FC<{ icon: string; text: string; action?: React.ReactNode }> = ({ icon, text, action }) => (
  <div className={`${card} text-center py-10`}>
    <span className="material-symbols-outlined text-4xl text-primary/20">{icon}</span>
    <p className="text-sm text-primary/60 mt-2 max-w-md mx-auto">{text}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700',
  contacted: 'bg-amber-50 text-amber-700',
  won: 'bg-green-50 text-green-700',
  lost: 'bg-gray-100 text-gray-500',
  pending: 'bg-amber-50 text-amber-700',
  scheduled: 'bg-blue-50 text-blue-700',
  done: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};
export const StatusPill: React.FC<{ status: string; label: string }> = ({ status, label }) => (
  <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-600'}`}>{label}</span>
);

/** Fila de lista con estructura fija: título + 1-2 líneas tenues a la izquierda, metadatos alineados a la derecha. */
export const ListRow: React.FC<{ title: React.ReactNode; sub?: React.ReactNode; extra?: React.ReactNode; right: React.ReactNode; icon?: string; onClick?: () => void; wrap?: boolean }> = ({ title, sub, extra, right, icon, onClick, wrap }) => (
  <li className={`px-5 py-3.5 flex items-center gap-3 ${onClick ? 'cursor-pointer hover:bg-gray-50 transition focus:outline-none focus-visible:bg-gray-50' : ''}`}
    {...(onClick ? { onClick, role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } } : {})}>
    {icon && <span className="material-symbols-outlined text-xl text-primary/30 shrink-0">{icon}</span>}
    <div className="min-w-0 flex-1">
      <p className="font-bold text-sm text-primary truncate">{title}</p>
      {sub && <p className="text-sm text-primary/60 truncate">{sub}</p>}
      {extra && <p className={`text-xs text-primary/40 mt-0.5 ${wrap ? 'line-clamp-2 break-words' : 'truncate'}`}>{extra}</p>}
    </div>
    <div className="shrink-0 flex flex-col items-end gap-1.5 text-right">{right}</div>
  </li>
);

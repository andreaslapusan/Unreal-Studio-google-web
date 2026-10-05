/**
 * ListControls — barra REUTILIZABLE de búsqueda + orden para TODAS las listas del
 * sitio (admin propiedades, catálogo público, clientes, empleados, agencias, blog…).
 * Pedido por Andreas (2026-10-05): "meteme un filtro y organización en todas las
 * páginas siempre, por antigüedad de edición, precio, alfabético, buscador, etc."
 *
 * Uso:
 *   const { query, setQuery, sort, setSort, result } = useListControls(items, {
 *     name:   (x) => x.name,
 *     price:  (x) => x.investor_price,
 *     updated:(x) => x.updated_at,
 *     search: (x) => `${x.name} ${x.location}`,
 *   });
 *   <ListControls {...{query,setQuery,sort,setSort}} count={result.length} />
 *   {result.map(...)}
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type SortKey = 'recent' | 'priceAsc' | 'priceDesc' | 'az' | 'za';

export interface ListAccessors<T> {
  /** Texto para orden alfabético (nombre/título). */
  name: (x: T) => string;
  /** Valor numérico para orden por precio (opcional). */
  price?: (x: T) => number | string | null | undefined;
  /** Fecha/hora de edición para "recién editado" (opcional). */
  updated?: (x: T) => string | number | Date | null | undefined;
  /** Texto donde busca el buscador (por defecto, el nombre). */
  search?: (x: T) => string;
}

const toNum = (v: unknown): number => {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
};
const toTime = (v: unknown): number => {
  if (!v) return 0;
  const t = new Date(v as any).getTime();
  return isNaN(t) ? 0 : t;
};

/** Hook: filtra por buscador y ordena. Devuelve el array ya procesado. */
export function useListControls<T>(items: T[], acc: ListAccessors<T>, defaultSort: SortKey = 'recent') {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(defaultSort);

  const result = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = items;
    if (q) {
      out = out.filter((it) => {
        const hay = (acc.search ? acc.search(it) : acc.name(it)) || '';
        return hay.toLowerCase().includes(q);
      });
    }
    const arr = [...out];
    switch (sort) {
      case 'az': arr.sort((a, b) => (acc.name(a) || '').localeCompare(acc.name(b) || '')); break;
      case 'za': arr.sort((a, b) => (acc.name(b) || '').localeCompare(acc.name(a) || '')); break;
      case 'priceAsc': if (acc.price) arr.sort((a, b) => toNum(acc.price!(a)) - toNum(acc.price!(b))); break;
      case 'priceDesc': if (acc.price) arr.sort((a, b) => toNum(acc.price!(b)) - toNum(acc.price!(a))); break;
      case 'recent': if (acc.updated) arr.sort((a, b) => toTime(acc.updated!(b)) - toTime(acc.updated!(a))); break;
    }
    return arr;
    // acc son funciones puras y estables por render; no entran en deps a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, sort]);

  return { query, setQuery, sort, setSort, result };
}

interface ListControlsProps {
  query: string;
  setQuery: (s: string) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  /** Qué opciones de orden mostrar (por defecto todas). Quita 'priceAsc'/'priceDesc' en listas sin precio. */
  options?: SortKey[];
  placeholder?: string;
  /** Nº de resultados tras filtrar — se muestra discreto a la derecha. */
  count?: number;
  className?: string;
}

const ListControls: React.FC<ListControlsProps> = ({
  query, setQuery, sort, setSort,
  options = ['recent', 'priceAsc', 'priceDesc', 'az', 'za'],
  placeholder, count, className = '',
}) => {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-col sm:flex-row gap-3 mb-6 ${className}`}>
      <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2.5 flex-1 border border-gray-100 focus-within:border-primary/40 transition">
        <span className="material-symbols-outlined text-gray-400 text-base">search</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || t('listControls.searchPlaceholder')}
          className="bg-transparent border-none outline-none text-sm w-full font-bold text-primary placeholder:text-gray-300 placeholder:font-semibold"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label={t('listControls.clear')}
            className="text-gray-300 hover:text-primary transition shrink-0">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2.5 border border-gray-100 focus-within:border-primary/40 transition">
        <span className="material-symbols-outlined text-gray-400 text-base">swap_vert</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label={t('listControls.sortlabel')}
          className="bg-transparent border-none outline-none text-sm font-bold text-primary cursor-pointer pr-1"
        >
          {options.map((o) => (
            <option key={o} value={o}>{t('listControls.sort.' + o)}</option>
          ))}
        </select>
      </div>
      {typeof count === 'number' && (
        <div className="hidden sm:flex items-center text-[11px] font-black uppercase tracking-widest text-primary/30 px-2 shrink-0">
          {t('listControls.count', { count })}
        </div>
      )}
    </div>
  );
};

export default ListControls;

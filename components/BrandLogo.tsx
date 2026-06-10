/**
 * BrandLogo — el ÚNICO logo de la marca, usado en TODOS los sitios (web, admin,
 * portales, emails los hace aparte el backend). Regla de Andreas: si hay un logo
 * subido en Configuración (app_config.brand.logo) se usa ESE en todos lados; si
 * no, el mismo texto "UNREAL Studio". Nunca dos logos distintos.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Lema oficial de la marca (Andreas). Va junto al logo, pequeño y en CURSIVA.
// La cara itálica de DM Serif Display se carga en index.html (ital@0;1).
export const BRAND_LEMA = 'Beyond the Ordinary, Inside the Unreal';

// Cache a nivel de módulo para no pedir app_config en cada instancia.
let cachedLogo: string | null | undefined; // undefined = sin cargar, null = no hay, string = url
let inflight: Promise<string | null> | null = null;
async function fetchLogo(): Promise<string | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  if (!inflight) {
    inflight = supabase.from('app_config').select('value').eq('key', 'brand').maybeSingle()
      .then(({ data }) => { cachedLogo = ((data?.value as any)?.logo as string) || null; return cachedLogo; })
      .catch(() => { cachedLogo = null; return null; });
  }
  return inflight;
}

interface Props {
  /** clases para la imagen del logo (tamaño) */
  imgClassName?: string;
  /** clases para el texto de respaldo (tamaño + color según fondo) */
  textClassName?: string;
  /** muestra el lema oficial en cursiva debajo del logo */
  tagline?: boolean;
  /** clases extra para el lema (p.ej. color sobre fondo oscuro) */
  taglineClassName?: string;
}

const BrandLogo: React.FC<Props> = ({ imgClassName, textClassName, tagline, taglineClassName }) => {
  const [logo, setLogo] = useState<string | null | undefined>(cachedLogo);
  useEffect(() => {
    if (logo === undefined) void fetchLogo().then(setLogo);
  }, [logo]);

  const mark = logo
    ? <img src={logo} alt="Unreal Studio" className={imgClassName || 'h-9 w-auto object-contain'} />
    // Logo de texto PERMANENTE (decisión de Andreas): "Unreal Studio" en DM Serif.
    // No cambiar nunca salvo que se suba un logo en Configuración.
    : <span className={textClassName || 'font-serif font-bold text-primary text-xl tracking-tight'}>Unreal Studio</span>;

  if (!tagline) return mark;
  return (
    <span className="inline-flex flex-col">
      {mark}
      <span className={taglineClassName || 'font-serif italic text-primary/50 text-[11px] tracking-wide mt-1 whitespace-nowrap'}>
        {BRAND_LEMA}
      </span>
    </span>
  );
};

export default BrandLogo;

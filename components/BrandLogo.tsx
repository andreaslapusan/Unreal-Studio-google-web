/**
 * BrandLogo — el ÚNICO logo de la marca, usado en TODOS los sitios (web, admin,
 * portales, emails los hace aparte el backend). Regla de Andreas: si hay un logo
 * subido en Configuración (app_config.brand.logo) se usa ESE en todos lados; si
 * no, el mismo texto "UNREAL Studio". Nunca dos logos distintos.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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
}

const BrandLogo: React.FC<Props> = ({ imgClassName, textClassName }) => {
  const [logo, setLogo] = useState<string | null | undefined>(cachedLogo);
  useEffect(() => {
    if (logo === undefined) void fetchLogo().then(setLogo);
  }, [logo]);

  if (logo) {
    return <img src={logo} alt="Unreal Studio" className={imgClassName || 'h-9 w-auto object-contain'} />;
  }
  // Logo de texto PERMANENTE (decisión de Andreas): "Unreal Studio" en DM Serif.
  // No cambiar nunca salvo que se suba un logo en Configuración.
  return (
    <span className={textClassName || 'font-serif font-bold text-primary text-xl tracking-tight'}>
      Unreal Studio
    </span>
  );
};

export default BrandLogo;

-- Contador global y atómico para las frases de la cámara de fichaje: cada llamada
-- devuelve el siguiente número, así las frases salen EN ORDEN y no se repiten ni
-- entre personas (la app hace idx % nº_frases). Inocuo (solo un contador).
create sequence if not exists public.smile_seq;
create or replace function public.next_smile_index()
 returns bigint language sql security definer set search_path to 'public' as $function$
  select nextval('public.smile_seq');
$function$;
grant execute on function public.next_smile_index() to anon, authenticated;

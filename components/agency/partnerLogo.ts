/** Subida del logo de una agencia (la usan "Mi agencia" y el editor del admin): mismo path y formato. */
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../lib/imageCompress';

/** Devuelve el error de validación ('size' | 'type') o null si el archivo vale. */
export const logoFileError = (file: File): 'size' | 'type' | null =>
  file.size > 2 * 1024 * 1024 ? 'size' : !file.type.startsWith('image/') ? 'type' : null;

/** Comprime a WebP ≤800px, sube a images/partner-logos y guarda logo_url. Devuelve la URL pública. */
export async function uploadPartnerLogo(partnerId: string, file: File): Promise<string> {
  const compressed = await compressImage(file, { maxDim: 800, quality: 0.85 });
  const ext = compressed.name.split('.').pop()?.toLowerCase() ?? 'webp';
  const path = `partner-logos/${partnerId}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('images').upload(path, compressed, { cacheControl: '3600', upsert: true, contentType: compressed.type });
  if (upErr) throw upErr;
  const logoUrl = supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
  const { error: updErr } = await supabase.from('listing_partners').update({ logo_url: logoUrl }).eq('id', partnerId);
  if (updErr) throw updErr;
  return logoUrl;
}

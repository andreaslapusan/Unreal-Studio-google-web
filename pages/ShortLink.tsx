import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// /a/:code → long URL stored in short_links (WhatsApp-friendly agency signup links). Unknown code → /agencias.
export default function ShortLink() {
  const { code = '' } = useParams();
  useEffect(() => {
    supabase.rpc('resolve_short_link', { p_code: code }).then(({ data }) => {
      const ok = typeof data === 'string' && data.startsWith('https://unrealstudiobali.com/');
      // same-origin targets keep the SPA on this host (preview/beta); anything else falls back
      window.location.replace(ok ? data.replace('https://unrealstudiobali.com', window.location.origin) : '/agencias');
    });
  }, [code]);
  return null;
}

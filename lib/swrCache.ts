/**
 * Tiny stale-while-revalidate cache backed by localStorage.
 *
 * Pattern:
 *   const cached = readSWR<Project[]>('home_projects');     // sync, immediate
 *   const [data, setData] = useState(cached ?? []);
 *   useEffect(() => {
 *     supabase.from('projects').select('*').then(({ data }) => {
 *       if (data) {
 *         setData(data);
 *         writeSWR('home_projects', data);
 *       }
 *     });
 *   }, []);
 *
 * The first paint uses whatever was last cached (or nothing on cold start).
 * The Supabase fetch runs in parallel and updates the UI once fresh data
 * arrives. Net effect: repeat visitors see the LCP image instantly because
 * the project URL is already in the bundled state, no waiting on the round
 * trip to rnielxgackkshnatvagj.supabase.co.
 *
 * Why not Service Worker / IndexedDB:
 *   - SW would be a bigger commitment (registration, lifecycle, update
 *     storms). For a public catalogue with ~100 KB of payload, localStorage
 *     is enough and ships in two functions.
 *   - IndexedDB is async; defeats the "show on first paint" property.
 *
 * TTL: 7 days. Beyond that we treat the cache as too stale to render and
 * fall through to the Supabase fetch (loader). Tunable per-key.
 */

interface Envelope<T> {
  v: number;          // schema version — bump when the row shape changes
  ts: number;         // capture timestamp
  data: T;
}

const SCHEMA_VERSION = 1;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function readSWR<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || env.v !== SCHEMA_VERSION) return null;
    if (Date.now() - env.ts > ttlMs) return null;
    return env.data;
  } catch {
    return null;
  }
}

export function writeSWR<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const env: Envelope<T> = { v: SCHEMA_VERSION, ts: Date.now(), data };
    window.localStorage.setItem(key, JSON.stringify(env));
  } catch {
    // Quota exceeded or storage disabled — silently ignore. Worst case the
    // user just sees a regular cold load.
  }
}

export function clearSWR(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

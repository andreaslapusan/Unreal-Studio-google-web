/**
 * i18n setup — react-i18next.
 *
 * Languages:
 *  - es (Spanish) — Spain + LATAM
 *  - en (English) — international fallback
 *  - ro (Romanian) — Romania
 *
 * Detection: localStorage override → IP-based country lookup → fallback es.
 * Switching: see <LanguageSwitcher/> component.
 */
import i18n, { type BackendModule } from "i18next";
import { initReactI18next } from "react-i18next";

// Solo ES (idioma por defecto y fallback) va en el bundle de entrada; en/ro/id se cargan
// bajo demanda (~140 KB cada uno). changeLanguage() espera a que llegue el JSON → sin flash.
import es from "../locales/es.json";
const LAZY: Record<string, () => Promise<{ default: object }>> = {
  en: () => import("../locales/en.json"),
  ro: () => import("../locales/ro.json"),
  id: () => import("../locales/id.json"),
};
const lazyLocales: BackendModule = {
  type: "backend",
  init() {},
  read(lng, _ns, cb) {
    const load = LAZY[lng];
    if (!load) return cb(null, {});
    load().then((m) => cb(null, m.default as any), (e) => cb(e, null));
  },
};

import { geoLanguageDetector } from "./geoLanguageDetector";

// Preferencia de idioma guardada por el usuario (la fija LanguageSwitcher). Si
// existe, MANDA en TODA la app desde el primer render — incluido el panel admin,
// que antes ignoraba la preferencia y arrancaba siempre en español aunque el
// usuario hubiera elegido otro idioma en otro portal.
let _storedLng: string | undefined;
try {
  const s = localStorage.getItem("_unreal_lang");
  if (s && ["es", "en", "ro", "id"].includes(s)) _storedLng = s;
} catch { /* ignore */ }

// Idioma del primer render, con la misma prioridad síncrona que geoLanguageDetector
// (?lang= → prefijo de ruta → preferencia guardada). index.tsx espera a i18nReady antes de
// montar: así la página /ro/… no se pinta un instante en español.
function firstLang(): string | undefined {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q && LAZY[q]) return q;
  } catch { /* ignore */ }
  const seg = window.location.pathname.split("/")[1];
  if (seg === "es" || LAZY[seg]) return seg;
  return _storedLng;
}

const _init = i18n
  .use(lazyLocales)
  .use(geoLanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { es: { translation: es } },
    partialBundledLanguages: true,
    ...(_storedLng ? { lng: _storedLng } : {}),
    fallbackLng: "es",
    supportedLngs: ["es", "en", "ro", "id"],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

// Con idioma conocido (ruta/?lang=/guardado) init no espera al lookup por IP. Sin él, se monta
// ya como antes. Si un JSON no llega (red caída) se monta igual: i18next cae al español.
// Emails/PDF/kit en el idioma del cliente usan getFixedT(lang): necesitan todos los idiomas.
// Lo llaman al cargarse los módulos que lo usan; y las rutas sin prefijo (portales) los
// precargan antes de montar.
export const preloadAllLocales = () => i18n.loadLanguages(Object.keys(LAZY)).catch(() => undefined);

const _first = firstLang();
const _portal = !["es", ...Object.keys(LAZY)].includes(window.location.pathname.split("/")[1]) && window.location.pathname !== "/";
export const i18nReady: Promise<unknown> = _first || _portal
  ? Promise.all([_init, _first && LAZY[_first]?.(), _portal && _init.then(preloadAllLocales)]).catch(() => undefined)
  : Promise.resolve();

export default i18n;

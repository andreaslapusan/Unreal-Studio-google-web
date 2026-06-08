/**
 * Custom i18next language detector that maps user country (via free IP geo
 * lookup) to one of our supported languages.
 *
 * Rules:
 *  - Spain + LATAM (Spanish-speaking) → "es"
 *  - Romania → "ro"
 *  - Everything else → "en"
 *
 * Runs only when the user has not stored an explicit choice in localStorage,
 * so the manual switcher always wins.
 */
import type { LanguageDetectorAsyncModule } from "i18next";

const LATAM_ES = new Set([
  "ES", // Spain
  "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "SV", "GT",
  "HN", "MX", "NI", "PA", "PY", "PE", "PR", "UY", "VE", "GQ",
]);

const STORAGE_KEY = "_unreal_lang";
const GEO_CACHE_KEY = "_unreal_geo_country";

type Supported = "es" | "en" | "ro";

function countryToLang(country: string | null | undefined): Supported {
  if (!country) return "en";
  const c = country.toUpperCase();
  if (c === "RO") return "ro";
  if (LATAM_ES.has(c)) return "es";
  return "en";
}

async function fetchCountry(): Promise<string | null> {
  // Try cache first
  try {
    const cached = localStorage.getItem(GEO_CACHE_KEY);
    if (cached) return cached;
  } catch {
    /* ignore storage errors */
  }

  try {
    const res = await fetch("https://ipapi.co/json/", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { country_code?: string };
    const code = data.country_code ?? null;
    if (code) {
      try {
        localStorage.setItem(GEO_CACHE_KEY, code);
      } catch {
        /* ignore */
      }
    }
    return code;
  } catch {
    return null;
  }
}

export const geoLanguageDetector: LanguageDetectorAsyncModule = {
  type: "languageDetector",
  async: true,
  init: () => {
    /* no-op */
  },
  detect: async (callback: (lng: string | readonly string[]) => void) => {
    // 0. ?lang= en la URL gana sobre todo (los emails al cliente enlazan con su
    //    idioma preferido, p.ej. /cliente?lang=es). Se persiste para que mantenga
    //    el idioma al navegar dentro del portal.
    try {
      const urlLang = new URLSearchParams(window.location.search).get('lang');
      const allowed = ['es', 'en', 'ro', 'id'];
      if (urlLang && allowed.includes(urlLang)) {
        try { localStorage.setItem(STORAGE_KEY, urlLang); } catch { /* ignore */ }
        callback(urlLang);
        return urlLang;
      }
    } catch {
      /* ignore */
    }

    // 1. localStorage override
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        callback(stored);
        return stored;
      }
    } catch {
      /* ignore */
    }

    // 2. IP-based country lookup
    const country = await fetchCountry();
    const lng = countryToLang(country);
    callback(lng);
    return lng;
  },
  cacheUserLanguage: (lng: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, lng);
    } catch {
      /* ignore */
    }
  },
};

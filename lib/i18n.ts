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
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import es from "../locales/es.json";
import en from "../locales/en.json";
import ro from "../locales/ro.json";
import id from "../locales/id.json";

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

void i18n
  .use(geoLanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      ro: { translation: ro },
      id: { translation: id },
    },
    ...(_storedLng ? { lng: _storedLng } : {}),
    fallbackLng: "es",
    supportedLngs: ["es", "en", "ro", "id"],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18n;

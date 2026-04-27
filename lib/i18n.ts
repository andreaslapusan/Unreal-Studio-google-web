/**
 * i18n setup — react-i18next.
 *
 * Languages:
 *  - es (Spanish) — primary, most existing copy
 *  - en (English) — for international investors and partners
 *  - id (Bahasa Indonesia) — for local Indonesian agencies / staff
 *
 * Detection order: localStorage → navigator → fallback es.
 * Switching: see <LanguageSwitcher/> component.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import es from "../locales/es.json";
import en from "../locales/en.json";
import id from "../locales/id.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      id: { translation: id },
    },
    fallbackLng: "es",
    supportedLngs: ["es", "en", "id"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "_unreal_lang",
    },
    react: { useSuspense: false },
  });

export default i18n;

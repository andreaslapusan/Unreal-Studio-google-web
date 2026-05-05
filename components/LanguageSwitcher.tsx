/**
 * Compact language switcher with 3 options: ES / EN / RO.
 * Persists choice via localStorage (handled by our custom geoLanguageDetector).
 */
import React from "react";
import { useTranslation } from "react-i18next";

const LANGS: { code: "es" | "en" | "ro"; label: string }[] = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "ro", label: "RO" },
];

export default function LanguageSwitcher({ inverted = false }: { inverted?: boolean }) {
  const { i18n } = useTranslation();

  const change = (code: string) => {
    void i18n.changeLanguage(code);
    document.documentElement.lang = code;
  };

  const current = i18n.language?.slice(0, 2) ?? "es";

  return (
    <div
      className={`inline-flex items-center rounded-full p-0.5 text-xs font-medium ${
        inverted ? "bg-white/10" : "bg-primary/5"
      }`}
      aria-label="Language switcher"
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => change(l.code)}
          className={`px-2 py-1 rounded-full transition ${
            current === l.code
              ? inverted
                ? "bg-white/20 text-white"
                : "bg-primary text-white"
              : inverted
              ? "text-white/70 hover:text-white"
              : "text-primary/60 hover:text-primary"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

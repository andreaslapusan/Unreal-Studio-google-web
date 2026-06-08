/**
 * Selector de idioma: ES / EN / RO.
 *
 * En páginas públicas (con prefijo de idioma en la URL) NAVEGA al mismo path
 * bajo el nuevo prefijo (/en/proyectos → /es/proyectos), de modo que la URL y el
 * idioma quedan siempre sincronizados. En portales (sin prefijo) solo cambia el
 * idioma. La preferencia se persiste vía nuestro geoLanguageDetector.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { SUPPORTED_LANGS } from "./LocaleRoute";

const LANGS: { code: "es" | "en" | "ro" | "id"; label: string }[] = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "ro", label: "RO" },
  { code: "id", label: "ID" },
];

export default function LanguageSwitcher({ inverted = false }: { inverted?: boolean }) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const change = (code: string) => {
    void i18n.changeLanguage(code);
    document.documentElement.lang = code;
    try {
      localStorage.setItem("_unreal_lang", code);
    } catch {
      /* ignore */
    }
    // Si estamos en una ruta pública con prefijo de idioma, navega al mismo
    // path bajo el nuevo prefijo para mantener URL e idioma sincronizados.
    const seg = location.pathname.split("/").filter(Boolean);
    if (seg[0] && (SUPPORTED_LANGS as readonly string[]).includes(seg[0])) {
      const rest = seg.slice(1).join("/");
      navigate(`/${code}${rest ? "/" + rest : ""}${location.search}${location.hash}`);
    }
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

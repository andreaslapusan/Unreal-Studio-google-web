/**
 * Tailwind config — moved from inline CDN config in index.html.
 *
 * Theme values must stay in sync with the CSS custom properties used in
 * components (text-primary, bg-almond, font-serif, etc). If you add a new
 * brand colour or font, update both this config and any custom CSS that
 * references the same token.
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Rediseño 2026 "Piedra y basalto": paleta tomada del propio sujeto
      // (piedra paras balinesa, basalto volcánico, tierra laterita de los muros
      // de Amante/Deseo, verde de jungla). Los NOMBRES de token se conservan
      // (primary/almond) para que portales y admin hereden el cambio sin tocar
      // miles de clases.
      colors: {
        primary: "#1E1B16", // basalto (tinta)
        almond: "#ECE6DC", // piedra paras (superficie)
        paper: "#F6F3ED", // papel cálido (superficie elevada clara)
        clay: { DEFAULT: "#9E4A26", light: "#D8936B" }, // laterita (acento)
        moss: "#252B21", // jungla (superficie oscura secundaria)
        "surface-dark": "#1a1a1a",
      },
      fontFamily: {
        // `font-serif` es el rol de TITULAR en todo el código: ahora Archivo
        // expandido (ver index.css). El logo conserva DM Serif (font-logo).
        serif: ['"Archivo"', "system-ui", "sans-serif"],
        sans: ['"Archivo"', "system-ui", "sans-serif"],
        display: ['"Archivo"', "system-ui", "sans-serif"],
        accent: ['"Cormorant Garamond"', "Georgia", "serif"],
        logo: ['"DM Serif Display"', "Georgia", "serif"],
        montserrat: ['"Archivo"', "sans-serif"],
      },
      // Esquinas arquitectónicas: más contenidas que antes en TODA la app.
      borderRadius: {
        xl: "0.625rem",
        "2xl": "0.75rem",
        "3xl": "0.875rem",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    require("@tailwindcss/container-queries"),
  ],
};

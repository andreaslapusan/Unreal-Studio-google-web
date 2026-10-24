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
        white: "#FFFDF9",
        primary: "#2E2721", // tinta cálida, no negro
        almond: "#F5EFE6", // arena clara (superficie)
        paper: "#FBF8F2", // papel (superficie elevada)
        clay: { DEFAULT: "#A65A3A", light: "#E0A887" }, // terracota (acento)
        moss: "#3F4A3A", // jungla suave
        "surface-dark": "#1a1a1a",
      },
      fontFamily: {
        // `font-serif` es el rol de TITULAR en todo el código: ahora Archivo
        // expandido (ver index.css). El logo conserva DM Serif (font-logo).
        serif: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ['"Manrope"', "system-ui", "sans-serif"],
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
        accent: ['"Cormorant Garamond"', "Georgia", "serif"],
        logo: ['"DM Serif Display"', "Georgia", "serif"],
        montserrat: ['"Manrope"', "sans-serif"],
      },
      // Esquinas arquitectónicas: más contenidas que antes en TODA la app.
      borderRadius: {
        // Rediseño v2 "orgánico": esquinas suaves en toda la app.
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      // Sombras tintadas de basalto, con desplazamiento: profundidad real, no halo.
      boxShadow: {
        sm: "0 1px 2px 0 rgba(30,27,22,0.06)",
        DEFAULT: "0 2px 6px -1px rgba(30,27,22,0.08), 0 1px 2px -1px rgba(30,27,22,0.06)",
        md: "0 8px 20px -10px rgba(30,27,22,0.18)",
        lg: "0 16px 32px -16px rgba(30,27,22,0.22)",
        xl: "0 24px 48px -24px rgba(30,27,22,0.3)",
        "2xl": "0 36px 72px -32px rgba(30,27,22,0.38)",
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

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
      // REDISEÑO APPLE/MOVELTA (beta): marrón de marca solo como ACENTO (botones, eyebrows, activos);
      // texto en tinta neutra; crema → gris Apple #f5f5f7.
      colors: {
        primary: "#3F2305", // Café Noir (acento de marca)
        brand: "#3F2305",
        "brand-soft": "#8B5E34",
        ink: "#1d1d1f",
        mute: "#6e6e73",
        almond: "#f5f5f7",
        "surface-dark": "#1a1a1a",
      },
      textColor: { primary: "#1d1d1f" },
      borderColor: { primary: "#1d1d1f" },
      ringColor: { primary: "#1d1d1f" },
      fontFamily: {
        serif: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Display"', '"Inter"', '"Helvetica Neue"', "Arial", "sans-serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', '"Inter"', '"Helvetica Neue"', "Arial", "sans-serif"],
        montserrat: ['"Montserrat"', "sans-serif"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    require("@tailwindcss/container-queries"),
  ],
};

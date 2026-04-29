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
      colors: {
        primary: "#3F2305", // Café Noir
        almond: "#F3E5D8",
        "surface-dark": "#1a1a1a",
      },
      fontFamily: {
        serif: ['"DM Serif Display"', "serif"],
        sans: ['"Manrope"', "sans-serif"],
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

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./js/**/*.js"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#003527",
        "primary-container": "#064e3b",
        "primary-fixed": "#b0f0d6",
        "primary-fixed-dim": "#95d3ba",
        secondary: "#006c4a",
        "secondary-container": "#82f5c1",
        "secondary-fixed": "#85f8c4",
        tertiary: "#4a2400",
        "tertiary-container": "#ea580c",
        "tertiary-fixed": "#ffdcc3",
        "tertiary-fixed-dim": "#ffb77d",
        surface: "#faf9f7",
        "surface-dim": "#dadad8",
        "surface-bright": "#faf9f7",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f4f3f1",
        "surface-container": "#efeeec",
        "surface-container-high": "#e9e8e6",
        "on-surface": "#1a1c1b",
        "on-surface-variant": "#404944",
        outline: "#707974",
        "outline-variant": "#bfc9c3",
        dark: {
          bg: "#09090b",
          card: "#121215",
          border: "#27272a"
        }
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', '"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        serif: ['"Noto Serif"', 'Georgia', 'serif'],
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ]
};

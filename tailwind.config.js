/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./admin.html",
    "./js/**/*.js"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // --- Stitch Design System: Primary (Eco Green / Rừng Trà Vinh) ---
        primary: "#001e15",
        "primary-container": "#003527",
        "on-primary": "#ffffff",
        "on-primary-container": "#709f8c",
        "primary-fixed": "#bcedd8",
        "primary-fixed-dim": "#a0d1bc",
        "on-primary-fixed": "#002117",
        "on-primary-fixed-variant": "#204f3f",
        "inverse-primary": "#a0d1bc",

        // --- Stitch Design System: Secondary (Sông Nước / Phù Sa) ---
        secondary: "#006c4a",
        "secondary-container": "#9af1c6",
        "on-secondary": "#ffffff",
        "on-secondary-container": "#0b714e",
        "secondary-fixed": "#9df4c9",
        "secondary-fixed-dim": "#81d8ae",
        "on-secondary-fixed": "#002114",
        "on-secondary-fixed-variant": "#005237",

        // --- Stitch Design System: Tertiary & Accent (Cam Đất Nung / Khmer Ochre) ---
        tertiary: "#330c00",
        "tertiary-container": "#561a00",
        "on-tertiary": "#ffffff",
        "on-tertiary-container": "#fd651d",
        "tertiary-fixed": "#ffdbce",
        "tertiary-fixed-dim": "#ffb599",
        "on-tertiary-fixed": "#370e00",
        "on-tertiary-fixed-variant": "#7f2b00",
        accent: "#ea580c",
        "accent-hover": "#c2410c",

        // --- Stitch Design System: Surface & Background Layers ---
        surface: "#fbf8fc",
        "surface-dim": "#dcd9dd",
        "surface-bright": "#fbf8fc",
        "surface-variant": "#e4e1e6",
        "on-surface": "#1b1b1e",
        "on-surface-variant": "#404944",
        "surface-tint": "#396756",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f6f2f7",
        "surface-container": "#f0edf1",
        "surface-container-high": "#eae7eb",
        "surface-container-highest": "#e4e1e6",
        "inverse-surface": "#303033",
        "inverse-on-surface": "#f3f0f4",
        background: "#fbf8fc",
        "on-background": "#1b1b1e",

        // --- Stitch Design System: Outline & Error ---
        outline: "#717974",
        "outline-variant": "#c0c8c3",
        error: "#ba1a1a",
        "error-container": "#ffdad6",
        "on-error": "#ffffff",
        "on-error-container": "#93000a",

        // --- Tương thích ngược Dark Mode v2 ---
        dark: {
          bg: "#09090b",
          card: "#121215",
          border: "#27272a"
        }
      },
      spacing: {
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "1rem",
        "space-lg": "1.5rem",
        "space-xl": "2.5rem",
        margin: "2rem",
        gutter: "1.5rem",
        "margin-mobile": "1rem",
        "gutter-mobile": "1rem"
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        serif: ['"Be Vietnam Pro"', 'system-ui', '-apple-system', 'sans-serif'],
        button: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        caption: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        badge: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        'headline-xl': ['"Be Vietnam Pro"', 'sans-serif'],
        'headline-xl-mobile': ['"Be Vietnam Pro"', 'sans-serif'],
        'headline-lg': ['"Be Vietnam Pro"', 'sans-serif'],
        'headline-lg-mobile': ['"Be Vietnam Pro"', 'sans-serif'],
        'headline-md': ['"Be Vietnam Pro"', 'sans-serif'],
        'headline-sm': ['"Be Vietnam Pro"', 'sans-serif'],
        'body-lg': ['"Be Vietnam Pro"', 'sans-serif'],
        'body-md': ['"Be Vietnam Pro"', 'sans-serif'],
        'body-sm': ['"Be Vietnam Pro"', 'sans-serif']
      },
      fontSize: {
        'headline-xl': ['40px', { lineHeight: '48px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-xl-mobile': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-lg': ['28px', { lineHeight: '36px', letterSpacing: '-0.015em', fontWeight: '700' }],
        'headline-lg-mobile': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-sm': ['18px', { lineHeight: '26px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '26px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '22px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        button: ['14px', { lineHeight: '20px', letterSpacing: '0.01em', fontWeight: '600' }],
        caption: ['12px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '500' }],
        badge: ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '600' }]
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
        full: '9999px'
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ]
};

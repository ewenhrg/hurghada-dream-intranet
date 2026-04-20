/* eslint-env node */
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  // Tailwind v3+ purge automatiquement via `content`.
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['Outfit', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        /** Palette pages catalogue public (lisible, cohérente) */
        catalog: {
          bg: '#f4f8f7',
          surface: '#ffffff',
          muted: '#5c6d6a',
          ink: '#0f172a',
          teal: '#0f766e',
          tealLight: '#14b8a6',
          border: 'rgba(15, 118, 110, 0.12)',
        },
        hd: {
          bg: "#f8f9fa",
          bgSecondary: "#f1f3f5",
          card: "#ffffff",
          accent: "#2563eb",
          accentDark: "#1d4ed8",
          accentLight: "#3b82f6",
          text: "#1a1a1a",
          textSecondary: "#4b5563",
          border: "#e5e7eb",
          borderLight: "#f3f4f6",
        },
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'soft-lg': '0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
  // Optimisation : réduire la taille du CSS
  corePlugins: {
    // Désactiver les plugins non utilisés si nécessaire
    preflight: true,
  },
};

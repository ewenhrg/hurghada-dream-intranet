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
          deep: '#0c4c46',
          ocean: '#115e59',
          sand: '#d4a574',
          sandLight: '#fef3c7',
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
        soft: "0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)",
        "soft-lg": "0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
        "catalog-card":
          "0 2px 8px -2px rgba(15, 23, 42, 0.06), 0 16px 32px -12px rgba(15, 118, 110, 0.14)",
        "catalog-card-hover":
          "0 8px 24px -6px rgba(15, 23, 42, 0.08), 0 20px 40px -14px rgba(15, 118, 110, 0.22)",
        "btn-primary": "0 4px 14px -2px rgba(15, 118, 110, 0.45), 0 2px 6px -1px rgba(15, 23, 42, 0.08)",
        "glow-teal": "0 0 48px -12px rgba(45, 212, 191, 0.35)",
      },
      backgroundImage: {
        "catalog-mesh":
          "radial-gradient(ellipse 100% 80% at 50% -30%, rgba(45, 212, 191, 0.28) 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 10%, rgba(251, 191, 36, 0.14) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 0% 80%, rgba(13, 148, 136, 0.12) 0%, transparent 45%)",
        "catalog-footer-fade": "linear-gradient(180deg, rgba(248, 250, 249, 0) 0%, rgba(236, 253, 245, 0.9) 100%)",
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

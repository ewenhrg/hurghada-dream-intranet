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
        /** Pages catalogue public : Plus Jakarta Sans + Literata (look voyage premium) */
        'catalog-sans': ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'catalog-display': ['Literata', 'Georgia', 'ui-serif', 'serif'],
      },
      colors: {
        /** Palette catalogue public — nuit violette, corail, brume claire */
        catalog: {
          bg: '#e8e2f7',
          bgDeep: '#dcd4f2',
          surface: '#ffffff',
          ink: '#12051f',
          body: '#1f1333',
          muted: '#4a3d63',
          subtle: '#6d5f82',
          label: '#5b21b6',
          onDark: '#f5f3ff',
          /** Accent principal (CTA, liens actifs) */
          coral: '#ea580c',
          coralLight: '#ff8a4c',
          violet: '#6d28d9',
          violetLight: '#8b5cf6',
          deep: '#4c1d95',
          ocean: '#5b21b6',
          sand: '#f59e0b',
          sandLight: '#fff7ed',
          border: 'rgba(76, 29, 149, 0.14)',
          night: '#0f0820',
          /** Rétro-compat alias « teal » utilisés dans le JSX → violet */
          teal: '#5b21b6',
          tealLight: '#a78bfa',
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
          "0 2px 8px -2px rgba(15, 23, 42, 0.06), 0 18px 36px -14px rgba(91, 33, 182, 0.2)",
        "catalog-card-hover":
          "0 10px 28px -8px rgba(15, 23, 42, 0.1), 0 24px 48px -16px rgba(234, 88, 12, 0.18)",
        "catalog-premium":
          "0 2px 4px -1px rgba(15, 23, 42, 0.06), 0 22px 50px -14px rgba(76, 29, 149, 0.18), 0 0 0 1px rgba(255,255,255,0.7) inset",
        "catalog-premium-hover":
          "0 14px 44px -10px rgba(76, 29, 149, 0.22), 0 6px 20px -6px rgba(234, 88, 12, 0.2), 0 0 0 1px rgba(255,255,255,0.85) inset",
        "btn-primary": "0 4px 18px -2px rgba(234, 88, 12, 0.45), 0 2px 8px -1px rgba(76, 29, 149, 0.25)",
        "glow-teal": "0 0 56px -10px rgba(167, 139, 250, 0.45)",
      },
      backgroundImage: {
        "catalog-mesh":
          "radial-gradient(ellipse 100% 80% at 50% -20%, rgba(167, 139, 250, 0.35) 0%, transparent 50%), radial-gradient(ellipse 90% 60% at 100% 10%, rgba(234, 88, 12, 0.14) 0%, transparent 45%), radial-gradient(ellipse 70% 55% at 0% 100%, rgba(91, 33, 182, 0.12) 0%, transparent 48%), radial-gradient(ellipse 55% 40% at 85% 90%, rgba(15, 23, 42, 0.06) 0%, transparent 52%)",
        /** Grille très légère pour texture « éditoriale » */
        "catalog-grid":
          "linear-gradient(to right, rgba(91,33,182,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(91,33,182,0.06) 1px, transparent 1px)",
        "catalog-footer-fade":
          "linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(232, 226, 247, 0.95) 100%)",
      },
      keyframes: {
        /** Entrées pages catalogue public (légères, GPU-friendly) */
        catalogInUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        catalogInFade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        catalogInSoft: {
          "0%": { opacity: "0", transform: "scale(0.98)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "catalog-in-up": "catalogInUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        "catalog-in-fade": "catalogInFade 0.45s ease-out both",
        "catalog-in-soft": "catalogInSoft 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
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

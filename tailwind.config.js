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
        /** Pages catalogue public uniquement (Sora + Fraunces) */
        'catalog-sans': ['Sora', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'catalog-display': ['Fraunces', 'Georgia', 'ui-serif', 'serif'],
      },
      colors: {
        /** Palette pages catalogue public (lisible, cohérente) */
        catalog: {
          bg: '#eef6f4',
          surface: '#ffffff',
          /** Lisibilité : encre / corps / secondaire bien séparés (WCAG-friendly sur fond clair) */
          ink: '#011816',
          body: '#0f172a',
          muted: '#1e293b',
          subtle: '#334155',
          /** Libellés petits caps : plus foncé pour WCAG sur fond crème */
          label: '#065f46',
          onDark: '#f8fafc',
          teal: '#0f766e',
          tealLight: '#14b8a6',
          deep: '#0c4c46',
          ocean: '#115e59',
          sand: '#c4a35a',
          sandLight: '#fef3c7',
          border: 'rgba(15, 23, 42, 0.12)',
          night: '#022c22',
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
        "catalog-premium":
          "0 2px 4px -1px rgba(2, 44, 34, 0.04), 0 20px 48px -12px rgba(4, 47, 46, 0.12), 0 0 0 1px rgba(255,255,255,0.65) inset",
        "catalog-premium-hover":
          "0 12px 40px -8px rgba(4, 47, 46, 0.18), 0 4px 16px -4px rgba(196, 163, 90, 0.15), 0 0 0 1px rgba(255,255,255,0.8) inset",
        "btn-primary": "0 4px 14px -2px rgba(15, 118, 110, 0.45), 0 2px 6px -1px rgba(15, 23, 42, 0.08)",
        "glow-teal": "0 0 48px -12px rgba(45, 212, 191, 0.35)",
      },
      backgroundImage: {
        "catalog-mesh":
          "radial-gradient(ellipse 110% 90% at 50% -35%, rgba(45, 212, 191, 0.22) 0%, transparent 52%), radial-gradient(ellipse 80% 55% at 100% 0%, rgba(196, 163, 90, 0.12) 0%, transparent 48%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(13, 148, 136, 0.1) 0%, transparent 42%), radial-gradient(ellipse 60% 40% at 80% 85%, rgba(15, 23, 42, 0.06) 0%, transparent 50%)",
        /** Grille très légère pour texture « éditoriale » */
        "catalog-grid":
          "linear-gradient(to right, rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.04) 1px, transparent 1px)",
        "catalog-footer-fade": "linear-gradient(180deg, rgba(248, 250, 249, 0) 0%, rgba(236, 253, 245, 0.9) 100%)",
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

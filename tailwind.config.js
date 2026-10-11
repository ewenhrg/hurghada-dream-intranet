/* eslint-env node */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  // Tailwind v3+ purge automatiquement via `content`.
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        /** "Inter Variable" = paquet local @fontsource : rendu immédiat, sans réseau. */
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['Outfit', '"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        /** Appli client « luxe éditorial » : Fraunces (titres, taille optique), Figtree (texte). Locales. */
        'catalog-sans': ['"Figtree Variable"', 'Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'catalog-display': ['"Fraunces Variable"', 'Fraunces', 'Georgia', 'ui-serif', 'serif'],
        'catalog-serif': ['"Fraunces Variable"', 'Fraunces', 'Georgia', 'ui-serif', 'serif'],
      },
      colors: {
        /** Tokens shadcn/ui (mappés sur les variables CSS de src/index.css).
         *  Utilisés uniquement par les primitives shadcn ; le thème cosmique
         *  reste piloté par html/body + .hd-card et n'est pas affecté. */
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--primary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        /** Palette appli client « Riviera mer Rouge » : blanc chaud, lagon turquoise, coucher de soleil corail, sable doré.
         *  `ink` = texte principal (bleu nuit marin) ; `raised` / `deep` = aplat foncé (grand bleu) ; `night` = fond photo. */
        catalog: {
          bg: '#FAF6EF',
          bgDeep: '#F1E9DB',
          mist: '#E9F3F2',
          surface: '#FFFFFF',
          raised: '#0B4F5C',
          ink: '#0F2A33',
          body: '#33474D',
          muted: '#5F7378',
          subtle: '#889A9D',
          label: '#0E7C86',
          onDark: '#FAF6EF',
          night: '#0A2A33',
          coral: '#DE5530',
          coralDeep: '#B8421F',
          coralLight: '#F4A68A',
          coralSoft: '#FDEBE3',
          lagoon: '#0E7C86',
          lagoonDeep: '#0B4F5C',
          lagoonSoft: '#DCF0EF',
          brass: '#A8731F',
          brassSoft: '#FBF0DC',
          sand: '#E3AE55',
          sandLight: '#FBF0DC',
          violet: '#0B4F5C',
          violetLight: '#8FD3D2',
          deep: '#0B4F5C',
          ocean: '#0B4F5C',
          teal: '#0E7C86',
          tealLight: '#8FD3D2',
          border: 'rgba(15, 42, 51, 0.12)',
          line: 'rgba(15, 42, 51, 0.07)',
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
        "catalog-card": "0 1px 2px rgba(11, 79, 92, 0.05), 0 14px 32px -18px rgba(11, 79, 92, 0.28)",
        "catalog-card-hover": "0 2px 4px rgba(11, 79, 92, 0.06), 0 20px 42px -20px rgba(11, 79, 92, 0.32)",
        "catalog-premium": "0 1px 2px rgba(29, 36, 37, 0.04), 0 12px 30px -18px rgba(29, 36, 37, 0.18)",
        "catalog-premium-hover": "0 2px 4px rgba(29, 36, 37, 0.05), 0 18px 40px -20px rgba(29, 36, 37, 0.22)",
        "catalog-cta": "0 10px 24px -12px rgba(222, 85, 48, 0.6)",
        "catalog-float": "0 12px 30px -12px rgba(11, 79, 92, 0.4)",
        "btn-primary": "0 4px 16px -2px rgba(15, 61, 62, 0.35)",
        "glow-teal": "0 0 48px -12px rgba(26, 107, 102, 0.35)",
      },
      backgroundImage: {
        "catalog-mesh": "linear-gradient(180deg, #FAF6EF 0%, #F1E9DB 100%)",
        "catalog-abyss": "linear-gradient(150deg, #0E7C86 0%, #0B5A68 52%, #0A3B4A 100%)",
        "catalog-sunset": "linear-gradient(135deg, #F07A4A 0%, #DE5530 55%, #C9452A 100%)",
        "catalog-photo-fade":
          "linear-gradient(180deg, rgba(10, 42, 51, 0) 38%, rgba(10, 42, 51, 0.4) 68%, rgba(8, 36, 46, 0.86) 100%)",
        "catalog-grid":
          "linear-gradient(to right, rgba(11,29,38,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,29,38,0.045) 1px, transparent 1px)",
        "catalog-footer-fade":
          "linear-gradient(180deg, rgba(250, 246, 239, 0) 0%, rgba(250, 246, 239, 0.96) 100%)",
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

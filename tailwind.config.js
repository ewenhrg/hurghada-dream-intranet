/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  // Optimisation : purge CSS agressive en production
  purge: {
    enabled: process.env.NODE_ENV === 'production',
    content: [
      "./index.html",
      "./src/**/*.{js,jsx,ts,tsx}",
    ],
    // Options de purge pour réduire la taille
    options: {
      safelist: [
        // Garder les classes dynamiques importantes
        /^(bg|text|border)-(primary|secondary|accent|success|warning|danger|info)/,
      ],
    },
  },
  theme: {
    extend: {
      colors: {
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

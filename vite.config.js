import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Optimisations de build - utiliser esbuild (plus rapide, déjà inclus)
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Optimiser le code splitting pour réduire la taille du bundle initial
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'utils-vendor': ['xlsx', '@tanstack/react-virtual'],
        },
      },
    },
    // Augmenter la taille limite des chunks
    chunkSizeWarningLimit: 1000,
    // Désactiver les source maps en production pour réduire la taille
    sourcemap: false,
  },
  // Optimisations pour le développement
  server: {
    hmr: {
      overlay: false, // Désactiver l'overlay d'erreur pour de meilleures performances
    },
  },
  // Optimiser les assets
  assetsInclude: ['**/*.xlsx'],
})

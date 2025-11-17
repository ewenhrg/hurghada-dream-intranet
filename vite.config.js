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
        manualChunks: (id) => {
          // Séparer les vendors
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
            if (id.includes('react-router')) {
              return 'router-vendor';
            }
            if (id.includes('xlsx') || id.includes('@tanstack/react-virtual') || id.includes('react-window')) {
              return 'utils-vendor';
            }
            // Autres vendors dans un chunk séparé
            return 'vendor';
          }
          // Séparer les pages pour un meilleur code splitting
          if (id.includes('/pages/')) {
            const pageName = id.split('/pages/')[1].split('.')[0];
            return `page-${pageName}`;
          }
        },
        // Optimiser les noms de chunks pour un meilleur caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Augmenter la taille limite des chunks
    chunkSizeWarningLimit: 1000,
    // Désactiver les source maps en production pour réduire la taille
    sourcemap: false,
    // Optimiser les assets
    assetsInlineLimit: 4096, // Inline les petits assets (<4KB)
    // Réduire la taille du bundle avec tree-shaking agressif
    treeshake: {
      moduleSideEffects: false,
    },
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

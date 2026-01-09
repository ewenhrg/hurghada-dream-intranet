import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Optimisations de build - utiliser esbuild (plus rapide, déjà inclus)
    minify: 'esbuild', // esbuild est plus rapide que terser pour le build
    // Optimiser la taille du bundle
    target: 'esnext',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Optimiser le code splitting pour réduire la taille du bundle initial
        manualChunks: (id) => {
          // IMPORTANT: Mettre React, React-DOM, Supabase et lib/supabase dans le chunk principal
          // pour garantir qu'ils soient chargés en premier et éviter les erreurs d'initialisation
          if (
            id.includes('react') || 
            id.includes('react-dom') ||
            id.includes('lib/supabase') || 
            id.includes('@supabase') ||
            id.includes('react-router')
          ) {
            return undefined; // undefined = chunk principal (index)
          }
          
          // Séparer les vendors restants
          if (id.includes('node_modules')) {
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
          // Séparer les composants
          if (id.includes('/components/')) {
            return 'components';
          }
          // Séparer les utilitaires
          if (id.includes('/utils/') || id.includes('/utils.js')) {
            return 'utils';
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
    // Exclure React et Supabase du tree-shaking strict pour éviter les problèmes d'initialisation
    treeshake: {
      moduleSideEffects: (id) => {
        // Garder les effets de bord pour React, Supabase et les modules critiques
        if (
          id.includes('@supabase') || 
          id.includes('supabase') ||
          id.includes('react') ||
          id.includes('react-dom')
        ) {
          return true;
        }
        return false;
      },
      preset: 'smallest',
    },
    // Optimiser la compression
    reportCompressedSize: false, // Désactiver pour accélérer le build
    // Optimiser les assets
    assetsInlineLimit: 8192, // Inline les petits assets (<8KB) pour réduire les requêtes HTTP
    // Optimiser le chargement
    modulePreload: {
      polyfill: false, // Désactiver le polyfill pour réduire la taille
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
  // Configuration PWA
  publicDir: 'public',
})

import path from "path";
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    // Optimisations de build - utiliser esbuild (plus rapide, déjà inclus)
    minify: 'esbuild',
    target: 'esnext',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (
            id.includes('react') ||
            id.includes('react-dom') ||
            id.includes('lib/supabase') ||
            id.includes('@supabase') ||
            id.includes('react-router')
          ) {
            return undefined;
          }

          if (id.includes('node_modules')) {
            if (
              id.includes('xlsx') ||
              id.includes('@tanstack/react-virtual') ||
              id.includes('react-window')
            ) {
              return 'utils-vendor';
            }
            return 'vendor';
          }

          if (id.includes('/pages/')) {
            const pageName = id.split('/pages/')[1].split('.')[0];
            return `page-${pageName}`;
          }

          if (id.includes('/components/')) {
            return 'components';
          }

          if (id.includes('/utils/') || id.includes('/utils.js')) {
            return 'utils';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    treeshake: {
      moduleSideEffects: (id) => {
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
    reportCompressedSize: false,
    assetsInlineLimit: 8192,
    modulePreload: {
      polyfill: false,
    },
  },

  server: {
    hmr: {
      overlay: false,
    },
  },

  assetsInclude: ['**/*.xlsx'],
  publicDir: 'public',
});
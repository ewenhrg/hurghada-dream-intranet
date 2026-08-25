import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Chemins Windows -> POSIX (une seule définition, réutilisée par manualChunks). */
function toPosixId(id) {
  return id.replace(/\\/g, "/");
}

function isReactCoreModule(id) {
  // Ne pas matcher lucide-react / @base-ui/react / etc.
  const normalized = toPosixId(id);
  return (
    /\/(react|react-dom|scheduler)(\/|$)/.test(normalized) ||
    normalized.includes("react-router") ||
    normalized.includes("react-router-dom")
  );
}

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Une seule copie de React (évite O.Activity = … sur undefined)
    dedupe: ["react", "react-dom"],
  },

  build: {
    minify: "esbuild",
    target: "esnext",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = toPosixId(id);

          // Code applicatif : on laisse Rollup découper par route (lazyPages.js).
          // Les anciens groupes « utils » / « components » / « page-* » forçaient
          // tout le code partagé dans le graphe statique de l'entrée : le
          // code-splitting était annulé et ~2 Mo de JS étaient préchargés
          // avant le premier rendu.
          if (!normalized.includes("node_modules")) return;

          // React DOIT être dans un seul chunk nommé (pas undefined)
          if (isReactCoreModule(normalized)) {
            return "react-vendor";
          }

          // Excel : chunks isolés, chargés uniquement à l'import/export réel
          if (normalized.includes("xlsx-js-style")) {
            return "xlsx-style-vendor";
          }
          if (/\/xlsx\//.test(normalized)) {
            return "xlsx-vendor";
          }

          if (
            normalized.includes("framer-motion") ||
            normalized.includes("lucide-react") ||
            normalized.includes("@base-ui") ||
            normalized.includes("class-variance-authority") ||
            normalized.includes("clsx") ||
            normalized.includes("tailwind-merge")
          ) {
            return "ui-vendor";
          }
          if (normalized.includes("@supabase") || normalized.includes("supabase")) {
            return "supabase";
          }
          return "vendor";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    // Tree-shaking moins agressif : le preset "smallest" cassait l'init React 19.2 (Activity)
    treeshake: {
      moduleSideEffects: true,
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

  assetsInclude: ["**/*.xlsx"],
  publicDir: "public",
});

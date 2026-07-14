import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function isReactCoreModule(id) {
  // Ne pas matcher lucide-react / @base-ui/react / etc.
  const normalized = id.replace(/\\/g, "/");
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
          const normalized = id.replace(/\\/g, "/");

          if (normalized.includes("node_modules")) {
            // React DOIT être dans un seul chunk nommé (pas undefined)
            if (isReactCoreModule(normalized)) {
              return "react-vendor";
            }
            if (
              normalized.includes("xlsx") ||
              normalized.includes("@tanstack/react-virtual") ||
              normalized.includes("react-window") ||
              normalized.includes("react-virtualized")
            ) {
              return "utils-vendor";
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
          }

          if (normalized.includes("/pages/")) {
            const pageName = normalized.split("/pages/")[1].split(".")[0];
            return `page-${pageName}`;
          }

          if (normalized.includes("/components/")) {
            return "components";
          }

          if (normalized.includes("/utils/") || normalized.endsWith("/utils.js")) {
            return "utils";
          }
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

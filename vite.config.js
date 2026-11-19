import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { INSTAGRAM_HANDLE, loadInstagramReels } from "./api/instagramReels.js";

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

function instagramReelsDevApi() {
  return {
    name: "instagram-reels-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        if (pathname !== "/api/instagram-reels") return next();
        const reels = await loadInstagramReels();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify({ handle: INSTAGRAM_HANDLE, reels }));
      });
    },
  };
}

/**
 * Adresse publique du site pour les balises SEO statiques de index.html (Open Graph, JSON-LD).
 * Le jour du passage sur hurghadadream.com : définir VITE_SITE_URL=https://hurghadadream.com sur Vercel.
 */
const DEFAULT_SITE_URL = "https://hurghada-dream-intranet.vercel.app";

function seoHtml(env) {
  const siteUrl = String(env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return {
    name: "hd-seo-html",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        let out = html.replaceAll("%SITE_URL%", siteUrl);
        return out;
      },
    },
  };
}

/**
 * Premier affichage rapide (build seulement) :
 * - liste les fichiers JS du site public et de l’accueil + la police principale dans
 *   `window.__HD_PRELOAD` ; le script de démarrage de index.html les précharge selon la page
 *   (casse la chaîne entrée → site public → accueil, téléchargée sinon l’un après l’autre) ;
 * - script d’entrée + CSS lancés par le script de démarrage : sur l’accueil, seulement après
 *   l’image de démarrage (rien ne lui dispute le réseau ni le processeur). main.jsx attend les
 *   feuilles (`data-hd-css`) avant le rendu React (jamais de page sans style).
 */
function fastBootHtml(env = {}) {
  const posix = (id) => String(id || "").split(String.fromCharCode(92)).join("/");
  return {
    name: "hd-fast-boot",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((item) => item.type === "chunk");
        const byModule = (suffix) =>
          chunks.find(
            (chunk) =>
              posix(chunk.facadeModuleId).endsWith(suffix) ||
              (chunk.moduleIds || Object.keys(chunk.modules || {})).some((id) => posix(id).endsWith(suffix))
          );
        const entry = chunks.find((chunk) => chunk.isEntry);
        const inEntry = new Set();
        const walk = (chunk, seen) => {
          if (!chunk || seen.has(chunk.fileName)) return;
          seen.add(chunk.fileName);
          chunk.imports.forEach((file) => walk(bundle[file], seen));
        };
        walk(entry, inEntry);
        const graph = (chunk) => {
          const seen = new Set();
          walk(chunk, seen);
          return [...seen].filter((file) => !inEntry.has(file)).map((file) => `/${file}`);
        };
        const routes = graph(byModule("/src/PublicClientRoutes.jsx"));
        const home = graph(byModule("/src/pages/PublicHomePage.jsx")).filter((file) => !routes.includes(file));
        const font = Object.values(bundle).find(
          (item) => item.type === "asset" && /figtree-latin-wght-normal-[\w-]+\.woff2$/.test(item.fileName)
        );
        const supabase = /^https:\/\//.test(env.VITE_SUPABASE_URL || "") ? env.VITE_SUPABASE_URL : "";
        // Script d’entrée, ses préchargements et le CSS : retirés du HTML, lancés par le script
        // de démarrage de index.html (tout de suite, sauf sur l’accueil : après l’image).
        const entryDeps = [];
        const css = [];
        let out = html
          .replace(/\s*<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/, "")
          .replace(/\s*<link rel="modulepreload"[^>]*href="([^"]+)"[^>]*>/g, (_m, href) => {
            entryDeps.push(href);
            return "";
          })
          .replace(/\s*<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/g, (_m, href) => {
            css.push(href);
            return `
    <noscript><link rel="stylesheet" href="${href}"></noscript>`;
          });
        const manifest = JSON.stringify({
          entry: entry ? `/${entry.fileName}` : "",
          entryDeps,
          css,
          routes,
          home,
          font: font ? `/${font.fileName}` : "",
          supabase,
        });
        out = out.replace("<head>", `<head>
    <script>window.__HD_PRELOAD=${manifest};</script>`);
        return out;
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), instagramReelsDevApi(), seoHtml(loadEnv(mode, process.cwd(), "")), fastBootHtml(loadEnv(mode, process.cwd(), ""))],

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
          // Utilitaires Rollup / Vite (CommonJS, préchargement) : avec les autres libs, sinon ils atterrissent dans
          // « supabase » et créent une boucle supabase ⇄ vendor (erreur « before initialization »).
          if (normalized.includes("commonjsHelpers") || normalized.includes("vite/preload-helper")) return "vendor";

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
          // PDF (html2pdf + html2canvas + jsPDF, ~2 Mo) : pas de chunk manuel. Importé
          // dynamiquement au clic (quotePdfDownload.js), Rollup le range seul dans un fichier à part.
          // Rangé dans « vendor », il était téléchargé par toutes les pages, site public compris.
          if (
            normalized.includes("html2pdf") ||
            normalized.includes("html2canvas") ||
            normalized.includes("jspdf") ||
            normalized.includes("canvg") ||
            normalized.includes("dompurify") ||
            normalized.includes("core-js") ||
            normalized.includes("fflate") ||
            normalized.includes("rgbcolor") ||
            normalized.includes("stackblur") ||
            normalized.includes("svg-pathdata") ||
            normalized.includes("raf/") ||
            normalized.includes("performance-now")
          ) {
            return undefined;
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
}));

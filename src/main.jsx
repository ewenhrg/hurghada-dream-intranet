import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { IS_CLIENT_APP } from "./config/clientApp";
import { initToast } from "./utils/toast.js";
import { logger } from "./utils/logger";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ScrollOptimizer } from "./components/ScrollOptimizer";
import "./index.css"; // 👈 c'est ici qu'on charge le CSS (où il y aura @tailwind)

// Initialiser le système de toasts au démarrage
initToast();

// Désactiver l’ancien SW de cache. Conserver stay-sw.js (notifications Mon séjour).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const stale = registrations.filter((registration) => {
        const script =
          registration.active?.scriptURL ||
          registration.waiting?.scriptURL ||
          registration.installing?.scriptURL ||
          "";
        return !script.includes("stay-sw.js");
      });
      await Promise.all(stale.map((registration) => registration.unregister()));
      if (stale.length) logger.log("Ancien Service Worker de cache désenregistré.");
    } catch (error) {
      logger.warn("Impossible de désenregistrer l’ancien Service Worker:", error);
    }
  });
}

async function boot() {
  // Chargement séparé : le build client (Capacitor) n’embarque pas l’intranet.
  const Root = IS_CLIENT_APP
    ? (await import("./ClientApp.jsx")).ClientApp
    : (await import("./App.jsx")).default;

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <BrowserRouter>
        <LanguageProvider>
          <ScrollOptimizer>
            <Root />
          </ScrollOptimizer>
        </LanguageProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

void boot();

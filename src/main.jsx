import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ScrollOptimizer>
          <App />
        </ScrollOptimizer>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);

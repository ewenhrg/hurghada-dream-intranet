import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { initToast } from "./utils/toast.js";
import { logger } from "./utils/logger";
import { LanguageProvider } from "./contexts/LanguageContext";
import "./index.css"; // 👈 c'est ici qu'on charge le CSS (où il y aura @tailwind)

// Initialiser le système de toasts au démarrage
initToast();

// Désactiver temporairement le Service Worker pour éviter les versions figées en cache.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      logger.log("Service Worker désenregistré (mode cache-safe).");
    } catch (error) {
      logger.warn("Impossible de désenregistrer le Service Worker:", error);
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);

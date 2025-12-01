import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { initToast } from "./utils/toast.js";
import { LanguageProvider } from "./contexts/LanguageContext";
import "./index.css"; // 👈 c'est ici qu'on charge le CSS (où il y aura @tailwind)

// Initialiser le système de toasts au démarrage
initToast();

// Enregistrer le Service Worker pour PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker enregistré avec succès:', registration.scope);
        
        // Vérifier les mises à jour périodiquement
        setInterval(() => {
          registration.update();
        }, 60000); // Vérifier toutes les minutes
      })
      .catch((error) => {
        console.log('Échec de l\'enregistrement du Service Worker:', error);
      });
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

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { initToast } from "./utils/toast.js";
import "./index.css"; // 👈 c'est ici qu'on charge le CSS (où il y aura @tailwind)

// Initialiser le système de toasts au démarrage
initToast();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Gestionnaire global des notifications toast
let toastContainer = null;

// Initialiser le conteneur de toasts
export function initToast() {
  if (toastContainer) return;
  
  toastContainer = document.createElement("div");
  toastContainer.id = "toast-container";
  toastContainer.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
    max-width: 400px;
  `;
  document.body.appendChild(toastContainer);
}

// Supprimer un toast
function removeToast(toastElement) {
  toastElement.style.transform = "translateX(400px)";
  toastElement.style.opacity = "0";
  setTimeout(() => {
    if (toastElement.parentNode) {
      toastElement.parentNode.removeChild(toastElement);
    }
  }, 300);
}

// Afficher un toast
function showToast(message, type = "info", duration = 4000) {
  if (!toastContainer) initToast();

  const toast = document.createElement("div");
  toast.style.cssText = `
    pointer-events: auto;
    padding: 16px;
    border-radius: 12px;
    border: 2px solid;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    transform: translateX(0);
    opacity: 1;
    transition: all 0.3s ease;
  `;

  // Styles par type - Couleurs de texte plus foncées pour meilleure lisibilité
  const styles = {
    success: {
      background: "#f0fdf4",
      borderColor: "#86efac",
      color: "#065f46", // Plus foncé pour meilleure lisibilité
      icon: "✅"
    },
    error: {
      background: "#fef2f2",
      borderColor: "#fca5a5",
      color: "#7f1d1d", // Plus foncé pour meilleure lisibilité
      icon: "❌"
    },
    warning: {
      background: "#fffbeb",
      borderColor: "#fde047",
      color: "#713f12", // Plus foncé pour meilleure lisibilité
      icon: "⚠️"
    },
    info: {
      background: "#eff6ff",
      borderColor: "#93c5fd",
      color: "#1e3a8a", // Plus foncé pour meilleure lisibilité
      icon: "ℹ️"
    }
  };

  const style = styles[type] || styles.info;
  toast.style.background = style.background;
  toast.style.borderColor = style.borderColor;
  toast.style.color = style.color;

  toast.innerHTML = `
    <span style="font-size: 20px; flex-shrink: 0;">${style.icon}</span>
    <span style="flex: 1; font-size: 14px; font-weight: 600; color: ${style.color};">${message}</span>
    <button style="flex-shrink: 0; cursor: pointer; background: none; border: none; color: ${style.color}; opacity: 0.7; font-size: 18px; padding: 0; width: 20px; height: 20px; font-weight: bold;" onclick="this.closest('#toast-container > div').remove()">✕</button>
  `;

  toastContainer.appendChild(toast);

  // Auto-supprimer après la durée spécifiée
  if (duration > 0) {
    setTimeout(() => removeToast(toast), duration);
  }

  return toast;
}

// API publique
export const toast = {
  success: (msg, duration) => showToast(msg, "success", duration),
  error: (msg, duration) => showToast(msg, "error", duration),
  warning: (msg, duration) => showToast(msg, "warning", duration),
  info: (msg, duration) => showToast(msg, "info", duration),
};


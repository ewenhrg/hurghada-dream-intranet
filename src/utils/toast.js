// Gestionnaire global des notifications toast
let toastContainer = null;

/** Routes visibles par les clients (hors intranet). */
function isPublicClientPath(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  const p = String(pathname || "");
  return (
    p === "/catalogue" ||
    p.startsWith("/catalogue/") ||
    p === "/hotels" ||
    p.startsWith("/hotels/") ||
    p === "/demande-hotel" ||
    p.startsWith("/demande-hotel/") ||
    p.startsWith("/request")
  );
}

function isCataloguePath(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  const p = String(pathname || "");
  return p === "/catalogue" || p.startsWith("/catalogue/");
}

/** Messages techniques / internes — jamais montrés aux clients. */
function isInternalOrTechnicalMessage(message) {
  const m = String(message || "").toLowerCase();
  if (!m.trim()) return true;
  return (
    m.includes("supabase") ||
    m.includes("postgrest") ||
    m.includes("pgrst") ||
    m.includes("row-level") ||
    m.includes("row level") ||
    m.includes("violates") ||
    /\brls\b/.test(m) ||
    m.includes("vérifiez la console") ||
    m.includes("verifiez la console") ||
    m.includes("console pour") ||
    m.includes("localement") ||
    m.includes("localstorage") ||
    m.includes("intranet") ||
    m.includes("jwt") ||
    m.includes("auth email") ||
    m.includes("intranet_auth") ||
    m.includes("session admin") ||
    m.includes("session administrateur") ||
    m.includes("politique") ||
    m.includes("permission denied") ||
    m.includes("synchronisation") ||
    m.includes("synchronisé") ||
    m.includes("synchronise") ||
    m.includes("schema") ||
    m.includes("sql") ||
    m.includes("stack") ||
    m.includes("exception") ||
    m.includes("erreur inattendue") ||
    m.includes("service temporairement") ||
    m.includes("failed to") ||
    m.includes("networkerror")
  );
}

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

export function clearToasts() {
  if (!toastContainer) return;
  toastContainer.innerHTML = "";
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

// Afficher un toast (durée par défaut 2 s pour éviter l'accumulation de notifs)
function normalizeDuration(durationOrOptions, fallback = 2000) {
  if (durationOrOptions == null) return fallback;
  if (typeof durationOrOptions === "number" && Number.isFinite(durationOrOptions)) {
    return Math.max(0, durationOrOptions);
  }
  if (typeof durationOrOptions === "object") {
    const d = durationOrOptions.duration;
    if (typeof d === "number" && Number.isFinite(d)) return Math.max(0, d);
  }
  return fallback;
}

function showToast(message, type = "info", durationOrOptions = 2000) {
  // Catalogue public : aucune notif (erreurs sync / Supabase / internes).
  if (typeof window !== "undefined" && isCataloguePath()) {
    return null;
  }

  // Autres pages client : bloquer uniquement le technique / interne.
  if (typeof window !== "undefined" && isPublicClientPath()) {
    if (type === "error" || type === "warning" || type === "info") {
      if (isInternalOrTechnicalMessage(message)) return null;
    }
    if (isInternalOrTechnicalMessage(message)) return null;
  }

  // Cap pour que les notifs intranet ne restent pas collées indéfiniment
  const MAX_TOAST_MS = 5000;
  let duration = normalizeDuration(durationOrOptions, 2000);
  if (duration <= 0) duration = 2000;
  duration = Math.min(duration, MAX_TOAST_MS);

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

  const safeMessage = String(message ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  toast.innerHTML = `
    <span style="font-size: 20px; flex-shrink: 0;">${style.icon}</span>
    <span style="flex: 1; font-size: 14px; font-weight: 600; color: ${style.color};">${safeMessage}</span>
    <button type="button" aria-label="Fermer" style="flex-shrink: 0; cursor: pointer; background: none; border: none; color: ${style.color}; opacity: 0.7; font-size: 18px; padding: 0; width: 20px; height: 20px; font-weight: bold;">✕</button>
  `;

  const closeBtn = toast.querySelector("button");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => removeToast(toast));
  }

  toastContainer.appendChild(toast);

  // Toujours auto-supprimer (évite les notifs qui restent collées)
  setTimeout(() => removeToast(toast), duration);

  return toast;
}

// API publique
export const toast = {
  success: (msg, durationOrOptions) => showToast(msg, "success", durationOrOptions),
  error: (msg, durationOrOptions) => showToast(msg, "error", durationOrOptions),
  warning: (msg, durationOrOptions) => showToast(msg, "warning", durationOrOptions),
  info: (msg, durationOrOptions) => showToast(msg, "info", durationOrOptions),
};

/**
 * Connexion lente ou mode « économie de données » : on n’affiche alors que des images
 * (pas de vidéo en lecture automatique, pas de préchargement d’autres pages).
 * Network Information API : Chrome / Android ; ailleurs on considère la connexion normale.
 */
export function isSlowConnection() {
  if (typeof navigator === "undefined") return false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return /(^|-)(2g|3g)$/.test(String(connection.effectiveType || ""));
}

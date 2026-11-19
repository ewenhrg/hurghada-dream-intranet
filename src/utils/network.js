/**
 * Connexion très lente (2G) ou mode « économie de données » : on n’affiche alors que des images
 * (pas de vidéo en lecture automatique, pas de préchargement d’autres pages).
 * Network Information API : Chrome / Android ; ailleurs on considère la connexion normale.
 */
export function isSlowConnection() {
  if (typeof navigator === "undefined") return false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return false;
  if (connection.saveData) return true;
  // « 3g » seul ne suffit pas : l’estimation de Chrome fluctue au démarrage et classait des
  // connexions 4G correctes en 3G (vidéo coupée à tort). Les vidéos attendent de toute façon
  // la fin du chargement, elles ne ralentissent donc plus le premier affichage.
  return /(^|-)2g$/.test(String(connection.effectiveType || ""));
}

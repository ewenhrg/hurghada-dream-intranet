/**
 * Sauvegarde et restauration de toutes les activités
 * Format JSON avec métadonnées pour éviter les pertes de données
 */

export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME_PREFIX = "hd_activities_backup";

/**
 * Génère un nom de fichier avec la date
 */
export function getBackupFilename() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5).replace(":", "h");
  return `${BACKUP_FILENAME_PREFIX}_${date}_${time}.json`;
}

/**
 * Crée une sauvegarde complète des activités (pour téléchargement)
 * @param {Array} activities - Liste des activités
 * @param {string} siteKey - Clé du site
 * @returns {Object} Objet de sauvegarde
 */
export function createBackup(activities, siteKey) {
  const exportedAt = new Date().toISOString();
  return {
    version: BACKUP_VERSION,
    exportedAt,
    site_key: siteKey,
    count: activities.length,
    activities: activities.map((a) => ({
      id: a.id,
      supabase_id: a.supabase_id,
      name: a.name,
      category: a.category,
      priceAdult: a.priceAdult,
      priceChild: a.priceChild,
      priceBaby: a.priceBaby,
      ageChild: a.ageChild,
      ageBaby: a.ageBaby,
      currency: a.currency,
      availableDays: a.availableDays,
      notes: a.notes,
      description: a.description,
      transfers: a.transfers,
    })),
  };
}

/**
 * Télécharge la sauvegarde en fichier JSON
 */
export function downloadBackup(activities, siteKey) {
  const backup = createBackup(activities, siteKey);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = getBackupFilename();
  a.click();
  URL.revokeObjectURL(url);
  return backup;
}

/**
 * Parse un fichier de sauvegarde (après lecture)
 * @param {string} raw - Contenu JSON brut
 * @returns {{ ok: boolean, backup?: object, error?: string }}
 */
export function parseBackupFile(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") {
      return { ok: false, error: "Fichier invalide." };
    }
    if (!Array.isArray(data.activities)) {
      return { ok: false, error: "Format de sauvegarde invalide (activities manquant)." };
    }
    return { ok: true, backup: data };
  } catch (e) {
    return { ok: false, error: e.message || "Fichier JSON invalide." };
  }
}

/**
 * Restaure les activités depuis un objet backup
 * @param {Object} backup - Objet retourné par parseBackupFile
 * @param {"replace"|"merge"} mode - replace = remplacer tout, merge = ajouter les manquantes
 * @param {Array} currentActivities - Activités actuelles (pour merge)
 * @returns {Array} Nouvelle liste d'activités
 */
export function restoreFromBackup(backup, mode, currentActivities = []) {
  const list = backup.activities || [];
  if (mode === "replace") {
    return list;
  }
  // merge : garder les actuelles, ajouter celles du backup qui n'existent pas (par id ou name+category)
  const byKey = new Map();
  currentActivities.forEach((a) => {
    byKey.set(a.id, a);
    if (a.supabase_id) byKey.set(`sb_${a.supabase_id}`, a);
    byKey.set(`${(a.name || "").toLowerCase()}_${a.category || "desert"}`, a);
  });
  const merged = [...currentActivities];
  list.forEach((a) => {
    const key = `${(a.name || "").toLowerCase()}_${a.category || "desert"}`;
    if (!byKey.has(a.id) && !byKey.has(`sb_${a.supabase_id}`) && !byKey.has(key)) {
      merged.push(a);
      byKey.set(a.id, a);
      if (a.supabase_id) byKey.set(`sb_${a.supabase_id}`, a);
      byKey.set(key, a);
    }
  });
  return merged;
}

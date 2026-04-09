/**
 * Sauvegarde et restauration de toutes les activités
 * Format JSON avec métadonnées pour éviter les pertes de données
 */

export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME_PREFIX = "hd_activities_backup";

const DEFAULT_CATEGORY = "desert";

/**
 * Normalise le nom comme la détection de doublons sur la page Activités (casse, espaces, accents).
 */
export function normalizeActivityNameForDedupe(name) {
  const s = String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  try {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    return s;
  }
}

/** Clé stable pour fusionner les doublons : nom normalisé + catégorie */
export function activityDedupeKey(activity) {
  const cat = activity.category || DEFAULT_CATEGORY;
  return `${normalizeActivityNameForDedupe(activity.name)}|${cat}`;
}

function scoreActivityForDedupe(a) {
  let s = 0;
  if (a.supabase_id != null && a.supabase_id !== "") {
    s += 1_000_000;
    const n = Number(a.supabase_id);
    if (Number.isFinite(n)) s += n / 1e12;
  }
  s += String(a.name || "").length;
  return s;
}

function pickBetterActivity(a, b) {
  const sa = scoreActivityForDedupe(a);
  const sb = scoreActivityForDedupe(b);
  if (sa !== sb) return sa > sb ? a : b;
  return a;
}

/**
 * Supprime les doublons (même nom normalisé + même catégorie).
 * En cas de doublon, garde la ligne la plus utile (souvent celle avec supabase_id).
 * @returns {{ activities: Array, removed: number }}
 */
export function dedupeActivities(activities) {
  if (!Array.isArray(activities) || activities.length === 0) {
    return { activities: activities || [], removed: 0 };
  }

  const keys = [];
  const best = new Map();

  for (const a of activities) {
    const k = activityDedupeKey(a);
    if (!best.has(k)) {
      keys.push(k);
      best.set(k, a);
    } else {
      best.set(k, pickBetterActivity(best.get(k), a));
    }
  }

  const out = keys.map((k) => best.get(k));

  // Deuxième passe : même supabase_id sur deux lignes (restauration bizarre)
  const seenSb = new Set();
  const out2 = [];
  for (const a of out) {
    const sid = a.supabase_id;
    if (sid != null && sid !== "") {
      if (seenSb.has(sid)) continue;
      seenSb.add(sid);
    }
    out2.push(a);
  }

  const removed = activities.length - out2.length;
  return { activities: out2, removed };
}

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
 * Restaure les activités depuis un objet backup (avec déduplication automatique).
 * @param {Object} backup - Objet retourné par parseBackupFile
 * @param {"replace"|"merge"} mode - replace = remplacer tout, merge = ajouter les manquantes
 * @param {Array} currentActivities - Activités actuelles (pour merge)
 * @returns {{ activities: Array, duplicatesRemoved: number }}
 */
export function restoreFromBackup(backup, mode, currentActivities = []) {
  const list = backup.activities || [];
  let raw;
  if (mode === "replace") {
    raw = list;
  } else {
    // merge : garder les actuelles, ajouter celles du backup qui n'existent pas (par id ou name+category)
    const byKey = new Map();
    currentActivities.forEach((a) => {
      byKey.set(a.id, a);
      if (a.supabase_id) byKey.set(`sb_${a.supabase_id}`, a);
      byKey.set(activityDedupeKey(a), a);
    });
    const merged = [...currentActivities];
    list.forEach((a) => {
      const key = activityDedupeKey(a);
      if (!byKey.has(a.id) && !byKey.has(`sb_${a.supabase_id}`) && !byKey.has(key)) {
        merged.push(a);
        byKey.set(a.id, a);
        if (a.supabase_id) byKey.set(`sb_${a.supabase_id}`, a);
        byKey.set(key, a);
      }
    });
    raw = merged;
  }
  const { activities, removed } = dedupeActivities(raw);
  return { activities, duplicatesRemoved: removed };
}

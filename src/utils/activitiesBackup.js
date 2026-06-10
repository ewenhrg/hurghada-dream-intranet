/**
 * Sauvegarde et restauration de toutes les activités
 * Format JSON avec métadonnées pour éviter les pertes de données
 */

import { LS_KEYS } from "../constants.js";

export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME_PREFIX = "hd_activities_backup";
export const CATALOG_BACKUP_FILENAME_PREFIX = "hd_catalog_backup";

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

/** Comme la page Utilisateurs : activité présente dans le cache mais pas (ou plus) alignée sur Supabase. */
export const LOCAL_ONLY_ACTIVITY_KEY = "_localOnly";

export function stripLocalOnlyActivityForStorage(list) {
  return (list || []).map((a) => {
    if (!a?.[LOCAL_ONLY_ACTIVITY_KEY]) return a;
    const { [LOCAL_ONLY_ACTIVITY_KEY]: _, ...rest } = a;
    return rest;
  });
}

/**
 * Sauvegarde automatique du cache activités avant une sync Supabase.
 * @param {Array} activities
 * @param {string} siteKey
 */
export function saveActivitiesAutoSnapshot(activities, siteKey) {
  try {
    const list = Array.isArray(activities) ? activities : [];
    if (list.length === 0) return;
    const payload = {
      version: BACKUP_VERSION,
      savedAt: new Date().toISOString(),
      site_key: siteKey,
      count: list.length,
      activities: stripLocalOnlyActivityForStorage(list),
    };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LS_KEYS.activitiesAutoSnapshot, JSON.stringify(payload));
    }
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Fusionne Supabase → cache local sans supprimer d'activités.
 * Les lignes absentes de la réponse remote sont conservées (marquées _localOnly si elles avaient un supabase_id).
 * @param {Array} cachedActivities
 * @param {Array} remoteMapped — activités déjà mappées depuis Supabase
 * @returns {{ merged: Array, stats: object }}
 */
export function mergeRemoteActivitiesWithLocal(cachedActivities, remoteMapped) {
  const prev = Array.isArray(cachedActivities) ? cachedActivities : [];
  const remote = Array.isArray(remoteMapped) ? remoteMapped : [];

  const remoteById = new Map();
  for (const a of remote) {
    if (a?.supabase_id != null && a.supabase_id !== "") {
      remoteById.set(String(a.supabase_id), a);
    }
  }

  const seenRemoteIds = new Set();
  const merged = [];
  let updated = 0;
  let preservedOrphans = 0;
  let orphansMarkedLocalOnly = 0;

  for (const local of prev) {
    if (!local) continue;
    const rid =
      local.supabase_id != null && local.supabase_id !== "" ? String(local.supabase_id) : null;

    if (rid && remoteById.has(rid)) {
      const remoteAct = remoteById.get(rid);
      seenRemoteIds.add(rid);
      const { [LOCAL_ONLY_ACTIVITY_KEY]: _lo, ...restLocal } = local;
      merged.push({
        ...restLocal,
        ...remoteAct,
        id: local.id,
        supabase_id: remoteAct.supabase_id ?? local.supabase_id,
      });
      updated++;
    } else if (rid && !remoteById.has(rid)) {
      preservedOrphans++;
      const { [LOCAL_ONLY_ACTIVITY_KEY]: _lo, ...rest } = local;
      merged.push({ ...rest, [LOCAL_ONLY_ACTIVITY_KEY]: true });
      orphansMarkedLocalOnly++;
    } else {
      merged.push(local);
    }
  }

  let addedFromRemote = 0;
  const mergedRemoteIds = new Set(
    merged
      .map((a) => (a?.supabase_id != null && a.supabase_id !== "" ? String(a.supabase_id) : null))
      .filter(Boolean)
  );
  const seenKeys = new Set(merged.map((a) => activityDedupeKey(a)));

  for (const remoteAct of remote) {
    const rid =
      remoteAct?.supabase_id != null && remoteAct.supabase_id !== ""
        ? String(remoteAct.supabase_id)
        : null;
    if (rid && (seenRemoteIds.has(rid) || mergedRemoteIds.has(rid))) continue;
    const k = activityDedupeKey(remoteAct);
    if (seenKeys.has(k)) continue;
    merged.push(remoteAct);
    seenKeys.add(k);
    if (rid) mergedRemoteIds.add(rid);
    addedFromRemote++;
  }

  return {
    merged,
    stats: {
      remoteCount: remote.length,
      localCount: prev.length,
      mergedCount: merged.length,
      updated,
      addedFromRemote,
      preservedOrphans,
      orphansMarkedLocalOnly,
    },
  };
}

export function loadActivitiesAutoSnapshot() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LS_KEYS.activitiesAutoSnapshot);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.activities) || data.activities.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Fusionne quand Supabase renvoie moins de lignes que le cache (perte / suppression massive).
 * @param {Array} remoteRows — lignes brutes Supabase
 * @param {Array} cachedActivities — cache local (hd_activities)
 * @param {(row: object) => object} mapRowToActivity — même mapping que App (mapActivitiesFromRows)
 */
export function mergeActivitiesWhenRemoteShrunk(remoteRows, cachedActivities, mapRowToActivity) {
  const remote = Array.isArray(remoteRows) ? remoteRows : [];
  const prev = Array.isArray(cachedActivities) ? cachedActivities : [];
  const remoteMapped = remote.map((row) => mapRowToActivity(row));
  if (prev.length === 0 || remote.length >= prev.length) {
    return { merged: remoteMapped, localOnlyAdded: 0, usedMerge: false };
  }
  const remoteIds = new Set(remote.map((r) => String(r.id)));
  const merged = [...remoteMapped];
  const seenKeys = new Set(remoteMapped.map((a) => activityDedupeKey(a)));
  let localOnlyAdded = 0;
  for (const a of prev) {
    const rid = a.supabase_id != null && a.supabase_id !== "" ? String(a.supabase_id) : null;
    if (rid && remoteIds.has(rid)) {
      continue;
    }
    const { [LOCAL_ONLY_ACTIVITY_KEY]: _drop, ...rest } = a;
    const base = { ...rest, supabase_id: undefined, [LOCAL_ONLY_ACTIVITY_KEY]: true };
    const k = activityDedupeKey(base);
    if (seenKeys.has(k)) continue;
    merged.push(base);
    seenKeys.add(k);
    localOnlyAdded++;
  }
  return { merged, localOnlyAdded, usedMerge: localOnlyAdded > 0 };
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

export function getCatalogBackupFilename() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5).replace(":", "h");
  return `${CATALOG_BACKUP_FILENAME_PREFIX}_${date}_${time}.json`;
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
      catalogImageUrls: Array.isArray(a.catalogImageUrls) ? a.catalogImageUrls : [],
      transfers: a.transfers,
      popular: a.popular === true,
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
 * Sauvegarde dédiée au catalogue public (description + photos).
 * @param {Array} activities
 * @param {string} siteKey
 */
export function createCatalogBackup(activities, siteKey) {
  const exportedAt = new Date().toISOString();
  const normalized = Array.isArray(activities) ? activities : [];
  return {
    version: BACKUP_VERSION,
    kind: "catalog_public_content",
    exportedAt,
    site_key: siteKey,
    count: normalized.length,
    activities: normalized.map((a) => ({
      id: a.id,
      supabase_id: a.supabase_id,
      name: a.name,
      category: a.category,
      description: a.description != null ? String(a.description) : "",
      catalogImageUrls: Array.isArray(a.catalogImageUrls) ? a.catalogImageUrls : [],
      popular: a.popular === true,
    })),
  };
}

/**
 * Télécharge un export dédié au catalogue public.
 * @param {Array} activities
 * @param {string} siteKey
 */
export function downloadCatalogBackup(activities, siteKey) {
  const backup = createCatalogBackup(activities, siteKey);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = getCatalogBackupFilename();
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

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { LS_KEYS, CATEGORIES } from "../constants";
import { saveLS, loadLS } from "../utils";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import { downloadCatalogBackup, parseBackupFile, getCatalogBackupFilename } from "../utils/activitiesBackup";
import {
  MAX_CATALOG_IMAGES,
  isAllowedCatalogImageUrl,
  normalizeCatalogImageUrlsFromDb,
} from "../utils/catalogContent";
import { canAccessHotelsPage } from "../constants/permissions.js";

// Bucket principal aligné avec la config Supabase actuelle du projet.
const CATALOG_IMAGES_BUCKET = "documents";
// Fallback historique éventuel (certains projets utilisent un bucket "Catalogue").
const CATALOG_IMAGES_FALLBACK_BUCKET = "Catalogue";
const MAX_CATALOG_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_CATALOG_IMAGE_SIZE_MB = 10;

function canEditCatalog(user) {
  return canAccessHotelsPage(user);
}

function categoryLabel(key) {
  const k = key || "desert";
  return CATEGORIES.find((c) => c.key === k)?.label || k;
}

function groupActivitiesByCategory(list) {
  const map = new Map();
  for (const a of list || []) {
    if (!a) continue;
    const cat = a.category || "desert";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(a);
  }
  for (const arr of map.values()) {
    arr.sort((x, y) => String(x.name || "").localeCompare(String(y.name || ""), "fr", { sensitivity: "base" }));
  }
  const orderedKeys = [];
  for (const c of CATEGORIES) {
    if (map.has(c.key) && map.get(c.key).length) orderedKeys.push(c.key);
  }
  const rest = [...map.keys()]
    .filter((k) => !orderedKeys.includes(k))
    .sort((a, b) => String(a).localeCompare(String(b)));
  for (const k of rest) {
    if (map.get(k).length) orderedKeys.push(k);
  }
  return orderedKeys.map((key) => ({ key, label: categoryLabel(key), items: map.get(key) }));
}

function normalizeNameForMatch(name) {
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

function catalogItemKey(activity) {
  return `${normalizeNameForMatch(activity?.name)}|${activity?.category || "desert"}`;
}

function createCatalogPatchMapFromBackup(backupActivities) {
  const bySupabaseId = new Map();
  const byNameCategory = new Map();
  for (const row of backupActivities || []) {
    if (!row) continue;
    const description = row.description != null ? String(row.description) : "";
    const catalogImageUrls = normalizeCatalogImageUrlsFromDb(row.catalogImageUrls ?? row.catalog_image_urls);
    const patch = { description, catalogImageUrls };
    if (row.supabase_id != null && String(row.supabase_id).trim() !== "") {
      bySupabaseId.set(String(row.supabase_id), patch);
    }
    byNameCategory.set(catalogItemKey(row), patch);
  }
  return { bySupabaseId, byNameCategory };
}

function applyCatalogBackupToActivities(currentActivities, backupActivities) {
  const { bySupabaseId, byNameCategory } = createCatalogPatchMapFromBackup(backupActivities);
  let patchedCount = 0;
  const next = (currentActivities || []).map((activity) => {
    let patch = null;
    if (activity?.supabase_id != null && String(activity.supabase_id).trim() !== "") {
      patch = bySupabaseId.get(String(activity.supabase_id)) || null;
    }
    if (!patch) {
      patch = byNameCategory.get(catalogItemKey(activity)) || null;
    }
    if (!patch) return activity;
    patchedCount += 1;
    return { ...activity, ...patch };
  });
  return { next, patchedCount };
}

async function persistCatalogRow(activity) {
  if (!__SUPABASE_DEBUG__.isConfigured || !supabase) {
    toast.error("Supabase non disponible.");
    return false;
  }
  if (!activity?.supabase_id) {
    toast.error("Cette activité n’est pas liée à Supabase (pas d’enregistrement distant).");
    return false;
  }
  const urls = normalizeCatalogImageUrlsFromDb(activity.catalogImageUrls);
  const payload = {
    description: activity.description != null ? String(activity.description) : "",
    catalog_image_urls: urls,
  };
  const { error } = await supabase.from("activities").update(payload).eq("id", activity.supabase_id);
  if (error) {
    logger.error("ActivityCatalogAdminPage : erreur Supabase", error);
    toast.error(error.message || "Erreur lors de l’enregistrement.");
    return false;
  }
  toast.success(`Catalogue enregistré : ${activity.name}`, 2200);
  return true;
}

function reorderUrlRows(prev, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) {
    return prev;
  }
  const next = [...prev];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function CatalogActivityEditor({ activity, canEdit, patchActivity }) {
  const [desc, setDesc] = useState(() => String(activity.description ?? ""));
  const [urlRows, setUrlRows] = useState(() => {
    const u = normalizeCatalogImageUrlsFromDb(activity.catalogImageUrls);
    return u.length ? u : [""];
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => {
    setDesc(String(activity.description ?? ""));
    const u = normalizeCatalogImageUrlsFromDb(activity.catalogImageUrls);
    setUrlRows(u.length ? u : [""]);
  }, [activity.id, activity.description, activity.catalogImageUrls]);

  const normalizedUrls = useMemo(
    () => urlRows.map((s) => String(s).trim()).filter(isAllowedCatalogImageUrl).slice(0, MAX_CATALOG_IMAGES),
    [urlRows]
  );

  const applyLocalPatch = useCallback(() => {
    patchActivity(activity.id, {
      description: desc,
      catalogImageUrls: normalizedUrls,
    });
  }, [activity.id, desc, normalizedUrls, patchActivity]);

  async function handleSave() {
    if (!canEdit) return;
    const urls = normalizedUrls;
    setSaving(true);
    try {
      const next = {
        ...activity,
        description: desc,
        catalogImageUrls: urls,
      };
      const ok = await persistCatalogRow(next);
      if (ok) applyLocalPatch();
    } finally {
      setSaving(false);
    }
  }

  function addUrlRow() {
    setUrlRows((prev) => {
      if (prev.length >= MAX_CATALOG_IMAGES) return prev;
      return [...prev, ""];
    });
  }

  function setUrlAt(index, value) {
    setUrlRows((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function removeUrlAt(index) {
    setUrlRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [""];
    });
  }

  const validImageSlotCount = urlRows.filter((r) => {
    const t = String(r || "").trim();
    return t && isAllowedCatalogImageUrl(t);
  }).length;
  const canReorderUrls = Boolean(canEdit && activity.supabase_id && validImageSlotCount > 1);

  function handleUrlRowDragStart(e, index) {
    if (!canReorderUrls) return;
    setDragIndex(index);
    setDragOverIndex(null);
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    } catch {
      /* ignore */
    }
    try {
      if (e.dataTransfer.setDragImage && e.currentTarget instanceof HTMLElement) {
        const img = e.currentTarget.querySelector("img");
        if (img && img.complete && img.naturalWidth > 0) {
          e.dataTransfer.setDragImage(img, Math.min(48, img.naturalWidth / 2), Math.min(48, img.naturalHeight / 2));
        }
      }
    } catch {
      /* setDragImage peut échouer (CORS) — le glisser-déposer reste actif */
    }
  }

  function handleUrlRowDragOver(e, index) {
    if (!canReorderUrls || dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) setDragOverIndex(index);
  }

  function handleUrlRowDrop(e, index) {
    if (!canReorderUrls || dragIndex === null) return;
    e.preventDefault();
    const from = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    if (from === index) return;
    setUrlRows((prev) => reorderUrlRows(prev, from, index));
  }

  function handleUrlRowDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  async function handleUploadFiles(event) {
    const fileList = Array.from(event.target.files || []);
    event.target.value = "";
    if (!fileList.length) return;
    if (!canEdit || !activity.supabase_id) return;
    if (!__SUPABASE_DEBUG__.isConfigured || !supabase) {
      toast.error("Supabase Storage non disponible.");
      return;
    }
    const remainingSlots = Math.max(0, MAX_CATALOG_IMAGES - normalizedUrls.length);
    if (remainingSlots <= 0) {
      toast.warning(`Maximum atteint (${MAX_CATALOG_IMAGES} images).`);
      return;
    }
    const filesToUpload = fileList.slice(0, remainingSlots);
    const skipped = fileList.length - filesToUpload.length;
    if (skipped > 0) {
      toast.warning(`${skipped} fichier(s) ignoré(s) : limite de ${MAX_CATALOG_IMAGES} images.`);
    }

    setUploading(true);
    try {
      const uploadedUrls = [];
      for (const file of filesToUpload) {
        if (!file.type || !file.type.startsWith("image/")) {
          toast.warning(`${file.name} ignoré : ce n’est pas une image.`);
          continue;
        }
        if (file.size > MAX_CATALOG_IMAGE_SIZE_BYTES) {
          toast.warning(`${file.name} ignoré : max ${MAX_CATALOG_IMAGE_SIZE_MB} Mo.`);
          continue;
        }

        const safeName = String(file.name || "image")
          .replace(/[^\w.\-]+/g, "_")
          .replace(/_+/g, "_");
        const objectPath = `activities/${activity.supabase_id}/${Date.now()}_${safeName}`;
        let usedBucket = CATALOG_IMAGES_BUCKET;
        let { error: uploadError } = await supabase.storage
          .from(usedBucket)
          .upload(objectPath, file, { upsert: false, contentType: file.type });

        if (
          uploadError &&
          (() => {
            const msg = String(uploadError.message || "").toLowerCase();
            return msg.includes("bucket not found") || msg.includes("not found") || msg.includes("does not exist");
          })()
        ) {
          usedBucket = CATALOG_IMAGES_FALLBACK_BUCKET;
          const fallbackTry = await supabase.storage
            .from(usedBucket)
            .upload(objectPath, file, { upsert: false, contentType: file.type });
          uploadError = fallbackTry.error || null;
          if (!uploadError) {
            toast.warning(
              `Bucket "${CATALOG_IMAGES_BUCKET}" absent, upload effectué dans "${CATALOG_IMAGES_FALLBACK_BUCKET}".`,
              5000
            );
          }
        }

        if (uploadError) {
          logger.error("ActivityCatalogAdminPage : erreur upload image", uploadError);
          const msg = uploadError.message?.includes("Bucket not found")
            ? `Buckets Storage introuvables : ${CATALOG_IMAGES_BUCKET} et ${CATALOG_IMAGES_FALLBACK_BUCKET}.`
            : uploadError.message || "Erreur lors de l'upload d'image.";
          toast.error(msg);
          continue;
        }

        const { data: urlData } = supabase.storage.from(usedBucket).getPublicUrl(objectPath);
        const publicUrl = String(urlData?.publicUrl || "").trim();
        if (isAllowedCatalogImageUrl(publicUrl)) {
          uploadedUrls.push(publicUrl);
        }
      }

      if (uploadedUrls.length > 0) {
        setUrlRows((prev) => {
          const base = prev.map((v) => String(v || ""));
          return [...base, ...uploadedUrls].slice(0, MAX_CATALOG_IMAGES);
        });
        toast.success(`${uploadedUrls.length} image(s) ajoutée(s). Cliquez sur « Enregistrer » pour publier.`);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-slate-900">{activity.name}</h4>
          {!activity.supabase_id ? (
            <p className="mt-1 text-xs font-medium text-amber-700">Non synchronisée avec Supabase — édition impossible.</p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={!canEdit || !activity.supabase_id || saving}
          onClick={() => void handleSave()}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Texte public (fiche catalogue)
          </label>
          <p className="mb-2 text-xs text-slate-600">
            Affiché sur la page publique de l’activité. Si vide, le texte est dérivé des notes (hors lignes « - » points forts).
          </p>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            disabled={!canEdit || !activity.supabase_id}
            rows={5}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
            placeholder="Décrivez l’expérience pour les clients…"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Photos du catalogue public
          </label>
          <p className="mb-2 text-xs text-slate-600">
            Importez des images ou collez des liens HTTPS (max {MAX_CATALOG_IMAGES}, {MAX_CATALOG_IMAGE_SIZE_MB} Mo/image).{" "}
            <span className="font-medium text-slate-800">
              Glissez-déposez une vignette sur une autre
            </span>{" "}
            pour changer l’ordre affiché sur le catalogue.
          </p>
          <div className="mb-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void handleUploadFiles(e)}
                disabled={!canEdit || !activity.supabase_id || uploading || normalizedUrls.length >= MAX_CATALOG_IMAGES}
                className="hidden"
              />
              <span>{uploading ? "Upload en cours…" : "Ajouter des images depuis l’ordinateur"}</span>
            </label>
          </div>
          <ul
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setDragOverIndex(null);
              }
            }}
          >
            {urlRows.map((row, index) => {
              const trimmed = String(row || "").trim();
              const thumbOk = trimmed && isAllowedCatalogImageUrl(trimmed);
              const isDragging = dragIndex === index;
              const isOver = dragOverIndex === index && dragIndex !== null && dragIndex !== index;
              const canDragThisTile = canReorderUrls && thumbOk;
              return (
                <li
                  key={`url-${activity.id}-${index}`}
                  onDragOver={(e) => handleUrlRowDragOver(e, index)}
                  onDrop={(e) => handleUrlRowDrop(e, index)}
                  className={`flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-[box-shadow,transform,opacity] ${
                    isDragging ? "scale-[0.98] opacity-60 ring-2 ring-emerald-500/40" : ""
                  } ${isOver ? "ring-2 ring-emerald-500 ring-offset-1" : "border-slate-200"}`}
                >
                  {thumbOk ? (
                    <div
                      aria-grabbed={canDragThisTile && isDragging ? "true" : undefined}
                      aria-label={canDragThisTile ? "Photo — glisser pour réordonner" : "Photo catalogue"}
                      draggable={canDragThisTile}
                      onDragStart={(e) => handleUrlRowDragStart(e, index)}
                      onDragEnd={handleUrlRowDragEnd}
                      className={`relative h-20 w-full shrink-0 overflow-hidden bg-slate-100 outline-none sm:h-24 ${
                        canDragThisTile ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                      }`}
                    >
                      <img src={trimmed} alt="" className="h-full w-full object-cover" draggable={false} />
                      {canDragThisTile ? (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 pb-1 pt-5">
                          <span className="text-[9px] font-semibold leading-tight text-white drop-shadow-sm sm:text-[10px]">
                            Glisser
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      className="flex h-20 w-full flex-col items-center justify-center gap-0.5 border-b border-dashed border-slate-200 bg-slate-50 px-2 text-center sm:h-24"
                      draggable={false}
                    >
                      <span className="text-[10px] font-medium text-slate-500 sm:text-xs">Vide</span>
                      <span className="hidden text-[9px] text-slate-400 sm:block">URL ou import</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 p-2">
                    <input
                      type="url"
                      value={row}
                      onChange={(e) => setUrlAt(index, e.target.value)}
                      disabled={!canEdit || !activity.supabase_id}
                      placeholder="https://…"
                      draggable={false}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                      autoComplete="off"
                    />
                    {row.trim() && !isAllowedCatalogImageUrl(row) ? (
                      <span className="text-xs font-medium text-amber-700">HTTPS requis</span>
                    ) : null}
                    <button
                      type="button"
                      disabled={!canEdit || !activity.supabase_id}
                      onClick={() => removeUrlAt(index)}
                      draggable={false}
                      className="self-start rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Retirer cette photo
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={!canEdit || !activity.supabase_id || urlRows.length >= MAX_CATALOG_IMAGES}
            onClick={addUrlRow}
            className="mt-3 text-sm font-medium text-emerald-700 hover:underline disabled:opacity-40"
          >
            + Ajouter un emplacement (URL)
          </button>
        </div>
      </div>
    </article>
  );
}

export function ActivityCatalogAdminPage({ activities, setActivities, user, readOnly = false }) {
  const hasEditPermission = canEditCatalog(user);
  /** Édition réelle : permission + pas de mode lecture seule (ex. compte Léa sur ce catalogue). */
  const canMutate = hasEditPermission && !readOnly;
  const [search, setSearch] = useState("");
  const [restoringBuiltin, setRestoringBuiltin] = useState(false);

  const filteredActivities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activities || [];
    return (activities || []).filter((a) => {
      const name = (a.name || "").toLowerCase();
      const desc = String(a.description || "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [activities, search]);

  const grouped = useMemo(() => groupActivitiesByCategory(filteredActivities), [filteredActivities]);

  const patchActivity = useCallback(
    (id, patch) => {
      setActivities((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, ...patch } : a));
        saveLS(LS_KEYS.activities, next);
        return next;
      });
    },
    [setActivities]
  );

  const persistCatalogRows = useCallback(async (rows) => {
    if (!rows?.length) return { saved: 0, failed: 0 };
    let saved = 0;
    let failed = 0;
    for (const row of rows) {
      const ok = await persistCatalogRow(row);
      if (ok) saved += 1;
      else failed += 1;
    }
    return { saved, failed };
  }, []);

  const handleBackupAllCatalog = useCallback(() => {
    const list = loadLS(LS_KEYS.activities, activities || []);
    if (!list.length) {
      toast.warning("Aucune activité à sauvegarder.");
      return;
    }
    try {
      const backup = downloadCatalogBackup(list, "catalog-content");
      toast.success(`✅ Sauvegarde catalogue public créée (${backup.count} activité(s)) : ${getCatalogBackupFilename()}`);
    } catch (error) {
      logger.error("ActivityCatalogAdminPage backup:", error);
      toast.error("Erreur lors de la sauvegarde du catalogue.");
    }
  }, [activities]);

  const applyCatalogBackupRaw = useCallback(
    async (rawText, sourceLabel) => {
      const parsed = parseBackupFile(rawText);
      if (!parsed.ok || !parsed.backup) {
        toast.error(`Sauvegarde invalide: ${parsed.error || "format non reconnu"}`);
        return;
      }
      const backupActivities = Array.isArray(parsed.backup.activities) ? parsed.backup.activities : [];
      if (!backupActivities.length) {
        toast.warning("La sauvegarde ne contient aucune activité.");
        return;
      }
      const { next, patchedCount } = applyCatalogBackupToActivities(activities || [], backupActivities);
      if (patchedCount === 0) {
        toast.warning("Aucune activité correspondante trouvée (id Supabase ou nom + catégorie).");
        return;
      }
      setActivities(next);
      saveLS(LS_KEYS.activities, next);

      if (canMutate) {
        const touched = next.filter((a, i) => {
          const prev = activities?.[i];
          if (!prev) return false;
          return prev.description !== a.description || JSON.stringify(prev.catalogImageUrls || []) !== JSON.stringify(a.catalogImageUrls || []);
        });
        const syncables = touched.filter((a) => a.supabase_id);
        if (syncables.length > 0) {
          const { saved, failed } = await persistCatalogRows(syncables);
          if (failed > 0) {
            toast.warning(`Restauration ${sourceLabel}: ${patchedCount} locale(s), ${saved} synchronisée(s), ${failed} en échec Supabase.`);
            return;
          }
        }
      }
      toast.success(`✅ Restauration ${sourceLabel} terminée : ${patchedCount} activité(s) mises à jour.`);
    },
    [activities, canMutate, persistCatalogRows, setActivities]
  );

  const handleRestoreFromFile = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        void applyCatalogBackupRaw(String(reader.result || ""), "depuis fichier");
      };
      reader.onerror = () => toast.error("Impossible de lire le fichier.");
      reader.readAsText(file, "UTF-8");
    },
    [applyCatalogBackupRaw]
  );

  const handleRestoreBuiltinBackup = useCallback(async () => {
    setRestoringBuiltin(true);
    try {
      const candidatePaths = ["/hd_catalog_restore.json", "/hd_activities_restore.json"];
      let raw = null;
      let loadedFrom = "";
      for (const path of candidatePaths) {
        const response = await fetch(path);
        if (!response.ok) continue;
        raw = await response.text();
        loadedFrom = path;
        break;
      }
      if (!raw) {
        throw new Error("Fichier de sauvegarde inclus introuvable.");
      }
      await applyCatalogBackupRaw(raw, "incluse");
      toast.success(`Sauvegarde incluse chargée depuis ${loadedFrom}`);
    } catch (error) {
      logger.error("ActivityCatalogAdminPage restore builtin:", error);
      toast.error("Impossible de restaurer la sauvegarde incluse. Placez le fichier dans public/hd_catalog_restore.json.");
    } finally {
      setRestoringBuiltin(false);
    }
  }, [applyCatalogBackupRaw]);

  if (!activities?.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-600">
        Aucune activité. Synchronisez ou ajoutez des activités depuis l’onglet Activités.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
        <p className="font-semibold text-slate-900">Sécurité</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-slate-700">
          {readOnly ? (
            <li>
              Affichage réservé à la consultation : aucune saisie, aucun bouton d’action ni enregistrement n’est disponible sur cette page pour
              votre compte.
            </li>
          ) : (
            <li>Cet onglet n’est visible que si votre compte a la permission « Modifier des activités » (défini dans Utilisateurs).</li>
          )}
          {!readOnly && (
            <>
              <li>Les modifications sont enregistrées dans Supabase ; gardez votre code à 6 chiffres confidentiel.</li>
              <li>Seules les URLs en <strong>https://</strong> sont acceptées pour les images (pas de fichier piégé en data:).</li>
              <li>
                Pour une protection maximale côté base, limitez les politiques RLS sur <code className="rounded bg-white px-1">activities</code> (ex.
                lecture publique, écriture réservée via Edge Function ou clé serveur) — contactez votre admin Supabase si besoin.
              </li>
            </>
          )}
        </ul>
      </div>

      {readOnly && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <strong>Lecture seule.</strong> Vous pouvez parcourir le contenu du catalogue public tel qu’il sera affiché aux clients ; les modifications
          passent par un compte autorisé (ex. Ewen).
        </div>
      )}

      {!readOnly && !hasEditPermission && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Lecture seule : vous n’avez pas la permission de modifier le contenu catalogue.
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="catalog-admin-search" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Rechercher
          </label>
          <input
            id="catalog-admin-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={readOnly}
            readOnly={readOnly}
            placeholder="Nom ou texte dans la description…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-600 disabled:opacity-90"
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          onClick={() => setSearch("")}
          disabled={readOnly || !search.trim()}
          className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
        >
          Effacer
        </button>
        {!readOnly && (
          <>
            <button
              type="button"
              disabled={!canMutate}
              onClick={handleBackupAllCatalog}
              className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sauvegarder tout le catalogue
            </button>
            <label className="inline-flex shrink-0 cursor-pointer items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
              Restaurer un fichier
              <input type="file" accept=".json,application/json" className="hidden" onChange={handleRestoreFromFile} />
            </label>
            <button
              type="button"
              disabled={!canMutate || restoringBuiltin}
              onClick={() => void handleRestoreBuiltinBackup()}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {restoringBuiltin ? "Restauration..." : "Restaurer la sauvegarde incluse"}
            </button>
          </>
        )}
      </div>

      {search.trim() && filteredActivities.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 py-6 text-center text-sm text-slate-600">
          Aucune activité ne correspond à « {search.trim()} ».
        </p>
      ) : null}

      {grouped.map(({ key, label, items }) => (
        <section key={key} className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-slate-50 px-4 py-3">
            <h3 className="text-base font-semibold text-slate-900">{label}</h3>
            <p className="text-xs text-slate-500">
              {items.length} activité{items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="space-y-4 p-4">
            {items.map((a) => (
              <CatalogActivityEditor key={a.id} activity={a} canEdit={canMutate} patchActivity={patchActivity} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

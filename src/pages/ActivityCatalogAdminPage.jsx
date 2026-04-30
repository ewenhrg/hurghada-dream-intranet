import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { LS_KEYS, CATEGORIES } from "../constants";
import { saveLS } from "../utils";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import {
  MAX_CATALOG_IMAGES,
  isAllowedCatalogImageUrl,
  normalizeCatalogImageUrlsFromDb,
} from "../utils/catalogContent";

const CATALOG_IMAGES_BUCKET = "catalog-images";
const CATALOG_IMAGES_FALLBACK_BUCKET = "documents";
const MAX_CATALOG_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_CATALOG_IMAGE_SIZE_MB = 10;

function canEditCatalog(user) {
  if (!user) return false;
  return user.canEditActivity === true;
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

function CatalogActivityEditor({ activity, canEdit, patchActivity }) {
  const [desc, setDesc] = useState(() => String(activity.description ?? ""));
  const [urlRows, setUrlRows] = useState(() => {
    const u = normalizeCatalogImageUrlsFromDb(activity.catalogImageUrls);
    return u.length ? u : [""];
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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

        if (uploadError && String(uploadError.message || "").toLowerCase().includes("bucket not found")) {
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
            Photos (URLs HTTPS)
          </label>
          <p className="mb-2 text-xs text-slate-600">
            Collez des liens directs (HTTPS) ou importez des fichiers image (max {MAX_CATALOG_IMAGES}, {MAX_CATALOG_IMAGE_SIZE_MB} Mo/image).
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
          <ul className="space-y-2">
            {urlRows.map((row, index) => (
              <li key={`url-${activity.id}-${index}`} className="flex flex-wrap items-center gap-2">
                <input
                  type="url"
                  value={row}
                  onChange={(e) => setUrlAt(index, e.target.value)}
                  disabled={!canEdit || !activity.supabase_id}
                  placeholder="https://…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                  autoComplete="off"
                />
                {row.trim() && !isAllowedCatalogImageUrl(row) ? (
                  <span className="text-xs font-medium text-amber-700">HTTPS requis</span>
                ) : null}
                <button
                  type="button"
                  disabled={!canEdit || !activity.supabase_id}
                  onClick={() => removeUrlAt(index)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!canEdit || !activity.supabase_id || urlRows.length >= MAX_CATALOG_IMAGES}
            onClick={addUrlRow}
            className="mt-2 text-sm font-medium text-emerald-700 hover:underline disabled:opacity-40"
          >
            + Ajouter une URL
          </button>
        </div>

        {normalizedUrls.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500">Aperçu</p>
            <div className="flex flex-wrap gap-2">
              {normalizedUrls.map((u) => (
                <div
                  key={u}
                  className="h-20 w-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                >
                  <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ActivityCatalogAdminPage({ activities, setActivities, user, readOnly = false }) {
  const hasEditPermission = canEditCatalog(user);
  /** Édition réelle : permission + pas de mode lecture seule (ex. compte Léa sur ce catalogue). */
  const canMutate = hasEditPermission && !readOnly;
  const [search, setSearch] = useState("");

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

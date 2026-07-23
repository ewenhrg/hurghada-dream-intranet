import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  ImagePlus,
  Loader2,
  MapPin,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { GhostBtn, PrimaryBtn, TextInput } from "../components/ui";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import {
  MAX_CATALOG_IMAGES,
  isAllowedCatalogImageUrl,
  normalizeCatalogImageUrlsFromDb,
} from "../utils/catalogContent";
import { AMENITY_META } from "../components/public/hotelAmenities";
import {
  deletePublicHotel,
  emptyHotelDraft,
  loadPublicHotelsCatalog,
  savePublicHotel,
  seedPublicHotelsFromDefaults,
  slugifyHotelName,
  validateHotelMapsUrl,
} from "../utils/publicHotelsCatalog";
import { parseLatLngFromMapsUrl } from "../utils/googleMapsUrl";

const CATALOG_IMAGES_BUCKET = "documents";
const CATALOG_IMAGES_FALLBACK_BUCKET = "Catalogue";
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIZE_MB = 10;

function highlightsToText(list) {
  return (Array.isArray(list) ? list : []).join("\n");
}

function textToHighlights(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Page intranet : gérer le catalogue public des hôtels
 * (description, inclus, photos, publication).
 */
export function PublicHotelsAdminPage() {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [fromFallback, setFromFallback] = useState(false);
  const [tableEmpty, setTableEmpty] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(() => emptyHotelDraft());
  const [highlightsText, setHighlightsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef(null);
  const autoSeedAttempted = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadPublicHotelsCatalog({ publishedOnly: false });
    setHotels(result.hotels || []);
    setLoadError(result.error);
    setFromFallback(Boolean(result.fromFallback));
    setTableEmpty(Boolean(result.tableEmpty));
    setLoading(false);
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await refresh();
      if (cancelled) return;
      // Table créée mais vide → import auto une fois (évite le message « seed local » trompeur).
      if (result?.tableEmpty && !result?.fromFallback && !autoSeedAttempted.current) {
        autoSeedAttempted.current = true;
        setSeeding(true);
        try {
          const seeded = await seedPublicHotelsFromDefaults({ force: false });
          if (cancelled) return;
          if (seeded.ok && !seeded.skipped) {
            toast.success(`${seeded.inserted} hôtel(s) importé(s) automatiquement.`);
          } else if (!seeded.ok) {
            toast.error(seeded.error || "Import automatique impossible.");
          }
          await refresh();
        } finally {
          if (!cancelled) setSeeding(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hotels;
    return hotels.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        (h.location || "").toLowerCase().includes(q) ||
        (h.slug || "").toLowerCase().includes(q)
    );
  }, [hotels, search]);

  const isNew = !draft.dbId;
  const amenityKeys = useMemo(() => Object.keys(AMENITY_META), []);

  function openHotel(hotel) {
    setSelectedId(hotel.dbId || hotel.slug || hotel.id);
    setDraft({
      ...emptyHotelDraft(),
      ...hotel,
      mapsUrl: hotel.mapsUrl || hotel.maps_url || "",
      lat: hotel.lat ?? "",
      lng: hotel.lng ?? "",
      images: normalizeCatalogImageUrlsFromDb(hotel.images),
    });
    setHighlightsText(highlightsToText(hotel.highlights));
  }

  function startCreate() {
    const draftNew = emptyHotelDraft();
    setSelectedId("new");
    setDraft(draftNew);
    setHighlightsText("");
  }

  function updateField(field, value) {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "name" && !prev.dbId) {
        next.slug = slugifyHotelName(value);
        next.id = next.slug;
      }
      return next;
    });
  }

  function toggleAmenity(key) {
    setDraft((prev) => {
      const set = new Set(prev.amenities || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, amenities: [...set] };
    });
  }

  function setImageAt(index, value) {
    setDraft((prev) => {
      const images = [...(prev.images || [])];
      images[index] = value;
      return { ...prev, images };
    });
  }

  function addImageRow() {
    setDraft((prev) => {
      const images = [...(prev.images || [])];
      if (images.length >= MAX_CATALOG_IMAGES) return prev;
      return { ...prev, images: [...images, ""] };
    });
  }

  function removeImageAt(index) {
    setDraft((prev) => {
      const images = (prev.images || []).filter((_, i) => i !== index);
      return { ...prev, images };
    });
  }

  async function handleSave() {
    if (!draft.name.trim()) {
      toast.error("Le nom de l’hôtel est obligatoire.");
      return;
    }
    const slug = String(draft.slug || slugifyHotelName(draft.name)).trim();
    if (!slug) {
      toast.error("Le slug (URL) est obligatoire.");
      return;
    }
    const mapsErr = validateHotelMapsUrl(draft.mapsUrl);
    if (mapsErr) {
      toast.error(mapsErr, 7000);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...draft,
        slug,
        id: slug,
        highlights: textToHighlights(highlightsText),
        images: normalizeCatalogImageUrlsFromDb(draft.images),
      };
      const result = await savePublicHotel(payload);
      if (!result.ok) {
        const msg = result.error || "Enregistrement impossible.";
        if (/maps_url/i.test(msg)) {
          toast.error(
            "Colonne maps_url absente : exécutez supabase_public_hotels_catalog_add_maps_url.sql dans Supabase.",
            7000
          );
        } else if (/baby_age|child_age/i.test(msg)) {
          toast.error(
            "Colonnes âges absentes : exécutez supabase_public_hotels_catalog_add_age_policy.sql dans Supabase.",
            7000
          );
        } else if (/does not exist|schema cache|relation/i.test(msg)) {
          toast.error(
            "Table absente : exécutez supabase_public_hotels_catalog_table.sql dans Supabase.",
            6000
          );
        } else {
          toast.error(msg);
        }
        return;
      }
      toast.success(isNew ? "Hôtel créé." : "Hôtel enregistré.");
      const saved = result.hotel;
      const loadResult = await refresh();
      const list = loadResult?.hotels || [];
      const match =
        list.find((h) => h.dbId === saved?.dbId) ||
        list.find((h) => h.slug === saved?.slug) ||
        saved;
      if (match) openHotel(match);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft.dbId) {
      startCreate();
      return;
    }
    if (!window.confirm(`Supprimer définitivement « ${draft.name} » du catalogue public ?`)) {
      return;
    }
    setSaving(true);
    try {
      const result = await deletePublicHotel(draft.dbId);
      if (!result.ok) {
        toast.error(result.error || "Suppression impossible.");
        return;
      }
      toast.success("Hôtel supprimé.");
      setSelectedId(null);
      setDraft(emptyHotelDraft());
      setHighlightsText("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const result = await seedPublicHotelsFromDefaults({ force: false });
      if (!result.ok) {
        const msg = result.error || "Import impossible.";
        if (/does not exist|schema cache|relation/i.test(msg)) {
          toast.error(
            "Table absente : exécutez supabase_public_hotels_catalog_table.sql dans Supabase.",
            6000
          );
        } else {
          toast.error(msg);
        }
        return;
      }
      if (result.skipped) {
        toast.info(`Catalogue à jour (${result.total || 0} hôtels dans le seed).`);
      } else {
        toast.success(`${result.inserted} hôtel(s) ajouté(s) au catalogue.`);
      }
      await refresh();
    } finally {
      setSeeding(false);
    }
  }

  function hotelStorageFolder() {
    const key = String(draft.dbId || draft.slug || draft.id || slugifyHotelName(draft.name) || "").trim();
    return key || "draft";
  }

  function openFilePicker() {
    if (uploading) return;
    if (!__SUPABASE_DEBUG__.isConfigured || !supabase) {
      toast.error("Supabase Storage non disponible.");
      return;
    }
    if (!String(draft.name || "").trim() && !draft.dbId && !draft.slug) {
      toast.warning("Indiquez d’abord le nom de l’hôtel, puis uploadez des photos.");
      return;
    }
    const current = normalizeCatalogImageUrlsFromDb(draft.images);
    if (current.length >= MAX_CATALOG_IMAGES) {
      toast.warning(`Maximum atteint (${MAX_CATALOG_IMAGES} images).`);
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleUploadFiles(event) {
    const fileList = Array.from(event.target.files || []);
    event.target.value = "";
    if (!fileList.length) return;

    if (!__SUPABASE_DEBUG__.isConfigured || !supabase) {
      toast.error("Supabase Storage non disponible.");
      return;
    }

    const current = normalizeCatalogImageUrlsFromDb(draft.images);
    const remaining = Math.max(0, MAX_CATALOG_IMAGES - current.length);
    if (remaining <= 0) {
      toast.warning(`Maximum atteint (${MAX_CATALOG_IMAGES} images).`);
      return;
    }

    const filesToUpload = fileList.slice(0, remaining);
    const skipped = fileList.length - filesToUpload.length;
    if (skipped > 0) {
      toast.warning(`${skipped} fichier(s) ignoré(s) : limite de ${MAX_CATALOG_IMAGES} images.`);
    }

    const folder = hotelStorageFolder();
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of filesToUpload) {
        if (!file.type || !file.type.startsWith("image/")) {
          toast.warning(`${file.name} ignoré : ce n’est pas une image.`);
          continue;
        }
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          toast.warning(`${file.name} ignoré : max ${MAX_IMAGE_SIZE_MB} Mo.`);
          continue;
        }
        const safeName = String(file.name || "image")
          .replace(/[^\w.-]+/g, "_")
          .replace(/_+/g, "_");
        const objectPath = `hotels/${folder}/${Date.now()}_${safeName}`;
        let usedBucket = CATALOG_IMAGES_BUCKET;
        let { error: uploadError } = await supabase.storage
          .from(usedBucket)
          .upload(objectPath, file, { upsert: false, contentType: file.type });

        if (
          uploadError &&
          (() => {
            const msg = String(uploadError.message || "").toLowerCase();
            return (
              msg.includes("bucket not found") ||
              msg.includes("not found") ||
              msg.includes("does not exist")
            );
          })()
        ) {
          usedBucket = CATALOG_IMAGES_FALLBACK_BUCKET;
          const retry = await supabase.storage
            .from(usedBucket)
            .upload(objectPath, file, { upsert: false, contentType: file.type });
          uploadError = retry.error || null;
          if (!uploadError) {
            toast.warning(
              `Bucket "${CATALOG_IMAGES_BUCKET}" absent, upload dans "${CATALOG_IMAGES_FALLBACK_BUCKET}".`,
              5000
            );
          }
        }

        if (uploadError) {
          logger.warn("Upload hôtel", uploadError);
          const msg = String(uploadError.message || "");
          toast.error(
            msg.toLowerCase().includes("bucket not found")
              ? `Buckets Storage introuvables : ${CATALOG_IMAGES_BUCKET} et ${CATALOG_IMAGES_FALLBACK_BUCKET}.`
              : msg || `Échec upload : ${file.name}`
          );
          continue;
        }

        const { data: pub } = supabase.storage.from(usedBucket).getPublicUrl(objectPath);
        const url = String(pub?.publicUrl || "").trim();
        if (url && isAllowedCatalogImageUrl(url)) {
          uploaded.push(url);
        } else {
          toast.error(`URL publique invalide pour ${file.name}. Vérifiez que le bucket est public.`);
        }
      }

      if (uploaded.length) {
        setDraft((prev) => ({
          ...prev,
          images: normalizeCatalogImageUrlsFromDb([...(prev.images || []), ...uploaded]),
        }));
        toast.success(`${uploaded.length} photo(s) ajoutée(s) — cliquez sur « Enregistrer ».`);
      }
    } finally {
      setUploading(false);
    }
  }

  const imageRows =
    draft.images?.length > 0 ? draft.images : selectedId ? [""] : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">
            Gérez les fiches du catalogue public{" "}
            <a
              href="/hotels"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-cyan-300 underline-offset-2 hover:underline"
            >
              /hotels
            </a>
            {" "}
            : description, inclus, photos et position GPS.
          </p>
          {fromFallback ? (
            <p className="mt-2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-100">
              Connexion base impossible
              {loadError ? ` : ${loadError}` : ""}. Vérifiez que le SQL{" "}
              <code className="rounded bg-black/20 px-1">supabase_public_hotels_catalog_table.sql</code>{" "}
              a bien été exécuté, puis rechargez (ou « Synchroniser les hôtels »).
            </p>
          ) : null}
          {!fromFallback && tableEmpty && !loading ? (
            <p className="mt-2 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100">
              Table prête — aucun hôtel en base. Cliquez « Synchroniser les hôtels » (ou attendez l’import auto).
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <GhostBtn type="button" variant="neutral" size="sm" onClick={() => void handleSeed()} disabled={seeding}>
            {seeding ? "Sync…" : "Synchroniser les hôtels"}
          </GhostBtn>
          <PrimaryBtn type="button" className="min-h-0 gap-1.5 px-4 py-2.5 text-sm" onClick={startCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            Nouvel hôtel
          </PrimaryBtn>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        {/* Liste */}
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher un hôtel"
            className="mb-3"
          />
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-400">Aucun hôtel.</p>
          ) : (
            <ul className="max-h-[min(70vh,640px)] space-y-1 overflow-y-auto">
              {filtered.map((hotel) => {
                const active =
                  selectedId === hotel.dbId ||
                  selectedId === hotel.slug ||
                  selectedId === hotel.id;
                return (
                  <li key={hotel.dbId || hotel.slug}>
                    <button
                      type="button"
                      onClick={() => openHotel(hotel)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        active
                          ? "bg-violet-500/25 ring-1 ring-violet-300/40"
                          : "hover:bg-white/10"
                      }`}
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/80 text-white">
                        <Building2 className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">
                          {hotel.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                          <MapPin className="h-3 w-3" aria-hidden />
                          <span className="truncate">{hotel.location || "—"}</span>
                        </span>
                        <span className="mt-1 block truncate text-[10px] font-semibold text-violet-200/90">
                          Bébé {hotel.babyAgeMin}–{hotel.babyAgeMax} · Enfant {hotel.childAgeMin}–
                          {hotel.childAgeMax}
                        </span>
                        {!hotel.isPublished ? (
                          <span className="mt-1 inline-block rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                            Brouillon
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Éditeur */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:p-6">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <Building2 className="h-10 w-10 text-slate-500" aria-hidden />
              <p className="text-sm font-semibold text-slate-300">
                Sélectionnez un hôtel ou créez-en un nouveau.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {isNew ? "Nouvel hôtel" : draft.name || "Hôtel"}
                  </h2>
                  <p className="text-xs text-slate-400">
                    URL publique : /hotels/{draft.slug || "…"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!isNew ? (
                    <GhostBtn
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => void handleDelete()}
                      disabled={saving}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Supprimer
                    </GhostBtn>
                  ) : null}
                  <PrimaryBtn
                    type="button"
                    className="min-h-0 gap-1.5 px-4 py-2.5 text-sm"
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Save className="h-4 w-4" aria-hidden />
                    )}
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </PrimaryBtn>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Nom *
                  </span>
                  <TextInput
                    value={draft.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Ex. Hilton Plaza"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Slug (URL)
                  </span>
                  <TextInput
                    value={draft.slug}
                    onChange={(e) => updateField("slug", slugifyHotelName(e.target.value))}
                    placeholder="hilton-plaza"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Localisation courte
                  </span>
                  <TextInput
                    value={draft.location}
                    onChange={(e) => updateField("location", e.target.value)}
                    placeholder="Bord de mer · Hurghada"
                  />
                </label>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Adresse complète
                  </span>
                  <TextInput
                    value={draft.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    placeholder="Rue, quartier, ville…"
                  />
                </label>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Lien Google Maps
                  </span>
                  <TextInput
                    value={draft.mapsUrl || ""}
                    onChange={(e) => updateField("mapsUrl", e.target.value)}
                    placeholder="https://www.google.com/maps/place/…/@27.25,33.83,17z"
                  />
                  <span className="mt-1 block text-[11px] leading-snug text-slate-400">
                    Collez l’URL de la barre d’adresse Google Maps (avec @latitude,longitude). La
                    mini-carte du catalogue public se remplit automatiquement.
                    {(() => {
                      const parsed = parseLatLngFromMapsUrl(draft.mapsUrl);
                      if (!parsed) return null;
                      return (
                        <span className="mt-1 block font-semibold text-emerald-300">
                          Position détectée : {parsed.lat.toFixed(5)}, {parsed.lng.toFixed(5)}
                        </span>
                      );
                    })()}
                  </span>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Étoiles
                  </span>
                  <select
                    value={draft.stars}
                    onChange={(e) => updateField("stars", Number(e.target.value))}
                    className="w-full rounded-xl border-2 border-indigo-200/80 bg-white px-3.5 py-2.5 text-[15px] text-indigo-950"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} ★
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Ordre d’affichage
                  </span>
                  <TextInput
                    value={draft.sortOrder}
                    onChange={(e) => updateField("sortOrder", Number(e.target.value) || 0)}
                    inputMode="numeric"
                  />
                </label>

                <div className="sm:col-span-2 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-violet-200">
                    Âges bébé / enfant (catalogue public)
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Affiché sur /hotels. Ex. bébés 0–1 an, enfants 2–11 ans (selon l’hôtel).
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold text-slate-300">Bébé min</span>
                      <TextInput
                        value={draft.babyAgeMin}
                        onChange={(e) => updateField("babyAgeMin", Number(e.target.value))}
                        inputMode="numeric"
                        min={0}
                        max={17}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold text-slate-300">Bébé max</span>
                      <TextInput
                        value={draft.babyAgeMax}
                        onChange={(e) => updateField("babyAgeMax", Number(e.target.value))}
                        inputMode="numeric"
                        min={0}
                        max={17}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold text-slate-300">Enfant min</span>
                      <TextInput
                        value={draft.childAgeMin}
                        onChange={(e) => updateField("childAgeMin", Number(e.target.value))}
                        inputMode="numeric"
                        min={0}
                        max={17}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold text-slate-300">Enfant max</span>
                      <TextInput
                        value={draft.childAgeMax}
                        onChange={(e) => updateField("childAgeMax", Number(e.target.value))}
                        inputMode="numeric"
                        min={0}
                        max={17}
                      />
                    </label>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={draft.isPublished !== false}
                    onChange={(e) => updateField("isPublished", e.target.checked)}
                    className="h-4 w-4 rounded border-violet-300 text-violet-600"
                  />
                  <span className="text-sm font-semibold text-white">Publié sur /hotels</span>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Description
                </span>
                <textarea
                  value={draft.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={5}
                  className="w-full resize-y rounded-xl border-2 border-indigo-200/80 bg-white px-3.5 py-2.5 text-[15px] text-indigo-950 placeholder:text-indigo-300"
                  placeholder="Présentation de l’hôtel…"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Points forts / inclus (1 ligne = 1 point)
                </span>
                <textarea
                  value={highlightsText}
                  onChange={(e) => setHighlightsText(e.target.value)}
                  rows={5}
                  className="w-full resize-y rounded-xl border-2 border-indigo-200/80 bg-white px-3.5 py-2.5 text-[15px] text-indigo-950 placeholder:text-indigo-300"
                  placeholder={"Plage privée\nPiscines\nSpa…"}
                />
              </label>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Équipements inclus
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {amenityKeys.map((key) => {
                    const meta = AMENITY_META[key];
                    const checked = (draft.amenities || []).includes(key);
                    const Icon = meta.Icon;
                    return (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                          checked
                            ? "border-emerald-400/50 bg-emerald-500/15"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAmenity(key)}
                          className="h-4 w-4 rounded border-violet-300 text-violet-600"
                        />
                        <Icon className="h-4 w-4 text-violet-300" aria-hidden />
                        <span className="text-sm font-semibold text-white">{meta.label}</span>
                        {checked ? <Check className="ml-auto h-4 w-4 text-emerald-300" aria-hidden /> : null}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Photos ({normalizeCatalogImageUrlsFromDb(draft.images).length}/{MAX_CATALOG_IMAGES})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      disabled={uploading}
                      onChange={(e) => void handleUploadFiles(e)}
                    />
                    <button
                      type="button"
                      onClick={openFilePicker}
                      disabled={uploading}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Upload className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {uploading ? "Upload…" : "Uploader"}
                    </button>
                    <GhostBtn type="button" variant="neutral" size="sm" onClick={addImageRow}>
                      <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                      URL
                    </GhostBtn>
                  </div>
                </div>
                <p className="mb-3 text-xs text-slate-400">
                  JPG, PNG ou WebP · max {MAX_IMAGE_SIZE_MB} Mo · puis « Enregistrer » pour publier.
                </p>
                <div className="space-y-2">
                  {(imageRows.length ? imageRows : [""]).map((url, index) => (
                    <div key={`img-${index}`} className="flex gap-2">
                      <TextInput
                        value={url}
                        onChange={(e) => setImageAt(index, e.target.value)}
                        placeholder="https://…"
                        className="flex-1"
                      />
                      {url && isAllowedCatalogImageUrl(url) ? (
                        <img
                          src={url}
                          alt=""
                          className="h-11 w-14 shrink-0 rounded-lg object-cover ring-1 ring-white/20"
                        />
                      ) : null}
                      <GhostBtn
                        type="button"
                        variant="danger"
                        size="sm"
                        className="shrink-0"
                        onClick={() => removeImageAt(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </GhostBtn>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end border-t border-white/10 pt-4">
                <PrimaryBtn
                  type="button"
                  className="min-h-0 gap-1.5 px-5 py-2.5 text-sm"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </PrimaryBtn>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

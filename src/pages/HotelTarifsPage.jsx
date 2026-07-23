import { useCallback, useEffect, useMemo, useState } from "react";
import { BedDouble, Building2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { GhostBtn, PrimaryBtn, TextInput } from "../components/ui";
import { toast } from "../utils/toast.js";
import { loadPublicHotelsCatalog } from "../utils/publicHotelsCatalog";
import {
  applyHotelRateGain,
  deleteHotelRate,
  emptyHotelRateDraft,
  loadHotelRates,
  saveHotelRate,
} from "../utils/hotelRates";

function formatMoney(value, currency = "EUR") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency || "€"}`;
  }
}

function formatDateFr(iso) {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR");
  } catch {
    return iso;
  }
}

/**
 * Intranet — saisie des tarifs contrats par hôtel / catégorie / période.
 * Les prix serviront ensuite au calcul automatique des devis.
 */
export function HotelTarifsPage() {
  const [hotels, setHotels] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, ratesResult] = await Promise.all([
        loadPublicHotelsCatalog({ publishedOnly: false }),
        loadHotelRates(),
      ]);
      const list = catalog.hotels || [];
      setHotels(list);
      if (ratesResult.error && /does not exist|schema cache|relation/i.test(ratesResult.error)) {
        toast.error(
          "Table absente : exécutez supabase_public_hotel_rates_table.sql dans Supabase.",
          7000
        );
      } else if (ratesResult.error) {
        toast.error(ratesResult.error);
      }
      setRates(ratesResult.rates || []);
      setSelectedSlug((prev) => {
        if (prev && list.some((h) => (h.slug || h.id) === prev)) return prev;
        return list[0]?.slug || list[0]?.id || "";
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedHotel = useMemo(
    () => hotels.find((h) => (h.slug || h.id) === selectedSlug) || null,
    [hotels, selectedSlug]
  );

  const filteredHotels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hotels;
    return hotels.filter((h) => String(h.name || "").toLowerCase().includes(q));
  }, [hotels, search]);

  const hotelRates = useMemo(
    () => rates.filter((r) => r.hotelSlug === selectedSlug),
    [rates, selectedSlug]
  );

  const roomCategories = useMemo(() => {
    const fromHotel = Array.isArray(selectedHotel?.roomCategories)
      ? selectedHotel.roomCategories
      : [];
    const fromRates = hotelRates.map((r) => r.roomCategory).filter(Boolean);
    return [...new Set([...fromHotel, ...fromRates])];
  }, [selectedHotel, hotelRates]);

  function startCreate(roomCategory = "") {
    if (!selectedHotel) {
      toast.warning("Sélectionnez un hôtel.");
      return;
    }
    if (!roomCategory && roomCategories.length === 0) {
      toast.warning("Ajoutez d’abord des catégories de chambres dans Catalogue hôtels.");
      return;
    }
    setDraft(
      emptyHotelRateDraft(selectedHotel, roomCategory || roomCategories[0] || "")
    );
  }

  function startEdit(rate) {
    setDraft({
      id: rate.id,
      hotelSlug: rate.hotelSlug,
      hotelName: rate.hotelName,
      roomCategory: rate.roomCategory,
      dateFrom: rate.dateFrom,
      dateTo: rate.dateTo,
      priceAdult: rate.priceAdult ?? "",
      priceChild: rate.priceChild ?? "",
      priceBaby: rate.priceBaby ?? "",
      gainType: rate.gainType || "amount",
      gainValue: rate.gainValue ?? "",
      currency: rate.currency || "EUR",
      notes: rate.notes || "",
    });
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const result = await saveHotelRate({
        ...draft,
        hotelSlug: selectedHotel?.slug || selectedHotel?.id || draft.hotelSlug,
        hotelName: selectedHotel?.name || draft.hotelName,
      });
      if (!result.ok) {
        const msg = result.error || "Enregistrement impossible.";
        if (/does not exist|schema cache|relation/i.test(msg)) {
          toast.error(
            "Table absente : exécutez supabase_public_hotel_rates_table.sql dans Supabase.",
            7000
          );
        } else if (/gain_type|gain_value/i.test(msg)) {
          toast.error(
            "Colonnes gain absentes : exécutez supabase_public_hotel_rates_add_gain.sql dans Supabase.",
            7000
          );
        } else {
          toast.error(msg);
        }
        return;
      }
      toast.success(draft.id ? "Tarif mis à jour." : "Tarif ajouté.");
      setDraft(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(rate) {
    if (!window.confirm(`Supprimer le tarif « ${rate.roomCategory} » (${formatDateFr(rate.dateFrom)} → ${formatDateFr(rate.dateTo)}) ?`)) {
      return;
    }
    const result = await deleteHotelRate(rate.id);
    if (!result.ok) {
      toast.error(result.error || "Suppression impossible.");
      return;
    }
    toast.success("Tarif supprimé.");
    if (draft?.id === rate.id) setDraft(null);
    await refresh();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm font-semibold text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Chargement des tarifs…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-violet-200/80 bg-violet-50/70 px-4 py-3 text-xs font-medium leading-relaxed text-violet-950">
        Saisissez le <strong>prix de touche</strong> (contrat hôtel) par catégorie + période, puis le{" "}
        <strong>gain</strong> (montant € ou %). Le prix de vente = touche + gain — utilisé ensuite pour
        le calcul automatique des devis.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
        {/* Liste hôtels */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un hôtel…"
            className="mb-3"
          />
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
            {filteredHotels.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs font-semibold text-slate-500">
                Aucun hôtel. Ajoutez-en dans Catalogue hôtels.
              </li>
            ) : (
              filteredHotels.map((hotel) => {
                const slug = hotel.slug || hotel.id;
                const active = slug === selectedSlug;
                const count = rates.filter((r) => r.hotelSlug === slug).length;
                return (
                  <li key={slug}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSlug(slug);
                        setDraft(null);
                      }}
                      className={`flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                        active
                          ? "bg-violet-100 ring-1 ring-violet-300"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
                        <Building2 className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">
                          {hotel.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                          {(hotel.roomCategories || []).length} cat. · {count} tarif
                          {count !== 1 ? "s" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* Détail tarifs */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {!selectedHotel ? (
            <p className="py-12 text-center text-sm font-semibold text-slate-500">
              Sélectionnez un hôtel.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">{selectedHotel.name}</h2>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    {selectedHotel.location || "—"}
                  </p>
                </div>
                <PrimaryBtn
                  type="button"
                  className="!min-h-0 !min-w-0 gap-1.5 !px-4 !py-2 !text-sm"
                  onClick={() => startCreate()}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Ajouter un tarif
                </PrimaryBtn>
              </div>

              {roomCategories.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
                  Aucune catégorie de chambre pour cet hôtel. Ajoutez-les dans{" "}
                  <strong>Catalogue hôtels</strong>, puis revenez ici.
                </p>
              ) : (
                <div className="space-y-5">
                  {roomCategories.map((cat) => {
                    const rows = hotelRates
                      .filter((r) => r.roomCategory === cat)
                      .sort((a, b) => String(a.dateFrom).localeCompare(String(b.dateFrom)));
                    return (
                      <div key={cat} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                            <BedDouble className="h-4 w-4 text-violet-700" aria-hidden />
                            {cat}
                          </p>
                          <GhostBtn type="button" size="sm" onClick={() => startCreate(cat)}>
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            Période
                          </GhostBtn>
                        </div>

                        {rows.length === 0 ? (
                          <p className="text-xs font-semibold text-slate-500">
                            Aucun tarif sur cette catégorie.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                              <thead>
                                <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                  <th className="px-2 py-1.5">Du</th>
                                  <th className="px-2 py-1.5">Au</th>
                                  <th className="px-2 py-1.5">Touche adulte</th>
                                  <th className="px-2 py-1.5">Gain</th>
                                  <th className="px-2 py-1.5">Vente adulte</th>
                                  <th className="px-2 py-1.5">Vente enfant</th>
                                  <th className="px-2 py-1.5">Vente bébé</th>
                                  <th className="px-2 py-1.5" />
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((rate) => (
                                  <tr key={rate.id} className="border-t border-slate-200/80 bg-white/80">
                                    <td className="px-2 py-2 font-semibold text-slate-800">
                                      {formatDateFr(rate.dateFrom)}
                                    </td>
                                    <td className="px-2 py-2 font-semibold text-slate-800">
                                      {formatDateFr(rate.dateTo)}
                                    </td>
                                    <td className="px-2 py-2 font-semibold text-slate-700">
                                      {formatMoney(rate.priceAdult, rate.currency)}
                                    </td>
                                    <td className="px-2 py-2 font-semibold text-violet-800">
                                      {rate.gainType === "percent"
                                        ? `${Number(rate.gainValue || 0)} %`
                                        : formatMoney(rate.gainValue, rate.currency)}
                                    </td>
                                    <td className="px-2 py-2 font-bold text-slate-950">
                                      {formatMoney(rate.sellAdult, rate.currency)}
                                    </td>
                                    <td className="px-2 py-2 font-semibold text-slate-700">
                                      {formatMoney(rate.sellChild, rate.currency)}
                                    </td>
                                    <td className="px-2 py-2 font-semibold text-slate-700">
                                      {formatMoney(rate.sellBaby, rate.currency)}
                                    </td>
                                    <td className="px-2 py-2">
                                      <div className="flex justify-end gap-1">
                                        <button
                                          type="button"
                                          onClick={() => startEdit(rate)}
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-violet-700 hover:bg-violet-100"
                                          aria-label="Modifier"
                                        >
                                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleDelete(rate)}
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-100"
                                          aria-label="Supprimer"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Formulaire */}
              {draft ? (
                <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                  <h3 className="text-sm font-bold text-violet-950">
                    {draft.id ? "Modifier le tarif" : "Nouveau tarif"}
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-bold text-slate-600 sm:col-span-2">
                      Catégorie
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                        value={draft.roomCategory}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, roomCategory: e.target.value }))
                        }
                      >
                        {roomCategories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-bold text-slate-600">
                      Date début
                      <input
                        type="date"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                        value={draft.dateFrom}
                        onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
                      />
                    </label>
                    <label className="block text-xs font-bold text-slate-600">
                      Date fin
                      <input
                        type="date"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                        value={draft.dateTo}
                        min={draft.dateFrom || undefined}
                        onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
                      />
                    </label>
                    <label className="block text-xs font-bold text-slate-600">
                      Prix de touche adulte (€ / pers. / nuit)
                      <TextInput
                        className="mt-1"
                        inputMode="decimal"
                        value={draft.priceAdult}
                        onChange={(e) => setDraft((d) => ({ ...d, priceAdult: e.target.value }))}
                        placeholder="ex. 95"
                      />
                    </label>
                    <label className="block text-xs font-bold text-slate-600">
                      Prix de touche enfant (€ / pers. / nuit)
                      <TextInput
                        className="mt-1"
                        inputMode="decimal"
                        value={draft.priceChild}
                        onChange={(e) => setDraft((d) => ({ ...d, priceChild: e.target.value }))}
                        placeholder="optionnel"
                      />
                    </label>
                    <label className="block text-xs font-bold text-slate-600">
                      Prix de touche bébé (€ / pers. / nuit)
                      <TextInput
                        className="mt-1"
                        inputMode="decimal"
                        value={draft.priceBaby}
                        onChange={(e) => setDraft((d) => ({ ...d, priceBaby: e.target.value }))}
                        placeholder="optionnel / 0"
                      />
                    </label>

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 sm:col-span-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">
                        Gain (bénéfice)
                      </p>
                      <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
                        <label className="block text-xs font-bold text-slate-600">
                          Type
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                            value={draft.gainType || "amount"}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, gainType: e.target.value }))
                            }
                          >
                            <option value="amount">Montant (€)</option>
                            <option value="percent">Pourcentage (%)</option>
                          </select>
                        </label>
                        <label className="block text-xs font-bold text-slate-600">
                          {draft.gainType === "percent"
                            ? "Valeur du gain (%)"
                            : "Valeur du gain (€ / pers. / nuit)"}
                          <TextInput
                            className="mt-1"
                            inputMode="decimal"
                            value={draft.gainValue}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, gainValue: e.target.value }))
                            }
                            placeholder={draft.gainType === "percent" ? "ex. 15" : "ex. 20"}
                          />
                        </label>
                      </div>
                      <p className="mt-2 text-[11px] font-semibold text-emerald-900/80">
                        Aperçu vente adulte :{" "}
                        {formatMoney(
                          applyHotelRateGain(
                            draft.priceAdult,
                            draft.gainType,
                            draft.gainValue
                          ),
                          draft.currency
                        )}
                        {draft.priceChild !== "" && draft.priceChild != null ? (
                          <>
                            {" "}
                            · enfant :{" "}
                            {formatMoney(
                              applyHotelRateGain(
                                draft.priceChild,
                                draft.gainType,
                                draft.gainValue
                              ),
                              draft.currency
                            )}
                          </>
                        ) : null}
                      </p>
                    </div>

                    <label className="block text-xs font-bold text-slate-600 sm:col-span-2">
                      Notes
                      <TextInput
                        className="mt-1"
                        value={draft.notes}
                        onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                        placeholder="Ex. All inclusive, base double…"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <GhostBtn type="button" onClick={() => setDraft(null)} disabled={saving}>
                      Annuler
                    </GhostBtn>
                    <PrimaryBtn type="button" onClick={() => void handleSave()} disabled={saving}>
                      {saving ? "Enregistrement…" : "Enregistrer"}
                    </PrimaryBtn>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Baby, Minus, Plus, ShoppingBag, Trash2, Users, X } from "lucide-react";
import { supabase, __SUPABASE_DEBUG__ } from "../../lib/supabase";
import { SITE_KEY } from "../../constants";
import { boardFieldsToPayload } from "../../constants/hotelRequestBoardOptions";
import { toast } from "../../utils/toast.js";
import { logger } from "../../utils/logger";
import {
  MAX_HOTELS_CART_ITEMS,
  clearPublicHotelsCart,
  deriveMinorsFromBirthDates,
  formatHotelStayAgesForDb,
  formatMinorCategoryLabel,
  formatStaySummary,
  loadPublicHotelsCart,
  normalizeStay,
  savePublicHotelsCart,
  validateHotelStay,
} from "../../utils/publicHotelsCartStorage";
import {
  formatHotelAgePolicyLabel,
  normalizeHotelAgePolicy,
} from "../../utils/publicHotelsCatalog";

const EMPTY_CLIENT = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  budget: "",
  notes: "",
};

const fieldClass =
  "mt-1.5 min-h-[48px] w-full rounded-xl border-2 border-violet-200/80 bg-white px-3.5 py-3 text-base text-catalog-ink shadow-sm placeholder:text-slate-400 transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400/40 sm:text-[15px]";

function resizeBirthDates(list, count) {
  const next = Array.isArray(list) ? [...list] : [];
  while (next.length < count) next.push("");
  return next.slice(0, count);
}

function CountStepper({ label, icon: Icon, value, min, max, onChange }) {
  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/40 px-3 py-3">
      <p className="mb-2 flex items-center justify-center gap-1 text-xs font-bold uppercase tracking-wide text-violet-800">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
        {label}
      </p>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`Diminuer ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-800 shadow-sm active:scale-95 disabled:opacity-40"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-[2ch] text-center text-xl font-extrabold tabular-nums text-catalog-ink">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Augmenter ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-800 shadow-sm active:scale-95 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function categoryBadgeClass(category) {
  if (category === "baby") return "border-orange-200 bg-orange-50 text-orange-900";
  if (category === "child") return "border-violet-200 bg-violet-50 text-violet-900";
  if (category === "adult") return "border-sky-200 bg-sky-50 text-sky-900";
  if (category === "unknown") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

/**
 * Panier devis hôtels : modal séjour, tiroir panier, checkout (infos client comme le formulaire hôtel).
 * À monter sur /hotels et /hotels/:id.
 */
export function HotelsDevisCart({
  stayHotel = null,
  onStayHotelHandled,
  openDrawerSignal = 0,
  hideFab = false,
}) {
  const [cart, setCart] = useState(() => loadPublicHotelsCart());
  const [stayDraft, setStayDraft] = useState(() => loadPublicHotelsCart().stay);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [client, setClient] = useState(EMPTY_CLIENT);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    savePublicHotelsCart(cart);
  }, [cart]);

  useEffect(() => {
    if (stayHotel) {
      setStayDraft(normalizeStay(cart.stay));
    }
  }, [stayHotel]); // eslint-disable-line react-hooks/exhaustive-deps -- only when a hotel is offered

  useEffect(() => {
    if (openDrawerSignal > 0) setDrawerOpen(true);
  }, [openDrawerSignal]);

  useEffect(() => {
    if (!drawerOpen && !checkoutOpen && !successOpen && !stayHotel) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen, checkoutOpen, successOpen, stayHotel]);

  const itemCount = cart.items.length;
  const cartAgePolicy = useMemo(
    () => cart.stay?.agePolicy || (stayHotel ? normalizeHotelAgePolicy(stayHotel) : null),
    [cart.stay?.agePolicy, stayHotel]
  );
  const stayAgePolicy = useMemo(
    () => (stayHotel ? normalizeHotelAgePolicy(stayHotel) : cartAgePolicy),
    [stayHotel, cartAgePolicy]
  );
  const stayAgeLabel = useMemo(
    () => (stayHotel ? formatHotelAgePolicyLabel(stayHotel) : ""),
    [stayHotel]
  );
  const staySummary = useMemo(
    () => formatStaySummary(cart.stay, cartAgePolicy),
    [cart.stay, cartAgePolicy]
  );
  const stayDraftDerived = useMemo(
    () => deriveMinorsFromBirthDates(stayDraft, stayAgePolicy),
    [stayDraft, stayAgePolicy]
  );

  const closeStayModal = useCallback(() => {
    onStayHotelHandled?.();
  }, [onStayHotelHandled]);

  function updateStayField(field, value) {
    setStayDraft((prev) => {
      const next = { ...normalizeStay(prev), [field]: value };
      if (field === "minorsCount") {
        const n = Math.min(10, Math.max(0, Number(value) || 0));
        next.minorsCount = n;
        next.birthDates = resizeBirthDates(prev.birthDates, n);
      }
      if (field === "adultsCount") {
        next.adultsCount = Math.min(20, Math.max(1, Number(value) || 1));
      }
      return next;
    });
  }

  function setBirthDateAt(index, value) {
    setStayDraft((prev) => {
      const base = normalizeStay(prev);
      const birthDates = resizeBirthDates(base.birthDates, base.minorsCount);
      birthDates[index] = value;
      return { ...base, birthDates };
    });
  }

  function confirmAddToCart() {
    if (!stayHotel) return;
    const policy = normalizeHotelAgePolicy(stayHotel);
    const err = validateHotelStay(stayDraft, policy);
    if (err) {
      toast.error(err);
      return;
    }
    const slug = String(stayHotel.slug || stayHotel.id || "").trim();
    const name = String(stayHotel.name || "").trim();
    if (!slug || !name) {
      toast.error("Hôtel invalide.");
      return;
    }

    const normalized = {
      ...normalizeStay(stayDraft),
      agePolicy: policy,
    };

    setCart((prev) => {
      if (prev.items.some((it) => it.hotelSlug === slug)) {
        toast.info("Cet hôtel est déjà dans votre panier.");
        return { ...prev, stay: normalized };
      }
      if (prev.items.length >= MAX_HOTELS_CART_ITEMS) {
        toast.warning(`Maximum ${MAX_HOTELS_CART_ITEMS} hôtels par demande.`);
        return { ...prev, stay: normalized };
      }
      toast.success(`${name} ajouté au panier.`);
      return {
        stay: normalized,
        items: [
          ...prev.items,
          {
            id: `${slug}-${Date.now()}`,
            hotelSlug: slug,
            hotelName: name,
            location: String(stayHotel.location || "").trim(),
          },
        ],
      };
    });
    closeStayModal();
    setDrawerOpen(true);
  }

  function removeItem(id) {
    setCart((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.id !== id),
    }));
  }

  function openCheckout() {
    if (cart.items.length === 0) {
      toast.warning("Ajoutez au moins un hôtel au panier.");
      return;
    }
    const err = validateHotelStay(cart.stay, cart.stay?.agePolicy || cartAgePolicy);
    if (err) {
      toast.error(err);
      return;
    }
    setDrawerOpen(false);
    setCheckoutOpen(true);
  }

  async function submitCheckout(e) {
    e.preventDefault();
    if (cart.items.length === 0) {
      toast.error("Panier vide.");
      return;
    }
    const stayErr = validateHotelStay(cart.stay, cart.stay?.agePolicy || cartAgePolicy);
    if (stayErr) {
      toast.error(stayErr);
      return;
    }
    if (!client.firstName.trim()) {
      toast.error("Veuillez indiquer votre prénom.");
      return;
    }
    if (!client.lastName.trim()) {
      toast.error("Veuillez indiquer votre nom.");
      return;
    }
    if (!client.phone.trim()) {
      toast.error("Veuillez indiquer votre numéro de téléphone.");
      return;
    }
    if (!client.email.trim()) {
      toast.error("Veuillez indiquer votre adresse e-mail.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(client.email.trim())) {
      toast.error("Veuillez saisir une adresse e-mail valide.");
      return;
    }
    if (!supabase || !__SUPABASE_DEBUG__.isConfigured) {
      toast.error("Service temporairement indisponible. Réessayez plus tard.");
      return;
    }

    const hotels = cart.items.map((it) => it.hotelName);
    const stay = normalizeStay(cart.stay);
    const policy = stay.agePolicy || cartAgePolicy;
    const derived = deriveMinorsFromBirthDates(stay, policy);
    const agesText = formatHotelStayAgesForDb(stay, policy);
    const cartNote = [
      client.notes.trim(),
      cart.items.length > 1
        ? `Hôtels demandés : ${cart.items.map((it) => it.hotelName).join(" · ")}`
        : "",
      derived.babiesCount > 0 ? `Bébés (auto) : ${derived.babiesCount}` : "",
      derived.childrenCount > 0 ? `Enfants (auto) : ${derived.childrenCount}` : "",
      derived.upgradedAdultsCount > 0
        ? `Reclassés en adulte (trop âgés pour tarif enfant) : ${derived.upgradedAdultsCount}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    setSubmitting(true);
    try {
      const payload = {
        site_key: SITE_KEY,
        first_name: client.firstName.trim(),
        last_name: client.lastName.trim(),
        client_phone: client.phone.trim(),
        client_email: client.email.trim(),
        arrival_date: stay.arrivalDate,
        departure_date: stay.departureDate,
        adults_count: derived.effectiveAdultsCount,
        children_count: derived.childrenCount + derived.babiesCount,
        child_ages: agesText,
        hotel_option_1: hotels[0] || "",
        hotel_option_2: hotels[1] || "",
        hotel_option_3: hotels[2] || "",
        wants_custom_offer: false,
        budget: client.budget.trim(),
        ...boardFieldsToPayload(client),
        notes: cartNote,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("public_hotel_requests").insert(payload);
      if (error) {
        logger.error("HotelsDevisCart insert:", error);
        toast.error(error.message || "Impossible d’envoyer la demande.");
        return;
      }

      clearPublicHotelsCart();
      setCart({ stay: loadPublicHotelsCart().stay, items: [] });
      setClient(EMPTY_CLIENT);
      setCheckoutOpen(false);
      setSuccessOpen(true);
    } catch (err) {
      logger.error("HotelsDevisCart submit:", err);
      toast.error("Erreur inattendue. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* FAB panier */}
      {!hideFab ? (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="fixed bottom-24 left-6 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-violet-800 to-orange-600 px-5 text-sm font-bold text-white shadow-lg shadow-violet-950/35 transition hover:brightness-110 active:scale-[0.98] lg:bottom-6"
          aria-label={`Ouvrir le panier (${itemCount} hôtel${itemCount !== 1 ? "s" : ""})`}
        >
          <ShoppingBag className="h-5 w-5" aria-hidden />
          Panier
          {itemCount > 0 ? (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-extrabold text-violet-900">
              {itemCount}
            </span>
          ) : null}
        </button>
      ) : null}

      {/* Modal dates & voyageurs */}
      {stayHotel ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hotel-stay-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            aria-label="Fermer"
            onClick={closeStayModal}
          />
          <div className="relative z-10 flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-[1.75rem] border border-violet-200/70 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl">
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3 sm:px-6 sm:pt-5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Étape 1 · Séjour</p>
                <h2 id="hotel-stay-title" className="mt-1 truncate font-catalog-display text-xl font-semibold text-catalog-ink">
                  {stayHotel.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeStayModal}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-catalog-ink">
                  Arrivée <span className="text-orange-500">*</span>
                  <input
                    type="date"
                    value={stayDraft.arrivalDate}
                    onChange={(e) => updateStayField("arrivalDate", e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-semibold text-catalog-ink">
                  Départ <span className="text-orange-500">*</span>
                  <input
                    type="date"
                    value={stayDraft.departureDate}
                    min={stayDraft.arrivalDate || undefined}
                    onChange={(e) => updateStayField("departureDate", e.target.value)}
                    className={fieldClass}
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <CountStepper
                  label="Adultes"
                  icon={Users}
                  value={stayDraft.adultsCount}
                  min={1}
                  max={10}
                  onChange={(n) => updateStayField("adultsCount", n)}
                />
                <CountStepper
                  label="Enfants / bébés"
                  icon={Baby}
                  value={stayDraft.minorsCount || 0}
                  min={0}
                  max={10}
                  onChange={(n) => updateStayField("minorsCount", n)}
                />
              </div>

              {stayAgeLabel ? (
                <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold leading-snug text-violet-900">
                  Grille hôtel : {stayAgeLabel}
                  <span className="mt-1 block font-medium text-violet-700/90">
                    Indiquez la date de naissance : bébé ou enfant est calculé automatiquement à
                    l’arrivée.
                  </span>
                </p>
              ) : null}

              {(stayDraft.minorsCount || 0) > 0 ? (
                <div className="mt-4 space-y-3 rounded-2xl border border-violet-100 bg-violet-50/50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-violet-800">
                    Dates de naissance
                  </p>
                  {Array.from({ length: stayDraft.minorsCount }, (_, i) => {
                    const detail = stayDraftDerived.details[i];
                    const category = detail?.category ?? null;
                    return (
                      <label key={`dob-${i}`} className="block text-xs font-semibold text-catalog-muted">
                        Voyageur {i + 1}
                        <input
                          type="date"
                          value={stayDraft.birthDates?.[i] || ""}
                          max={stayDraft.arrivalDate || undefined}
                          onChange={(e) => setBirthDateAt(i, e.target.value)}
                          className={fieldClass}
                        />
                        <span
                          className={`mt-1.5 inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-bold ${categoryBadgeClass(category)}`}
                        >
                          {formatMinorCategoryLabel(category, detail?.age)}
                        </span>
                      </label>
                    );
                  })}
                  {stayDraftDerived.childrenCount +
                    stayDraftDerived.babiesCount +
                    stayDraftDerived.upgradedAdultsCount >
                  0 ? (
                    <p className="text-xs font-semibold text-catalog-body">
                      Résumé :{" "}
                      {[
                        `${stayDraftDerived.effectiveAdultsCount} adulte${stayDraftDerived.effectiveAdultsCount > 1 ? "s" : ""}`,
                        stayDraftDerived.childrenCount
                          ? `${stayDraftDerived.childrenCount} enfant${stayDraftDerived.childrenCount > 1 ? "s" : ""}`
                          : null,
                        stayDraftDerived.babiesCount
                          ? `${stayDraftDerived.babiesCount} bébé${stayDraftDerived.babiesCount > 1 ? "s" : ""}`
                          : null,
                        stayDraftDerived.upgradedAdultsCount
                          ? `(${stayDraftDerived.upgradedAdultsCount} reclassé${stayDraftDerived.upgradedAdultsCount > 1 ? "s" : ""} en adulte)`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-violet-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
              <button
                type="button"
                onClick={confirmAddToCart}
                className="inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-4 text-base font-bold text-white shadow-md active:scale-[0.99]"
              >
                Ajouter au panier
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Drawer panier — plein écran mobile */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-[110] flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hotels-cart-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 sm:block"
            aria-label="Fermer le panier"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl sm:border-l sm:border-violet-200/70">
            <div className="flex items-center justify-between border-b border-violet-950/30 bg-gradient-to-r from-violet-950 via-violet-800 to-indigo-950 px-4 py-4 text-white sm:px-5 sm:py-5">
              <h2 id="hotels-cart-title" className="font-catalog-display text-xl font-semibold">
                Panier ({itemCount})
              </h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white/20"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
              {staySummary ? (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm font-semibold leading-snug text-violet-950">
                  {staySummary}
                </div>
              ) : null}

              {itemCount === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-violet-300/80 bg-violet-50/80 px-5 py-12 text-center text-sm font-semibold text-catalog-body">
                  Votre panier est vide.
                  <br />
                  <span className="font-extrabold text-violet-800">Ajoutez un hôtel pour continuer.</span>
                </p>
              ) : null}

              {cart.items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-catalog-ink">{item.hotelName}</p>
                      {item.location ? (
                        <p className="mt-0.5 text-xs font-semibold text-catalog-muted">{item.location}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-extrabold text-rose-900"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="shrink-0 border-t border-violet-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <button
                type="button"
                disabled={itemCount === 0}
                onClick={openCheckout}
                className="inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-4 text-base font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
              >
                Finaliser ma demande
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Checkout */}
      {checkoutOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            aria-label="Fermer"
            onClick={() => setCheckoutOpen(false)}
          />
          <form
            onSubmit={(e) => void submitCheckout(e)}
            className="relative z-10 flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-[1.75rem] border border-violet-200/70 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
          >
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3 sm:px-6 sm:pt-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Étape 2 · Contact</p>
                <h2 className="mt-1 font-catalog-display text-xl font-semibold text-catalog-ink">Vos coordonnées</h2>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-6">
              {staySummary ? (
                <p className="mb-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-xs font-semibold leading-snug text-violet-900">
                  {staySummary}
                </p>
              ) : null}
              <ul className="mb-4 space-y-1 text-sm font-semibold text-catalog-body">
                {cart.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden />
                    {it.hotelName}
                  </li>
                ))}
              </ul>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-catalog-ink">
                  Prénom <span className="text-orange-500">*</span>
                  <input
                    required
                    autoComplete="given-name"
                    value={client.firstName}
                    onChange={(e) => setClient((p) => ({ ...p, firstName: e.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-semibold text-catalog-ink">
                  Nom <span className="text-orange-500">*</span>
                  <input
                    required
                    autoComplete="family-name"
                    value={client.lastName}
                    onChange={(e) => setClient((p) => ({ ...p, lastName: e.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-semibold text-catalog-ink sm:col-span-2">
                  Téléphone <span className="text-orange-500">*</span>
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    value={client.phone}
                    onChange={(e) => setClient((p) => ({ ...p, phone: e.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-semibold text-catalog-ink sm:col-span-2">
                  E-mail <span className="text-orange-500">*</span>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={client.email}
                    onChange={(e) => setClient((p) => ({ ...p, email: e.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-semibold text-catalog-ink sm:col-span-2">
                  Budget total du séjour
                  <input
                    value={client.budget}
                    onChange={(e) => setClient((p) => ({ ...p, budget: e.target.value }))}
                    placeholder="Ex. 1 500 € pour tout le séjour"
                    className={fieldClass}
                  />
                </label>
              </div>

              <p className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2.5 text-sm font-semibold text-emerald-900">
                Formule : All inclusive
              </p>

              <label className="mt-4 block text-sm font-semibold text-catalog-ink">
                Notes / précisions
                <textarea
                  rows={3}
                  value={client.notes}
                  onChange={(e) => setClient((p) => ({ ...p, notes: e.target.value }))}
                  className={`${fieldClass} min-h-[96px] resize-y`}
                  placeholder="Vue mer, lit bébé, transfert aéroport…"
                />
              </label>
            </div>

            <div className="shrink-0 border-t border-violet-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-4 text-base font-bold text-white shadow-md disabled:opacity-60 active:scale-[0.99]"
              >
                {submitting ? "Envoi…" : "Envoyer ma demande"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {successOpen ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-950/60" aria-label="Fermer" onClick={() => setSuccessOpen(false)} />
          <div className="relative z-10 max-w-md rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-2xl">
            <p className="font-catalog-display text-2xl font-semibold text-catalog-ink">Demande envoyée</p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-catalog-muted">
              Merci ! Notre équipe vous recontacte rapidement avec une proposition pour votre séjour.
            </p>
            <button
              type="button"
              onClick={() => setSuccessOpen(false)}
              className="mt-5 inline-flex rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-5 py-3 text-sm font-bold text-white"
            >
              Continuer
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

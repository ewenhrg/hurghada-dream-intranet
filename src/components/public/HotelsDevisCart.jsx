import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Baby, CheckCircle2, Minus, Plus, ShoppingBag, Trash2, Users } from "lucide-react";
import { Sheet, SheetFooter, SheetHeader } from "./PublicUI";
import { supabase, __SUPABASE_DEBUG__ } from "../../lib/supabase";
import { SITE_KEY } from "../../constants";
import { boardFieldsToPayload } from "../../constants/hotelRequestBoardOptions";
import { toast } from "../../utils/toast.js";
import { formatPhoneWithPlus } from "../../utils";
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

const fieldClass = "hdc-input mt-1.5";

function resizeBirthDates(list, count) {
  const next = Array.isArray(list) ? [...list] : [];
  while (next.length < count) next.push("");
  return next.slice(0, count);
}

function CountStepper({ label, icon: Icon, value, min, max, onChange }) {
  return (
    <div className="rounded-[1.25rem] bg-catalog-bg px-3 py-3 ring-1 ring-catalog-line">
      <p className="mb-2 flex items-center justify-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-catalog-muted">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
        {label}
      </p>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-press="0.9"
          aria-label={`Diminuer ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-catalog-ink ring-1 ring-catalog-border disabled:opacity-35"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-[2ch] text-center font-catalog-display text-[1.625rem] leading-none tabular-nums text-catalog-ink">
          {value}
        </span>
        <button
          type="button"
          data-press="0.9"
          aria-label={`Augmenter ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-catalog-raised text-white disabled:opacity-35"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function categoryBadgeClass(category) {
  if (category === "baby") return "border-transparent bg-catalog-coralSoft text-catalog-coralDeep";
  if (category === "child") return "border-transparent bg-catalog-lagoonSoft text-catalog-lagoon";
  if (category === "adult") return "border-transparent bg-catalog-mist text-catalog-ink";
  if (category === "unknown") return "border-transparent bg-catalog-brassSoft text-catalog-ink";
  return "border-transparent bg-catalog-bg text-catalog-muted";
}

/**
 * Panier devis hôtels : modal séjour, tiroir panier, checkout (infos client comme le formulaire hôtel).
 * À monter sur /hotels et /hotels/:id.
 */
export function HotelsDevisCart({
  stayHotel = null,
  onStayHotelHandled,
  openDrawerSignal = 0,
  openCustomOfferSignal = 0,
  hideFab = false,
}) {
  const [cart, setCart] = useState(() => loadPublicHotelsCart());
  const [stayDraft, setStayDraft] = useState(() => loadPublicHotelsCart().stay);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customOfferOpen, setCustomOfferOpen] = useState(false);
  const [wantsCustomOffer, setWantsCustomOffer] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [client, setClient] = useState(EMPTY_CLIENT);
  const [submitting, setSubmitting] = useState(false);

  const defaultAgePolicy = useMemo(() => normalizeHotelAgePolicy({}), []);

  useEffect(() => {
    savePublicHotelsCart(cart);
  }, [cart]);

  useEffect(() => {
    if (stayHotel) {
      setCustomOfferOpen(false);
      setStayDraft(normalizeStay(cart.stay));
    }
  }, [stayHotel]); // eslint-disable-line react-hooks/exhaustive-deps -- only when a hotel is offered

  useEffect(() => {
    if (openDrawerSignal > 0) setDrawerOpen(true);
  }, [openDrawerSignal]);

  useEffect(() => {
    if (openCustomOfferSignal > 0) {
      setDrawerOpen(false);
      setCheckoutOpen(false);
      setWantsCustomOffer(true);
      setStayDraft(normalizeStay(loadPublicHotelsCart().stay));
      setCustomOfferOpen(true);
    }
  }, [openCustomOfferSignal]);

  useEffect(() => {
    if (!drawerOpen && !checkoutOpen && !successOpen && !stayHotel && !customOfferOpen) {
      return undefined;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen, checkoutOpen, successOpen, stayHotel, customOfferOpen]);

  const itemCount = cart.items.length;
  const cartAgePolicy = useMemo(
    () =>
      cart.stay?.agePolicy ||
      (stayHotel ? normalizeHotelAgePolicy(stayHotel) : null) ||
      (wantsCustomOffer || customOfferOpen ? defaultAgePolicy : null),
    [cart.stay?.agePolicy, stayHotel, wantsCustomOffer, customOfferOpen, defaultAgePolicy]
  );
  const stayAgePolicy = useMemo(() => {
    if (stayHotel) return normalizeHotelAgePolicy(stayHotel);
    if (customOfferOpen || wantsCustomOffer) return defaultAgePolicy;
    return cartAgePolicy || defaultAgePolicy;
  }, [stayHotel, customOfferOpen, wantsCustomOffer, cartAgePolicy, defaultAgePolicy]);
  const stayAgeLabel = useMemo(() => {
    if (stayHotel) return formatHotelAgePolicyLabel(stayHotel);
    if (customOfferOpen || wantsCustomOffer) return formatHotelAgePolicyLabel({});
    return "";
  }, [stayHotel, customOfferOpen, wantsCustomOffer]);
  const staySummary = useMemo(
    () => formatStaySummary(cart.stay, cartAgePolicy || defaultAgePolicy),
    [cart.stay, cartAgePolicy, defaultAgePolicy]
  );
  const stayDraftDerived = useMemo(
    () => deriveMinorsFromBirthDates(stayDraft, stayAgePolicy),
    [stayDraft, stayAgePolicy]
  );

  const stayModalOpen = Boolean(stayHotel) || customOfferOpen;

  const closeStayModal = useCallback(() => {
    if (customOfferOpen) {
      setCustomOfferOpen(false);
      setWantsCustomOffer(false);
    }
    onStayHotelHandled?.();
  }, [customOfferOpen, onStayHotelHandled]);

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
    setWantsCustomOffer(false);
    closeStayModal();
    setDrawerOpen(true);
  }

  function confirmCustomOfferStay() {
    const policy = defaultAgePolicy;
    const err = validateHotelStay(stayDraft, policy);
    if (err) {
      toast.error(err);
      return;
    }
    const normalized = {
      ...normalizeStay(stayDraft),
      agePolicy: policy,
    };
    setCart((prev) => ({ ...prev, stay: normalized }));
    setWantsCustomOffer(true);
    setCustomOfferOpen(false);
    setCheckoutOpen(true);
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
    setWantsCustomOffer(false);
    setDrawerOpen(false);
    setCheckoutOpen(true);
  }

  async function submitCheckout(e) {
    e.preventDefault();
    const isCustom = wantsCustomOffer === true;
    if (!isCustom && cart.items.length === 0) {
      toast.error("Panier vide.");
      return;
    }
    const stayErr = validateHotelStay(
      cart.stay,
      cart.stay?.agePolicy || cartAgePolicy || defaultAgePolicy
    );
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
    if (!client.budget.trim()) {
      toast.error("Veuillez indiquer votre budget maximum pour le séjour.");
      return;
    }
    if (!supabase || !__SUPABASE_DEBUG__.isConfigured) {
      toast.error("Service temporairement indisponible. Réessayez plus tard.");
      return;
    }

    const hotels = isCustom ? [] : cart.items.map((it) => it.hotelName);
    const stay = normalizeStay(cart.stay);
    const policy = stay.agePolicy || cartAgePolicy || defaultAgePolicy;
    const derived = deriveMinorsFromBirthDates(stay, policy);
    const agesText = formatHotelStayAgesForDb(stay, policy);
    const cartNote = [
      isCustom ? "Offre personnalisée demandée (sans choix d’hôtel)." : "",
      client.notes.trim(),
      !isCustom && cart.items.length > 1
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
        client_phone: formatPhoneWithPlus(client.phone),
        client_email: client.email.trim(),
        arrival_date: stay.arrivalDate,
        departure_date: stay.departureDate,
        adults_count: derived.effectiveAdultsCount,
        children_count: derived.childrenCount + derived.babiesCount,
        child_ages: agesText,
        hotel_option_1: hotels[0] || "",
        hotel_option_2: hotels[1] || "",
        hotel_option_3: hotels[2] || "",
        wants_custom_offer: isCustom,
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
      setWantsCustomOffer(false);
      setCheckoutOpen(false);
      setSuccessOpen(true);
    } catch (err) {
      logger.error("HotelsDevisCart submit:", err);
      toast.error("Erreur inattendue. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  const closeCheckout = () => {
    setCheckoutOpen(false);
    setWantsCustomOffer(false);
  };

  return (
    <>
      {/* FAB panier */}
      {!hideFab ? (
        <button
          type="button"
          data-press
          onClick={() => setDrawerOpen(true)}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-4 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-catalog-raised pl-4 pr-2 text-sm font-bold text-white shadow-catalog-float"
          aria-label={`Ouvrir le panier (${itemCount} hôtel${itemCount !== 1 ? "s" : ""})`}
        >
          <ShoppingBag className="h-5 w-5" aria-hidden />
          Panier
          <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-catalog-coral px-2 text-xs font-extrabold">
            {itemCount}
          </span>
        </button>
      ) : null}

      {/* Feuille dates & voyageurs */}
      {stayModalOpen ? (
        <Sheet onClose={closeStayModal} labelledBy="hotel-stay-title">
          <SheetHeader
            eyebrow={customOfferOpen ? "Proposition · Séjour" : "Étape 1 sur 2 · Séjour"}
            title={customOfferOpen ? "Je veux une proposition" : stayHotel?.name || "Séjour"}
            titleId="hotel-stay-title"
            onClose={closeStayModal}
          />

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">
            <div data-sheet-item className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-bold text-catalog-ink">
                Arrivée <span className="text-catalog-coral">*</span>
                <input
                  type="date"
                  value={stayDraft.arrivalDate}
                  onChange={(e) => updateStayField("arrivalDate", e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-bold text-catalog-ink">
                Départ <span className="text-catalog-coral">*</span>
                <input
                  type="date"
                  value={stayDraft.departureDate}
                  min={stayDraft.arrivalDate || undefined}
                  onChange={(e) => updateStayField("departureDate", e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>

            <div data-sheet-item className="mt-4 grid grid-cols-2 gap-2.5">
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
              <p data-sheet-item className="mt-3 rounded-2xl bg-catalog-brassSoft px-3.5 py-3 text-xs font-semibold leading-snug text-catalog-ink">
                {customOfferOpen ? "Grille d’âges (indicatif)" : "Grille hôtel"} : {stayAgeLabel}
                <span className="mt-1 block font-medium text-catalog-muted">
                  Indiquez la date de naissance : bébé ou enfant est calculé automatiquement à l’arrivée.
                </span>
              </p>
            ) : null}

            {(stayDraft.minorsCount || 0) > 0 ? (
              <div data-sheet-item className="mt-4 space-y-3 rounded-[1.25rem] bg-catalog-bg p-3.5 ring-1 ring-catalog-line">
                <p className="hdc-eyebrow">Dates de naissance</p>
                {Array.from({ length: stayDraft.minorsCount }, (_, i) => {
                  const detail = stayDraftDerived.details[i];
                  const category = detail?.category ?? null;
                  return (
                    <label key={`dob-${i}`} className="block text-xs font-bold text-catalog-muted">
                      Voyageur {i + 1}
                      <input
                        type="date"
                        value={stayDraft.birthDates?.[i] || ""}
                        max={stayDraft.arrivalDate || undefined}
                        onChange={(e) => setBirthDateAt(i, e.target.value)}
                        className={fieldClass}
                      />
                      <span
                        className={`mt-1.5 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${categoryBadgeClass(category)}`}
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

          <SheetFooter>
            <button
              type="button"
              data-press
              onClick={customOfferOpen ? confirmCustomOfferStay : confirmAddToCart}
              className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem] text-base"
            >
              {customOfferOpen ? "Continuer ma demande" : "Ajouter au panier"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </SheetFooter>
        </Sheet>
      ) : null}

      {/* Tiroir panier */}
      {drawerOpen ? (
        <Sheet
          variant="right"
          zClass="z-[110]"
          onClose={() => setDrawerOpen(false)}
          closeLabel="Fermer le panier"
          labelledBy="hotels-cart-title"
        >
          <div className="pt-[env(safe-area-inset-top)]">
            <SheetHeader
              dark
              eyebrow="Hôtels"
              title={`Votre panier · ${itemCount}`}
              titleId="hotels-cart-title"
              onClose={() => setDrawerOpen(false)}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
            {staySummary ? (
              <div data-sheet-item className="rounded-2xl bg-catalog-lagoonSoft px-4 py-3 text-sm font-semibold leading-snug text-catalog-ink">
                {staySummary}
              </div>
            ) : null}

            {itemCount === 0 ? (
              <div data-sheet-item className="rounded-[1.4rem] bg-white px-5 py-12 text-center ring-1 ring-catalog-line">
                <ShoppingBag className="mx-auto h-8 w-8 text-catalog-subtle" aria-hidden />
                <p className="mt-3 font-catalog-display text-lg font-medium text-catalog-ink">Votre panier est vide</p>
                <p className="mt-1 text-sm text-catalog-muted">Ajoutez un hôtel pour continuer.</p>
              </div>
            ) : null}

            {cart.items.map((item) => (
              <div key={item.id} data-sheet-item className="hdc-card flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-catalog-display text-[1.0625rem] font-medium leading-snug text-catalog-ink">{item.hotelName}</p>
                  {item.location ? <p className="mt-0.5 text-xs font-semibold text-catalog-muted">{item.location}</p> : null}
                </div>
                <button
                  type="button"
                  data-press="0.9"
                  onClick={() => removeItem(item.id)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-catalog-coralSoft text-catalog-coralDeep"
                  aria-label={`Retirer ${item.hotelName}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <SheetFooter>
            <button
              type="button"
              data-press
              disabled={itemCount === 0}
              onClick={openCheckout}
              className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem] text-base"
            >
              Finaliser ma demande
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </SheetFooter>
        </Sheet>
      ) : null}

      {/* Coordonnées */}
      {checkoutOpen ? (
        <Sheet onClose={closeCheckout} as="form" panelProps={{ onSubmit: (e) => void submitCheckout(e) }} labelledBy="hotels-checkout-title">
          <SheetHeader
            eyebrow={wantsCustomOffer ? "Proposition · Contact" : "Étape 2 sur 2 · Contact"}
            title="Vos coordonnées"
            titleId="hotels-checkout-title"
            onClose={closeCheckout}
          />

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">
            {staySummary ? (
              <p data-sheet-item className="mb-3 rounded-2xl bg-catalog-lagoonSoft px-3.5 py-3 text-xs font-semibold leading-snug text-catalog-ink">
                {staySummary}
              </p>
            ) : null}
            {wantsCustomOffer ? (
              <p data-sheet-item className="mb-4 rounded-2xl bg-catalog-brassSoft px-3.5 py-3 text-sm font-semibold text-catalog-ink">
                Offre personnalisée — sans hôtel préchoisi. Nous vous proposons une adresse adaptée.
              </p>
            ) : (
              <ul data-sheet-item className="mb-4 flex flex-wrap gap-1.5">
                {cart.items.map((it) => (
                  <li key={it.id} className="inline-flex min-h-8 items-center rounded-full bg-catalog-bg px-3 text-xs font-bold text-catalog-ink ring-1 ring-catalog-line">
                    {it.hotelName}
                  </li>
                ))}
              </ul>
            )}

            <div data-sheet-item className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-bold text-catalog-ink">
                Prénom <span className="text-catalog-coral">*</span>
                <input
                  required
                  autoComplete="given-name"
                  value={client.firstName}
                  onChange={(e) => setClient((p) => ({ ...p, firstName: e.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-bold text-catalog-ink">
                Nom <span className="text-catalog-coral">*</span>
                <input
                  required
                  autoComplete="family-name"
                  value={client.lastName}
                  onChange={(e) => setClient((p) => ({ ...p, lastName: e.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="col-span-2 block text-sm font-bold text-catalog-ink">
                Téléphone WhatsApp <span className="text-catalog-coral">*</span>
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={formatPhoneWithPlus(client.phone)}
                  onChange={(e) => setClient((p) => ({ ...p, phone: formatPhoneWithPlus(e.target.value) }))}
                  className={fieldClass}
                />
              </label>
              <label className="col-span-2 block text-sm font-bold text-catalog-ink">
                E-mail <span className="text-catalog-coral">*</span>
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
              <label className="col-span-2 block text-sm font-bold text-catalog-ink">
                Budget maximum du séjour <span className="text-catalog-coral">*</span>
                <input
                  required
                  value={client.budget}
                  onChange={(e) => setClient((p) => ({ ...p, budget: e.target.value }))}
                  placeholder="Ex. 1 500 € maximum pour tout le séjour"
                  className={fieldClass}
                  aria-required="true"
                />
              </label>
            </div>

            <p data-sheet-item className="mt-4 inline-flex items-center gap-2 rounded-full bg-catalog-lagoonSoft px-3.5 py-2 text-sm font-bold text-catalog-lagoon">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Formule : All inclusive
            </p>

            <label data-sheet-item className="mt-4 block text-sm font-bold text-catalog-ink">
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

          <SheetFooter>
            <button
              type="submit"
              data-press
              disabled={submitting}
              className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem] text-base"
            >
              {submitting ? "Envoi…" : "Envoyer ma demande"}
            </button>
          </SheetFooter>
        </Sheet>
      ) : null}

      {successOpen ? (
        <Sheet variant="center" zClass="z-[130]" onClose={() => setSuccessOpen(false)} labelledBy="hotels-success-title">
          <div className="p-7 text-center">
            <span data-sheet-item className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-catalog-lagoonSoft text-catalog-lagoon">
              <CheckCircle2 className="h-8 w-8" aria-hidden />
            </span>
            <p data-sheet-item id="hotels-success-title" className="mt-4 font-catalog-display text-[1.75rem] font-normal text-catalog-ink">
              Demande envoyée
            </p>
            <p data-sheet-item className="mt-2 text-sm leading-relaxed text-catalog-muted">
              Merci ! Notre équipe vous recontacte rapidement avec une proposition pour votre séjour.
            </p>
            <button
              type="button"
              data-sheet-item
              data-press
              onClick={() => setSuccessOpen(false)}
              className="hdc-btn hdc-btn-ink mt-6 w-full"
            >
              Continuer
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

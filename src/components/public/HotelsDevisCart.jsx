import { useCallback, useEffect, useMemo, useState } from "react";
import { Baby, ShoppingBag, Trash2, Users, X } from "lucide-react";
import { supabase, __SUPABASE_DEBUG__ } from "../../lib/supabase";
import { SITE_KEY } from "../../constants";
import { boardFieldsToPayload } from "../../constants/hotelRequestBoardOptions";
import { toast } from "../../utils/toast.js";
import { logger } from "../../utils/logger";
import {
  MAX_HOTELS_CART_ITEMS,
  clearPublicHotelsCart,
  formatHotelStayAgesForDb,
  formatStaySummary,
  loadPublicHotelsCart,
  savePublicHotelsCart,
  validateHotelStay,
} from "../../utils/publicHotelsCartStorage";

const EMPTY_CLIENT = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  budget: "",
  notes: "",
};

const fieldClass =
  "mt-1.5 w-full rounded-xl border-2 border-violet-200/80 bg-white px-3.5 py-2.5 text-[15px] text-catalog-ink shadow-sm placeholder:text-slate-400 transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400/40";

function resizeAges(list, count) {
  const next = Array.isArray(list) ? [...list] : [];
  while (next.length < count) next.push("");
  return next.slice(0, count);
}

/**
 * Panier devis hôtels : modal séjour, tiroir panier, checkout (infos client comme le formulaire hôtel).
 * À monter sur /hotels et /hotels/:id.
 */
export function HotelsDevisCart({
  stayHotel = null,
  onStayHotelHandled,
  openDrawerSignal = 0,
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
      setStayDraft({ ...cart.stay });
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
  const staySummary = useMemo(() => formatStaySummary(cart.stay), [cart.stay]);

  const closeStayModal = useCallback(() => {
    onStayHotelHandled?.();
  }, [onStayHotelHandled]);

  function updateStayField(field, value) {
    setStayDraft((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "childrenCount") {
        const n = Math.min(10, Math.max(0, Number(value) || 0));
        next.childrenCount = n;
        next.childAges = resizeAges(prev.childAges, n);
      }
      if (field === "babiesCount") {
        const n = Math.min(10, Math.max(0, Number(value) || 0));
        next.babiesCount = n;
        next.babyAges = resizeAges(prev.babyAges, n);
      }
      if (field === "adultsCount") {
        next.adultsCount = Math.min(20, Math.max(1, Number(value) || 1));
      }
      return next;
    });
  }

  function setAgeAt(kind, index, value) {
    setStayDraft((prev) => {
      const key = kind === "baby" ? "babyAges" : "childAges";
      const list = resizeAges(prev[key], kind === "baby" ? prev.babiesCount : prev.childrenCount);
      list[index] = value;
      return { ...prev, [key]: list };
    });
  }

  function confirmAddToCart() {
    if (!stayHotel) return;
    const err = validateHotelStay(stayDraft);
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

    setCart((prev) => {
      if (prev.items.some((it) => it.hotelSlug === slug)) {
        toast.info("Cet hôtel est déjà dans votre panier.");
        return { ...prev, stay: { ...stayDraft } };
      }
      if (prev.items.length >= MAX_HOTELS_CART_ITEMS) {
        toast.warning(`Maximum ${MAX_HOTELS_CART_ITEMS} hôtels par demande.`);
        return { ...prev, stay: { ...stayDraft } };
      }
      toast.success(`${name} ajouté au panier.`);
      return {
        stay: { ...stayDraft },
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
    const err = validateHotelStay(cart.stay);
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
    const stayErr = validateHotelStay(cart.stay);
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
    const agesText = formatHotelStayAgesForDb(cart.stay);
    const cartNote = [
      client.notes.trim(),
      cart.items.length > 1
        ? `Hôtels demandés : ${cart.items.map((it) => it.hotelName).join(" · ")}`
        : "",
      cart.stay.babiesCount > 0 ? `Bébés : ${cart.stay.babiesCount}` : "",
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
        arrival_date: cart.stay.arrivalDate,
        departure_date: cart.stay.departureDate,
        adults_count: cart.stay.adultsCount,
        children_count: cart.stay.childrenCount + cart.stay.babiesCount,
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

      {/* Modal dates & voyageurs */}
      {stayHotel ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="hotel-stay-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            aria-label="Fermer"
            onClick={closeStayModal}
          />
          <div className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-violet-200/70 bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Ajouter au panier</p>
                <h2 id="hotel-stay-title" className="mt-1 font-catalog-display text-xl font-semibold text-catalog-ink">
                  {stayHotel.name}
                </h2>
                <p className="mt-1 text-sm text-catalog-muted">Indiquez vos dates et la composition du séjour.</p>
              </div>
              <button type="button" onClick={closeStayModal} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Fermer">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="mt-4 grid grid-cols-3 gap-3">
              <label className="block text-xs font-bold uppercase tracking-wide text-catalog-muted">
                <span className="mb-1.5 flex items-center gap-1 normal-case tracking-normal text-sm font-semibold text-catalog-ink">
                  <Users className="h-3.5 w-3.5" aria-hidden /> Adultes
                </span>
                <select
                  value={stayDraft.adultsCount}
                  onChange={(e) => updateStayField("adultsCount", e.target.value)}
                  className={fieldClass}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-catalog-muted">
                <span className="mb-1.5 block normal-case tracking-normal text-sm font-semibold text-catalog-ink">Enfants</span>
                <select
                  value={stayDraft.childrenCount}
                  onChange={(e) => updateStayField("childrenCount", e.target.value)}
                  className={fieldClass}
                >
                  {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-catalog-muted">
                <span className="mb-1.5 flex items-center gap-1 normal-case tracking-normal text-sm font-semibold text-catalog-ink">
                  <Baby className="h-3.5 w-3.5" aria-hidden /> Bébés
                </span>
                <select
                  value={stayDraft.babiesCount}
                  onChange={(e) => updateStayField("babiesCount", e.target.value)}
                  className={fieldClass}
                >
                  {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {stayDraft.childrenCount > 0 ? (
              <div className="mt-4 space-y-2 rounded-2xl border border-violet-100 bg-violet-50/50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-violet-800">Âge des enfants</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Array.from({ length: stayDraft.childrenCount }, (_, i) => (
                    <label key={`c-${i}`} className="block text-xs font-semibold text-catalog-muted">
                      Enfant {i + 1}
                      <input
                        type="number"
                        min={2}
                        max={17}
                        inputMode="numeric"
                        placeholder="ans"
                        value={stayDraft.childAges[i] || ""}
                        onChange={(e) => setAgeAt("child", i, e.target.value)}
                        className={fieldClass}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {stayDraft.babiesCount > 0 ? (
              <div className="mt-3 space-y-2 rounded-2xl border border-orange-100 bg-orange-50/50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-orange-800">Âge des bébés</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Array.from({ length: stayDraft.babiesCount }, (_, i) => (
                    <label key={`b-${i}`} className="block text-xs font-semibold text-catalog-muted">
                      Bébé {i + 1}
                      <input
                        type="number"
                        min={0}
                        max={2}
                        inputMode="numeric"
                        placeholder="ans"
                        value={stayDraft.babyAges[i] || ""}
                        onChange={(e) => setAgeAt("baby", i, e.target.value)}
                        className={fieldClass}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={confirmAddToCart}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-110"
              >
                Ajouter au panier
              </button>
              <button
                type="button"
                onClick={closeStayModal}
                className="inline-flex flex-1 items-center justify-center rounded-2xl border-2 border-violet-200 bg-white px-4 py-3.5 text-sm font-bold text-violet-800 transition hover:bg-violet-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Drawer panier */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-[110] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="hotels-cart-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            aria-label="Fermer le panier"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-violet-200/70 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-violet-950/30 bg-gradient-to-r from-violet-950 via-violet-800 to-indigo-950 px-5 py-5 text-white">
              <h2 id="hotels-cart-title" className="font-catalog-display text-xl font-semibold">
                Votre panier hôtels
              </h2>
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-xl p-2 hover:bg-white/20" aria-label="Fermer">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5">
              {staySummary ? (
                <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/80 px-4 py-3 text-sm font-semibold text-violet-950">
                  {staySummary}
                </div>
              ) : null}

              {itemCount === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-violet-300/80 bg-violet-50/80 px-5 py-10 text-center text-sm font-semibold text-catalog-body">
                  Votre panier est vide.
                  <br />
                  <span className="font-extrabold text-violet-800">Ajoutez des hôtels depuis le catalogue.</span>
                </p>
              ) : null}

              {cart.items.map((item) => (
                <div key={item.id} className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-catalog-ink">{item.hotelName}</p>
                      {item.location ? <p className="mt-0.5 text-xs font-semibold text-catalog-muted">{item.location}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-xl border-2 border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-extrabold text-rose-900"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-violet-100 bg-white p-4">
              <button
                type="button"
                disabled={itemCount === 0}
                onClick={openCheckout}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-4 py-3.5 text-sm font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                Finaliser ma demande
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Checkout — infos client */}
      {checkoutOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            aria-label="Fermer"
            onClick={() => setCheckoutOpen(false)}
          />
          <form
            onSubmit={(e) => void submitCheckout(e)}
            className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-violet-200/70 bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-catalog-display text-xl font-semibold text-catalog-ink">Vos coordonnées</h2>
                <p className="mt-1 text-sm text-catalog-muted">Pour valider le panier et recevoir votre devis.</p>
              </div>
              <button type="button" onClick={() => setCheckoutOpen(false)} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Fermer">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {staySummary ? (
              <p className="mb-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
                {staySummary}
              </p>
            ) : null}
            <ul className="mb-4 list-inside list-disc text-sm font-semibold text-catalog-body">
              {cart.items.map((it) => (
                <li key={it.id}>{it.hotelName}</li>
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
                  value={client.email}
                  onChange={(e) => setClient((p) => ({ ...p, email: e.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-semibold text-catalog-ink sm:col-span-2">
                Budget indicatif
                <input
                  value={client.budget}
                  onChange={(e) => setClient((p) => ({ ...p, budget: e.target.value }))}
                  placeholder="Ex. 80–120 € / nuit"
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
                className={`${fieldClass} resize-y`}
                placeholder="Vue mer, lit bébé, transfert aéroport…"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-4 py-3.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
            >
              {submitting ? "Envoi…" : "Envoyer ma demande de devis"}
            </button>
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

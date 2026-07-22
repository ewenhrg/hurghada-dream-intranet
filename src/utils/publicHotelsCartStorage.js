/** Panier devis hôtels (catalogue public) — sessionStorage. */
export const PUBLIC_HOTELS_CART_KEY = "hd_public_hotels_cart_v1";
export const MAX_HOTELS_CART_ITEMS = 3;

export const EMPTY_HOTEL_STAY = {
  arrivalDate: "",
  departureDate: "",
  adultsCount: 2,
  childrenCount: 0,
  babiesCount: 0,
  childAges: [],
  babyAges: [],
};

function normalizeStay(raw) {
  const base = { ...EMPTY_HOTEL_STAY, ...(raw && typeof raw === "object" ? raw : {}) };
  const adults = Math.min(20, Math.max(1, Number(base.adultsCount) || 2));
  const children = Math.min(10, Math.max(0, Number(base.childrenCount) || 0));
  const babies = Math.min(10, Math.max(0, Number(base.babiesCount) || 0));
  const childAges = Array.isArray(base.childAges)
    ? base.childAges.map((a) => String(a ?? "").trim()).slice(0, children)
    : [];
  const babyAges = Array.isArray(base.babyAges)
    ? base.babyAges.map((a) => String(a ?? "").trim()).slice(0, babies)
    : [];
  while (childAges.length < children) childAges.push("");
  while (babyAges.length < babies) babyAges.push("");
  return {
    arrivalDate: String(base.arrivalDate || "").trim(),
    departureDate: String(base.departureDate || "").trim(),
    adultsCount: adults,
    childrenCount: children,
    babiesCount: babies,
    childAges,
    babyAges,
  };
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const hotelSlug = String(raw.hotelSlug || raw.slug || "").trim();
  const hotelName = String(raw.hotelName || raw.name || "").trim();
  if (!hotelSlug || !hotelName) return null;
  return {
    id: String(raw.id || `${hotelSlug}-${Date.now()}`),
    hotelSlug,
    hotelName,
    location: String(raw.location || "").trim(),
  };
}

export function loadPublicHotelsCart() {
  try {
    const raw = sessionStorage.getItem(PUBLIC_HOTELS_CART_KEY);
    if (!raw) return { stay: { ...EMPTY_HOTEL_STAY }, items: [] };
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items)
      ? parsed.items.map(normalizeItem).filter(Boolean).slice(0, MAX_HOTELS_CART_ITEMS)
      : Array.isArray(parsed)
        ? parsed.map(normalizeItem).filter(Boolean).slice(0, MAX_HOTELS_CART_ITEMS)
        : [];
    return {
      stay: normalizeStay(parsed?.stay),
      items,
    };
  } catch {
    return { stay: { ...EMPTY_HOTEL_STAY }, items: [] };
  }
}

export function savePublicHotelsCart(cart) {
  try {
    const payload = {
      stay: normalizeStay(cart?.stay),
      items: (Array.isArray(cart?.items) ? cart.items : [])
        .map(normalizeItem)
        .filter(Boolean)
        .slice(0, MAX_HOTELS_CART_ITEMS),
    };
    sessionStorage.setItem(PUBLIC_HOTELS_CART_KEY, JSON.stringify(payload));
    emitHotelsCartChanged(payload);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearPublicHotelsCart() {
  try {
    sessionStorage.removeItem(PUBLIC_HOTELS_CART_KEY);
    emitHotelsCartChanged({ stay: { ...EMPTY_HOTEL_STAY }, items: [] });
  } catch {
    /* ignore */
  }
}

/** Texte âges pour la colonne child_ages (DB). */
export function formatHotelStayAgesForDb(stay) {
  const s = normalizeStay(stay);
  const parts = [];
  if (s.childrenCount > 0) {
    const ages = s.childAges.filter(Boolean).join(", ") || "non précisés";
    parts.push(`Enfants (${s.childrenCount}) : ${ages}`);
  }
  if (s.babiesCount > 0) {
    const ages = s.babyAges.filter(Boolean).join(", ") || "non précisés";
    parts.push(`Bébés (${s.babiesCount}) : ${ages}`);
  }
  return parts.join(" · ");
}

export function validateHotelStay(stay) {
  const s = normalizeStay(stay);
  if (!s.arrivalDate) return "Indiquez la date d’arrivée.";
  if (!s.departureDate) return "Indiquez la date de départ.";
  if (s.departureDate < s.arrivalDate) return "La date de départ doit être après l’arrivée.";
  if (s.adultsCount < 1) return "Indiquez au moins 1 adulte.";
  if (s.childrenCount > 0) {
    const missing = s.childAges.slice(0, s.childrenCount).some((a) => !String(a).trim());
    if (missing) return "Indiquez l’âge de chaque enfant.";
  }
  if (s.babiesCount > 0) {
    const missing = s.babyAges.slice(0, s.babiesCount).some((a) => !String(a).trim());
    if (missing) return "Indiquez l’âge de chaque bébé.";
  }
  return null;
}

export function formatStaySummary(stay) {
  const s = normalizeStay(stay);
  if (!s.arrivalDate || !s.departureDate) return "";
  const fmt = (iso) => {
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };
  const nights = (() => {
    try {
      const a = new Date(`${s.arrivalDate}T12:00:00`);
      const d = new Date(`${s.departureDate}T12:00:00`);
      const diff = Math.round((d - a) / 86400000);
      return Number.isFinite(diff) && diff > 0 ? diff : null;
    } catch {
      return null;
    }
  })();
  const pax = [
    `${s.adultsCount} adulte${s.adultsCount > 1 ? "s" : ""}`,
    s.childrenCount ? `${s.childrenCount} enfant${s.childrenCount > 1 ? "s" : ""}` : null,
    s.babiesCount ? `${s.babiesCount} bébé${s.babiesCount > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `${fmt(s.arrivalDate)} → ${fmt(s.departureDate)}${nights ? ` · ${nights} nuit${nights > 1 ? "s" : ""}` : ""} · ${pax}`;
}

/** Notifie les pages ouvertes (badge panier, etc.). */
export function emitHotelsCartChanged(cart) {
  try {
    window.dispatchEvent(new CustomEvent("hd-hotels-cart", { detail: cart }));
  } catch {
    /* ignore */
  }
}

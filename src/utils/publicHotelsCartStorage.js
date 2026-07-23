/** Panier devis hôtels (catalogue public) — sessionStorage. */
export const PUBLIC_HOTELS_CART_KEY = "hd_public_hotels_cart_v2";
export const MAX_HOTELS_CART_ITEMS = 3;

export const EMPTY_HOTEL_STAY = {
  arrivalDate: "",
  departureDate: "",
  adultsCount: 2,
  /** Nombre de mineurs (enfants + bébés) — classification via date de naissance. */
  minorsCount: 0,
  /** Dates de naissance ISO (YYYY-MM-DD), une par mineur. */
  birthDates: [],
  /** Grille d’âges de l’hôtel (snapshot au moment de l’ajout au panier). */
  agePolicy: null,
};

function resizeList(list, count, fill = "") {
  const next = Array.isArray(list) ? [...list] : [];
  while (next.length < count) next.push(fill);
  return next.slice(0, count);
}

/** Âge entier en années à une date de référence (arrivée). */
export function ageInYearsAt(birthDateIso, referenceDateIso) {
  const birth = String(birthDateIso || "").trim();
  const ref = String(referenceDateIso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}-\d{2}-\d{2}$/.test(ref)) return null;
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ry, rm, rd] = ref.split("-").map(Number);
  if (![by, bm, bd, ry, rm, rd].every((n) => Number.isFinite(n))) return null;
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  if (!Number.isFinite(age) || age < 0 || age > 120) return null;
  return age;
}

/**
 * Classe un mineur selon la politique hôtel (ans inclusifs) à la date d’arrivée.
 * @returns {'baby'|'child'|'adult'|'unknown'|null}
 */
export function classifyMinorByBirthDate(birthDateIso, arrivalDateIso, policy) {
  const age = ageInYearsAt(birthDateIso, arrivalDateIso);
  if (age == null) return null;
  if (!policy) return "unknown";
  const babyMin = Number(policy.babyAgeMin);
  const babyMax = Number(policy.babyAgeMax);
  const childMin = Number(policy.childAgeMin);
  const childMax = Number(policy.childAgeMax);
  if (Number.isFinite(babyMin) && Number.isFinite(babyMax) && age >= babyMin && age <= babyMax) {
    return "baby";
  }
  if (Number.isFinite(childMin) && Number.isFinite(childMax) && age >= childMin && age <= childMax) {
    return "child";
  }
  if (Number.isFinite(childMax) && age > childMax) return "adult";
  return "unknown";
}

export function formatMinorCategoryLabel(category, age) {
  const ageTxt = age == null ? "" : ` · ${age} an${age > 1 ? "s" : ""}`;
  if (category === "baby") return `Bébé${ageTxt}`;
  if (category === "child") return `Enfant${ageTxt}`;
  if (category === "adult") return `Adulte (tarif enfant non applicable)${ageTxt}`;
  if (category === "unknown") return age == null ? "Date invalide" : `Hors grille hôtel${ageTxt}`;
  return "Saisissez la date de naissance";
}

/**
 * Dérive enfants / bébés + âges à partir des dates de naissance.
 */
export function deriveMinorsFromBirthDates(stay, policy) {
  const s = normalizeStay(stay);
  const babies = [];
  const children = [];
  const details = [];

  for (let i = 0; i < s.minorsCount; i += 1) {
    const birthDate = s.birthDates[i] || "";
    const age = ageInYearsAt(birthDate, s.arrivalDate);
    const category = classifyMinorByBirthDate(birthDate, s.arrivalDate, policy);
    details.push({ index: i, birthDate, age, category });
    if (category === "baby") babies.push({ birthDate, age });
    else if (category === "child") children.push({ birthDate, age });
  }

  return {
    babiesCount: babies.length,
    childrenCount: children.length,
    babyAges: babies.map((b) => String(b.age)),
    childAges: children.map((c) => String(c.age)),
    details,
  };
}

export function normalizeStay(raw) {
  const base = { ...(raw && typeof raw === "object" ? raw : {}) };

  // Migration douce depuis l’ancien modèle (enfants/bébés + âges numériques)
  let minorsCount = Number(base.minorsCount);
  let birthDates = Array.isArray(base.birthDates) ? base.birthDates.map((d) => String(d || "").trim()) : [];

  if (!Number.isFinite(minorsCount) || minorsCount < 0) {
    const legacyChildren = Math.max(0, Number(base.childrenCount) || 0);
    const legacyBabies = Math.max(0, Number(base.babiesCount) || 0);
    minorsCount = legacyChildren + legacyBabies;
  }

  minorsCount = Math.min(10, Math.max(0, minorsCount || 0));
  birthDates = resizeList(birthDates, minorsCount, "");

  let agePolicy = null;
  if (base.agePolicy && typeof base.agePolicy === "object") {
    agePolicy = {
      babyAgeMin: Number(base.agePolicy.babyAgeMin),
      babyAgeMax: Number(base.agePolicy.babyAgeMax),
      childAgeMin: Number(base.agePolicy.childAgeMin),
      childAgeMax: Number(base.agePolicy.childAgeMax),
    };
    if (
      ![agePolicy.babyAgeMin, agePolicy.babyAgeMax, agePolicy.childAgeMin, agePolicy.childAgeMax].every(
        (n) => Number.isFinite(n)
      )
    ) {
      agePolicy = null;
    }
  }

  return {
    arrivalDate: String(base.arrivalDate || "").trim(),
    departureDate: String(base.departureDate || "").trim(),
    adultsCount: Math.min(20, Math.max(1, Number(base.adultsCount) || 2)),
    minorsCount,
    birthDates,
    agePolicy,
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
    if (!raw) {
      // Purge éventuelle ancienne clé
      try {
        sessionStorage.removeItem("hd_public_hotels_cart_v1");
      } catch {
        /* ignore */
      }
      return { stay: { ...EMPTY_HOTEL_STAY }, items: [] };
    }
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items)
      ? parsed.items.map(normalizeItem).filter(Boolean).slice(0, MAX_HOTELS_CART_ITEMS)
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

/** Texte âges / DOB pour la colonne child_ages (DB). */
export function formatHotelStayAgesForDb(stay, policy = null) {
  const s = normalizeStay(stay);
  const derived = deriveMinorsFromBirthDates(s, policy);
  const parts = [];

  for (const d of derived.details) {
    const cat = formatMinorCategoryLabel(d.category, d.age);
    const dob = d.birthDate
      ? (() => {
          try {
            return new Date(`${d.birthDate}T12:00:00`).toLocaleDateString("fr-FR");
          } catch {
            return d.birthDate;
          }
        })()
      : "—";
    parts.push(`${cat} (né(e) le ${dob})`);
  }

  if (parts.length === 0) return "";
  return parts.join(" · ");
}

export function validateHotelStay(stay, policy = null) {
  const s = normalizeStay(stay);
  if (!s.arrivalDate) return "Indiquez la date d’arrivée.";
  if (!s.departureDate) return "Indiquez la date de départ.";
  if (s.departureDate < s.arrivalDate) return "La date de départ doit être après l’arrivée.";
  if (s.adultsCount < 1) return "Indiquez au moins 1 adulte.";

  if (s.minorsCount > 0) {
    for (let i = 0; i < s.minorsCount; i += 1) {
      const dob = s.birthDates[i];
      if (!dob) return `Indiquez la date de naissance du voyageur ${i + 1}.`;
      if (dob > s.arrivalDate) {
        return `La date de naissance du voyageur ${i + 1} ne peut pas être après l’arrivée.`;
      }
      const age = ageInYearsAt(dob, s.arrivalDate);
      if (age == null) return `Date de naissance invalide (voyageur ${i + 1}).`;
    }
  }

  if (policy && s.minorsCount > 0) {
    const derived = deriveMinorsFromBirthDates(s, policy);
    for (const d of derived.details) {
      if (d.category === "adult") {
        return `Le voyageur ${d.index + 1} a ${d.age} ans à l’arrivée : trop âgé pour le tarif enfant de cet hôtel (max ${policy.childAgeMax} ans). Comptez-le en adulte.`;
      }
      if (d.category === "unknown" || d.category == null) {
        return `Le voyageur ${d.index + 1} (${d.age} ans) ne correspond pas à la grille bébé/enfant de cet hôtel.`;
      }
    }
  }

  return null;
}

/** @deprecated Conservé pour compat — utilise validateHotelStay(stay, policy). */
export function validateHotelStayAgesAgainstPolicy(stay, policy) {
  return validateHotelStay(stay, policy);
}

export function formatStaySummary(stay, policy = null) {
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

  const derived = deriveMinorsFromBirthDates(s, policy);
  const pax = [
    `${s.adultsCount} adulte${s.adultsCount > 1 ? "s" : ""}`,
    derived.childrenCount
      ? `${derived.childrenCount} enfant${derived.childrenCount > 1 ? "s" : ""}`
      : null,
    derived.babiesCount ? `${derived.babiesCount} bébé${derived.babiesCount > 1 ? "s" : ""}` : null,
    !policy && s.minorsCount
      ? `${s.minorsCount} enfant${s.minorsCount > 1 ? "s" : ""}/bébé${s.minorsCount > 1 ? "s" : ""}`
      : null,
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

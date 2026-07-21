/**
 * Catalogue hôtels public (sans prix pour le moment).
 * Chaque hôtel peut recevoir une liste `images` (URLs) ; en attendant, un
 * dégradé + icône élégante sert de couverture.
 *
 * `lat` / `lng` : position exacte pour la mini carte Google Maps.
 * Pour ajouter un hôtel : dupliquer un bloc et garder un `id` unique (slug).
 */
export const PUBLIC_HOTELS = [
  {
    id: "hilton-plaza",
    name: "Hilton Plaza",
    location: "Bord de mer · Hurghada",
    address: "Gabal El Hareem Street, Hurghada, Red Sea, Egypt",
    lat: 27.256743,
    lng: 33.830405,
    tagline: "Élégance balnéaire face à la Mer Rouge",
    stars: 5,
    badge: "Signature",
    accent: "ocean",
    description:
      "Une adresse raffinée les pieds dans l’eau, pensée pour les séjours qui allient confort, service attentionné et vue imprenable sur la Mer Rouge. Chambres lumineuses, piscines à débordement et espace bien-être pour se ressourcer.",
    highlights: [
      "Plage privée & ponton",
      "Piscines à débordement",
      "Spa & bien-être",
      "Restaurants à la carte",
    ],
    amenities: ["beach", "pool", "spa", "restaurant", "wifi", "gym"],
    images: [],
  },
  {
    id: "neverland",
    name: "Neverland",
    location: "Safaga Road · Hurghada",
    address: "Hurghada–Safaga Road, Al Ismaileya, Hurghada, Red Sea, Egypt",
    lat: 27.088875,
    lng: 33.823772,
    tagline: "Le paradis des familles et des grands enfants",
    stars: 4,
    badge: "Familial",
    accent: "coral",
    description:
      "Un resort vivant et coloré, conçu pour que petits et grands ne s’ennuient jamais : parc aquatique, animations en journée et soirées à thème. L’endroit idéal pour des vacances pleines d’énergie et de souvenirs.",
    highlights: [
      "Parc aquatique & toboggans",
      "Club enfants encadré",
      "Animations & spectacles",
      "Formule tout compris",
    ],
    amenities: ["waterpark", "kids", "pool", "restaurant", "wifi", "entertainment"],
    images: [],
  },
  {
    id: "serry-beach",
    name: "Serry Beach",
    location: "Mamsha · Front de mer · Hurghada",
    address: "1 Mohamed Said Street, Al Mamsha El Seyahi, Hurghada, Red Sea, Egypt",
    lat: 27.187357,
    lng: 33.831846,
    tagline: "Sérénité, plage privée et couchers de soleil",
    stars: 5,
    badge: "Détente",
    accent: "violet",
    description:
      "Une parenthèse paisible en bord de plage, parfaite pour les couples et les voyageurs en quête de calme. Ambiance feutrée, sable fin et service discret pour un séjour tout en douceur.",
    highlights: [
      "Plage privée de sable fin",
      "Ambiance calme & adulte-friendly",
      "Spa & massages",
      "Dîners face au coucher de soleil",
    ],
    amenities: ["beach", "spa", "pool", "restaurant", "wifi", "sunset"],
    images: [],
  },
];

/** Dégradés de couverture par accent (fallback quand aucune photo n’est fournie). */
export const HOTEL_ACCENT_COVERS = {
  ocean:
    "linear-gradient(150deg, #0ea5b7 0%, #2563eb 48%, #4c1d95 100%)",
  coral:
    "linear-gradient(150deg, #fb923c 0%, #ea580c 46%, #be123c 100%)",
  violet:
    "linear-gradient(150deg, #a78bfa 0%, #7c3aed 48%, #4c1d95 100%)",
};

export function getHotelById(id) {
  const target = String(id || "").trim();
  return PUBLIC_HOTELS.find((h) => h.id === target) || null;
}

/** URL d’embed Google Maps (aucune clé API requise). */
export function getHotelMapEmbedUrl(hotel, { zoom = 16 } = {}) {
  const lat = Number(hotel?.lat);
  const lng = Number(hotel?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const z = Math.min(20, Math.max(10, Number(zoom) || 16));
  return `https://www.google.com/maps?q=${lat},${lng}&z=${z}&hl=fr&output=embed`;
}

/** Lien pour ouvrir la position dans Google Maps (nouvel onglet). */
export function getHotelMapsOpenUrl(hotel) {
  const lat = Number(hotel?.lat);
  const lng = Number(hotel?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/**
 * Catalogue hôtels public (sans prix pour le moment).
 * Chaque hôtel peut recevoir une liste `images` (URLs) ; en attendant, un
 * dégradé + icône élégante sert de couverture.
 *
 * Pour ajouter un hôtel : dupliquer un bloc et garder un `id` unique (slug).
 */
export const PUBLIC_HOTELS = [
  {
    id: "hilton-plaza",
    name: "Hilton Plaza",
    location: "Bord de mer · Hurghada",
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
    location: "Quartier animé · Hurghada",
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
    location: "Front de mer calme · Hurghada",
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

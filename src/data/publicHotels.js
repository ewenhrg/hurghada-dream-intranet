import { parseLatLngFromMapsUrl } from "../utils/googleMapsUrl";

/**
 * Catalogue hôtels public (sans prix pour le moment).
 * Chaque hôtel peut recevoir une liste `images` (URLs) ; en attendant, un
 * dégradé + icône élégante sert de couverture.
 *
 * `mapsUrl` : lien Google Maps (admin). `lat` / `lng` : dérivés pour la mini carte.
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
    stars: 5,
    babyAgeMin: 0,
    babyAgeMax: 5,
    childAgeMin: 6,
    childAgeMax: 11,
    description:
      "Une adresse raffinée les pieds dans l’eau, pensée pour les séjours qui allient confort, service attentionné et vue imprenable sur la Mer Rouge. Chambres lumineuses, piscines à débordement et espace bien-être pour se ressourcer.",
    highlights: ["Plage privée & ponton", "Piscines à débordement", "Spa & bien-être", "Restaurants à la carte"],
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
    stars: 4,
    description:
      "Un resort vivant et coloré, conçu pour que petits et grands ne s’ennuient jamais : parc aquatique, animations en journée et soirées à thème. L’endroit idéal pour des vacances pleines d’énergie et de souvenirs.",
    highlights: ["Parc aquatique & toboggans", "Club enfants encadré", "Animations & spectacles", "Formule tout compris"],
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
    stars: 5,
    description:
      "Une parenthèse paisible en bord de plage, parfaite pour les couples et les voyageurs en quête de calme. Ambiance feutrée, sable fin et service discret pour un séjour tout en douceur.",
    highlights: ["Plage privée de sable fin", "Ambiance calme & adulte-friendly", "Spa & massages", "Dîners face au coucher de soleil"],
    amenities: ["beach", "spa", "pool", "restaurant", "wifi", "sunset"],
    images: [],
  },
  {
    id: "jasmine-palace",
    name: "Jasmine Palace",
    location: "Magawish · Hurghada",
    address: "Magawish Road, Hurghada, Red Sea, Egypt",
    lat: 27.1745,
    lng: 33.8258,
    stars: 5,
    description:
      "Resort All inclusive élégant à Magawish, entre plage privée et jardins. Idéal pour familles et couples qui cherchent confort, piscines et accès facile au centre de Hurghada.",
    highlights: ["Plage privée", "Piscines & kids club", "All inclusive", "Proche aéroport"],
    amenities: ["beach", "pool", "kids", "restaurant", "wifi", "spa"],
    images: [],
  },
  {
    id: "pickalbatros-jungle-aqua-park",
    name: "Pickalbatros Jungle Aqua Park",
    location: "Safaga Road · Hurghada",
    address: "Hurghada–Safaga Road, Hurghada, Red Sea, Egypt",
    lat: 27.09037,
    lng: 33.82439,
    stars: 4,
    description:
      "Grand resort familial célèbre pour son immense parc aquatique Jungle Aqua Park : toboggans, piscines et animations. Une valeur sûre pour des vacances dynamiques All inclusive.",
    highlights: ["Parc aquatique géant", "Familles & enfants", "Animations quotidiennes", "All inclusive"],
    amenities: ["waterpark", "kids", "pool", "restaurant", "wifi", "entertainment"],
    images: [],
  },
  {
    id: "sindbad",
    name: "Sindbad",
    location: "Sheraton Road · Hurghada",
    address: "Sheraton Road, Hurghada, Red Sea, Egypt",
    lat: 27.2152,
    lng: 33.8415,
    stars: 4,
    description:
      "Adresse connue de Hurghada, proche de la mer et des commodités. Bon équilibre entre détente, piscines et ambiance conviviale en All inclusive.",
    highlights: ["Emplacement pratique", "Piscines", "All inclusive", "Ambiance détente"],
    amenities: ["pool", "beach", "restaurant", "wifi", "kids"],
    images: [],
  },
  {
    id: "pickalbatros-palace-resort",
    name: "Pickalbatros Palace Resort",
    location: "Magawish · Hurghada",
    address: "Magawish, Hurghada, Red Sea, Egypt",
    lat: 27.1688,
    lng: 33.8262,
    stars: 5,
    description:
      "Resort Palace Pickalbatros à Magawish : standing soigné, plage, piscines et services All inclusive pour un séjour confortable en famille ou en couple.",
    highlights: ["Standing Palace", "Plage & piscines", "All inclusive", "Spa"],
    amenities: ["beach", "pool", "spa", "restaurant", "wifi", "gym"],
    images: [],
  },
  {
    id: "pickalbatros-white-beach",
    name: "Pickalbatros White Beach",
    location: "Magawish · Hurghada",
    address: "White Beach, Magawish, Hurghada, Red Sea, Egypt",
    lat: 27.1655,
    lng: 33.8271,
    stars: 4,
    description:
      "Resort Pickalbatros face à une plage de sable clair. Ambiance légère, All inclusive et accès direct à la Mer Rouge pour se baigner et se relaxer.",
    highlights: ["Plage de sable", "All inclusive", "Piscines", "Familles"],
    amenities: ["beach", "pool", "restaurant", "wifi", "kids", "sunset"],
    images: [],
  },
  {
    id: "pickalbatros-blue-spa",
    name: "Pickalbatros Blue Spa",
    location: "Magawish · Hurghada",
    address: "Magawish, Hurghada, Red Sea, Egypt",
    lat: 27.1702,
    lng: 33.8251,
    stars: 5,
    description:
      "Version spa & bien-être de la gamme Pickalbatros : piscines, soins et formule All inclusive pour un séjour régénérant au bord de la Mer Rouge.",
    highlights: ["Focus spa", "All inclusive", "Piscines", "Détente"],
    amenities: ["spa", "pool", "beach", "restaurant", "wifi", "gym"],
    images: [],
  },
  {
    id: "pickalbatros-citadel-resort",
    name: "Pickalbatros Citadel Resort",
    location: "Hurghada",
    address: "Citadel Resort, Hurghada, Red Sea, Egypt",
    lat: 27.1925,
    lng: 33.8298,
    stars: 5,
    description:
      "Resort Citadel Pickalbatros aux lignes contemporaines, piscines et services All inclusive. Une adresse confortable pour découvrir Hurghada.",
    highlights: ["Architecture moderne", "Piscines", "All inclusive", "Animations"],
    amenities: ["pool", "beach", "restaurant", "wifi", "kids", "entertainment"],
    images: [],
  },
  {
    id: "pickalbatros-aqua-blue-resort",
    name: "Pickalbatros Aqua Blue Resort",
    location: "Madinat Makadi · Hurghada",
    address: "Madinat Makadi, Hurghada, Red Sea, Egypt",
    lat: 26.9912,
    lng: 33.8995,
    stars: 5,
    description:
      "Resort Pickalbatros à Madinat Makadi, connu pour ses espaces aquatiques et son All inclusive. Parfait pour les familles qui veulent mer, piscines et toboggans.",
    highlights: ["Madinat Makadi", "Espaces aquatiques", "All inclusive", "Familles"],
    amenities: ["waterpark", "beach", "pool", "kids", "restaurant", "wifi"],
    images: [],
  },
  {
    id: "pickalbatros-aqua-vista",
    name: "Pickalbatros Aqua Vista",
    location: "Magawish · Hurghada",
    address: "Aqua Vista, Magawish, Hurghada, Red Sea, Egypt",
    lat: 27.1728,
    lng: 33.8244,
    stars: 4,
    description:
      "Aqua Vista Pickalbatros : ambiance resort, piscines et All inclusive à Magawish. Un bon choix pour un séjour balnéaire sans prise de tête.",
    highlights: ["Piscines", "All inclusive", "Magawish", "Club enfants"],
    amenities: ["pool", "beach", "kids", "restaurant", "wifi", "entertainment"],
    images: [],
  },
  {
    id: "meraki-resort",
    name: "Meraki Resort",
    location: "Hurghada",
    address: "Meraki Resort, Hurghada, Red Sea, Egypt",
    lat: 27.1805,
    lng: 33.8285,
    stars: 5,
    description:
      "Resort Meraki à Hurghada : design soigné, All inclusive et atmosphère contemporaine pour des vacances mer & soleil.",
    highlights: ["Design contemporain", "All inclusive", "Piscines", "Plage"],
    amenities: ["beach", "pool", "spa", "restaurant", "wifi", "gym"],
    images: [],
  },
  {
    id: "sunrise-aqua-joy",
    name: "Sunrise Aqua Joy",
    location: "Magawish · Hurghada",
    address: "Magawish, Hurghada, Red Sea, Egypt",
    lat: 27.1761,
    lng: 33.8269,
    stars: 5,
    description:
      "Sunrise Aqua Joy, resort familial à Magawish avec espaces aquatiques, animations et All inclusive. Idéal pour des vacances joyeuses en famille.",
    highlights: ["Familles", "Espaces aquatiques", "All inclusive", "Animations"],
    amenities: ["waterpark", "kids", "pool", "restaurant", "wifi", "entertainment"],
    images: [],
  },
  {
    id: "jaz-aquamarine",
    name: "Jaz Aquamarine",
    location: "Madinat Makadi · Hurghada",
    address: "Madinat Makadi Bay, Hurghada, Red Sea, Egypt",
    lat: 26.9935,
    lng: 33.9012,
    stars: 5,
    description:
      "Jaz Aquamarine à Madinat Makadi : grand resort All inclusive, plage, piscines et offre familiale très complète sur la baie de Makadi.",
    highlights: ["Madinat Makadi", "Grande plage", "All inclusive", "Familles"],
    amenities: ["beach", "pool", "kids", "restaurant", "wifi", "spa"],
    images: [],
  },
  {
    id: "jaz-aqua-viva",
    name: "Jaz Aqua Viva",
    location: "Madinat Makadi · Hurghada",
    address: "Madinat Makadi Bay, Hurghada, Red Sea, Egypt",
    lat: 26.9958,
    lng: 33.9001,
    stars: 5,
    description:
      "Jaz Aqua Viva, resort All inclusive à Madinat Makadi orienté détente aquatique et vacances en famille sur la Mer Rouge.",
    highlights: ["All inclusive", "Piscines & mer", "Madinat Makadi", "Club enfants"],
    amenities: ["beach", "pool", "kids", "restaurant", "wifi", "entertainment"],
    images: [],
  },
  {
    id: "jaz-makadina",
    name: "Jaz Makadina",
    location: "Madinat Makadi · Hurghada",
    address: "Madinat Makadi, Hurghada, Red Sea, Egypt",
    lat: 26.9898,
    lng: 33.8982,
    stars: 5,
    description:
      "Jaz Makadina dans la baie de Makadi : All inclusive, plage et services resort pour un séjour balnéaire confortable à Hurghada.",
    highlights: ["Baie de Makadi", "All inclusive", "Plage", "Piscines"],
    amenities: ["beach", "pool", "restaurant", "wifi", "spa", "kids"],
    images: [],
  },
  {
    id: "amc-royal",
    name: "AMC Royal",
    location: "Hurghada",
    address: "AMC Royal Hotel, Hurghada, Red Sea, Egypt",
    lat: 27.2015,
    lng: 33.8352,
    stars: 5,
    description:
      "AMC Royal à Hurghada : resort All inclusive avec piscines, restauration et accès mer pour un séjour tout confort.",
    highlights: ["All inclusive", "Piscines", "Restauration", "Emplacement Hurghada"],
    amenities: ["pool", "beach", "restaurant", "wifi", "spa", "gym"],
    images: [],
  },
  {
    id: "bella-vista",
    name: "Bella Vista",
    location: "Magawish · Hurghada",
    address: "Bella Vista Resort, Magawish, Hurghada, Red Sea, Egypt",
    lat: 27.1695,
    lng: 33.8275,
    stars: 4,
    description:
      "Bella Vista Resort à Magawish : ambiance accueillante, All inclusive, piscines et proximité de la plage pour des vacances détente à Hurghada.",
    highlights: ["Magawish", "All inclusive", "Piscines", "Bon rapport confort"],
    amenities: ["pool", "beach", "restaurant", "wifi", "kids"],
    images: [],
  },
];

/** Dégradé de couverture (fallback quand aucune photo n’est fournie). */
export const HOTEL_DEFAULT_COVER =
  "linear-gradient(150deg, #a78bfa 0%, #7c3aed 48%, #4c1d95 100%)";

export function getHotelById(id) {
  const target = String(id || "").trim();
  return PUBLIC_HOTELS.find((h) => h.id === target) || null;
}

/** URL d’embed Google Maps (aucune clé API requise). */
export function getHotelMapEmbedUrl(hotel, { zoom = 16 } = {}) {
  let lat = Number(hotel?.lat);
  let lng = Number(hotel?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const parsed = parseLatLngFromMapsUrl(hotel?.mapsUrl || hotel?.maps_url);
    if (parsed) {
      lat = parsed.lat;
      lng = parsed.lng;
    }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const z = Math.min(20, Math.max(10, Number(zoom) || 16));
  return `https://www.google.com/maps?q=${lat},${lng}&z=${z}&hl=fr&output=embed`;
}

/** Lien pour ouvrir la position dans Google Maps (nouvel onglet). */
export function getHotelMapsOpenUrl(hotel) {
  const mapsUrl = String(hotel?.mapsUrl || hotel?.maps_url || "").trim();
  if (mapsUrl) return mapsUrl;
  const lat = Number(hotel?.lat);
  const lng = Number(hotel?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

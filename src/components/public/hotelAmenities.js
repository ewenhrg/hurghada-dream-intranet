import {
  Baby,
  Dumbbell,
  PartyPopper,
  Sparkles,
  Sunset,
  Umbrella,
  Utensils,
  Waves,
  Wifi,
} from "lucide-react";

export const WHATSAPP_BASE =
  "https://wa.me/201062002850?text=Bonjour%20Hurghada%20Dream%2C%20je%20suis%20int%C3%A9ress%C3%A9(e)%20par%20l%27h%C3%B4tel%20";

/** Libellé + icône Lucide pour chaque équipement. */
export const AMENITY_META = {
  beach: { label: "Plage privée", Icon: Umbrella },
  pool: { label: "Piscines", Icon: Waves },
  spa: { label: "Spa & bien-être", Icon: Sparkles },
  restaurant: { label: "Restauration", Icon: Utensils },
  wifi: { label: "Wi-Fi", Icon: Wifi },
  gym: { label: "Salle de sport", Icon: Dumbbell },
  waterpark: { label: "Parc aquatique", Icon: Waves },
  kids: { label: "Club enfants", Icon: Baby },
  entertainment: { label: "Animations", Icon: PartyPopper },
  sunset: { label: "Vue coucher de soleil", Icon: Sunset },
};

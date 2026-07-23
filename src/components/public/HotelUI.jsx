import { Building2, Star } from "lucide-react";
import { HOTEL_DEFAULT_COVER } from "../../data/publicHotels";
import { formatHotelAgePolicyLabel } from "../../utils/publicHotelsCatalog";
import { AMENITY_META } from "./hotelAmenities";

export function StarRow({ count = 0, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${count} étoiles`}>
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
      ))}
    </span>
  );
}

export function HotelCover({ hotel, className = "", iconClassName = "h-14 w-14" }) {
  const firstImage = Array.isArray(hotel.images) ? hotel.images[0] : null;
  if (firstImage) {
    return (
      <img src={firstImage} alt="" loading="lazy" className={`h-full w-full object-cover ${className}`} />
    );
  }
  return (
    <div className={`relative h-full w-full ${className}`} style={{ background: HOTEL_DEFAULT_COVER }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.55),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(255,255,255,0.25),transparent_40%)]"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <Building2 className={`text-white/85 drop-shadow-lg ${iconClassName}`} aria-hidden />
      </div>
    </div>
  );
}

export function AmenityChip({ amenity }) {
  const meta = AMENITY_META[amenity];
  if (!meta) return null;
  const { label, Icon } = meta;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-catalog-body shadow-sm">
      <Icon className="h-3.5 w-3.5 text-violet-600" aria-hidden />
      {label}
    </span>
  );
}

/** Politique d’âge bébé / enfant (catalogue public). */
export function HotelAgePolicyBadge({ hotel, className = "" }) {
  const label = formatHotelAgePolicyLabel(hotel);
  return (
    <p
      className={`rounded-xl border border-violet-200/80 bg-violet-50/90 px-3 py-2 text-xs font-semibold leading-snug text-violet-900 ${className}`}
    >
      {label}
    </p>
  );
}

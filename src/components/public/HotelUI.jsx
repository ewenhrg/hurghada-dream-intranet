import { Building2, Star } from "lucide-react";
import { formatHotelAgePolicyLabel } from "../../utils/publicHotelsCatalog";
import { AMENITY_META } from "./hotelAmenities";

/** Couverture de repli (sable doux), sans photo. */
export const HOTEL_FALLBACK_COVER = "linear-gradient(160deg, #EFE9DF 0%, #E4ECE9 100%)";

export function StarRow({ count = 0, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${count} étoiles`}>
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-3 w-3 fill-catalog-sand text-catalog-sand" aria-hidden />
      ))}
    </span>
  );
}

export function HotelCover({ hotel, className = "", iconClassName = "h-12 w-12" }) {
  const firstImage = Array.isArray(hotel.images) ? hotel.images[0] : null;
  if (firstImage) {
    return <img src={firstImage} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div className={`relative h-full w-full ${className}`} style={{ background: HOTEL_FALLBACK_COVER }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <Building2 className={`text-catalog-subtle ${iconClassName}`} strokeWidth={1.25} aria-hidden />
      </div>
    </div>
  );
}

export function AmenityChip({ amenity }) {
  const meta = AMENITY_META[amenity];
  if (!meta) return null;
  const { label, Icon } = meta;
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-catalog-bg px-3 text-xs font-medium text-catalog-body">
      <Icon className="h-3.5 w-3.5 text-catalog-lagoon" aria-hidden />
      {label}
    </span>
  );
}

/** Politique d’âge bébé / enfant (catalogue public). */
export function HotelAgePolicyBadge({ hotel, className = "" }) {
  const label = formatHotelAgePolicyLabel(hotel);
  return <p className={`text-xs font-medium leading-snug text-catalog-muted ${className}`}>{label}</p>;
}

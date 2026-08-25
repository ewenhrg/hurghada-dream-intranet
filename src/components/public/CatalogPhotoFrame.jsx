/**
 * Vignette catalogue : cadre toujours rempli (style Booking / Airbnb).
 * La lightbox conserve la photo entière au clic.
 */
export function CatalogPhotoFrame({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  loading = "lazy",
}) {
  if (!src) return null;
  return (
    <div className={`relative h-full w-full overflow-hidden bg-slate-950 ${className}`}>
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        draggable={false}
        className={`absolute inset-0 h-full w-full object-cover object-center ${imgClassName}`}
      />
    </div>
  );
}

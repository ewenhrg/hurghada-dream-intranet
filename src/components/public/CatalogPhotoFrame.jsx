import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Vignette catalogue : cadre toujours rempli (style Booking / Airbnb).
 * Apparition douce à la fin du chargement pour éviter les flashs blancs.
 * La lightbox conserve la photo entière au clic.
 */
export function CatalogPhotoFrame({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  loading = "lazy",
  fetchPriority,
  sizes = "(max-width: 768px) 100vw, 50vw",
}) {
  const imgRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReady(false);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) setReady(true);
  }, [src]);

  const markReady = useCallback(() => setReady(true), []);

  if (!src || failed) {
    return (
      <div
        className={`relative h-full w-full overflow-hidden bg-catalog-mist ${className}`}
        aria-hidden={failed || !src ? "true" : undefined}
      />
    );
  }

  return (
    <div className={`relative h-full w-full overflow-hidden bg-catalog-mist ${className}`}>
      {!ready ? <div aria-hidden className="hdc-skeleton absolute inset-0" /> : null}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        sizes={sizes}
        draggable={false}
        onLoad={markReady}
        onError={() => setFailed(true)}
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500 ease-out ${
          ready ? "opacity-100" : "opacity-0"
        } ${imgClassName}`}
      />
    </div>
  );
}

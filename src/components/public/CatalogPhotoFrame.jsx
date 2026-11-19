import { useCallback, useEffect, useRef, useState } from "react";

const SUPABASE_PUBLIC = "/storage/v1/object/public/";
const SUPABASE_RENDER = "/storage/v1/render/image/public/";
const WIDTHS = [400, 800, 1200];

/**
 * Photos Supabase : versions redimensionnées à la volée (WebP si le navigateur l’accepte)
 * au lieu de l’original (100–200 Ko). Le navigateur choisit la largeur via `sizes`.
 */
function supabaseSrcSet(src) {
  if (typeof src !== "string" || !src.includes(SUPABASE_PUBLIC) || !/\.supabase\.co\//.test(src)) return null;
  const base = src.replace(SUPABASE_PUBLIC, SUPABASE_RENDER).split("?")[0];
  return {
    src: `${base}?width=800&quality=70`,
    srcSet: WIDTHS.map((w) => `${base}?width=${w}&quality=70 ${w}w`).join(", "),
  };
}

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
  // Transformation refusée (quota, format) : retour à l’image d’origine.
  const [original, setOriginal] = useState(false);
  const resized = original ? null : supabaseSrcSet(src);

  useEffect(() => {
    setReady(false);
    setFailed(false);
    setOriginal(false);
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
        src={resized ? resized.src : src}
        srcSet={resized ? resized.srcSet : undefined}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        sizes={sizes}
        draggable={false}
        onLoad={markReady}
        onError={() => (resized ? setOriginal(true) : setFailed(true))}
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500 ease-out ${
          ready ? "opacity-100" : "opacity-0"
        } ${imgClassName}`}
      />
    </div>
  );
}

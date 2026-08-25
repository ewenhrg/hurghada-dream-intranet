import { useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Lightbox photos plein écran (catalogue public hôtels / activités) :
 * image en plein cadre, swipe, flèches stables, pastilles / miniatures.
 */
export function CatalogPhotoLightbox({
  open,
  images = [],
  index = 0,
  onIndexChange,
  onClose,
  altPrefix = "Photo",
}) {
  const count = Array.isArray(images) ? images.length : 0;
  const hasImages = count > 0;
  const safeIndex = hasImages ? Math.max(0, Math.min(Number(index) || 0, count - 1)) : 0;

  const indexRef = useRef(safeIndex);
  indexRef.current = safeIndex;

  const pointerStartX = useRef(null);
  const swipeLocked = useRef(false);

  const goTo = useCallback(
    (nextIndex) => {
      if (!hasImages || count < 1) return;
      const i = ((Number(nextIndex) % count) + count) % count;
      onIndexChange?.(i);
    },
    [hasImages, count, onIndexChange]
  );

  const prevImg = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      goTo(indexRef.current - 1);
    },
    [goTo]
  );

  const nextImg = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      goTo(indexRef.current + 1);
    },
    [goTo]
  );

  useEffect(() => {
    if (!open || !hasImages) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(indexRef.current - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(indexRef.current + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, hasImages, onClose, goTo]);

  if (!open || !hasImages) return null;

  const currentSrc = images[safeIndex];

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target?.closest?.("[data-lightbox-nav]")) {
      swipeLocked.current = true;
      pointerStartX.current = null;
      return;
    }
    swipeLocked.current = false;
    pointerStartX.current = e.clientX;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerUp = (e) => {
    if (swipeLocked.current) {
      swipeLocked.current = false;
      pointerStartX.current = null;
      return;
    }
    const startX = pointerStartX.current;
    pointerStartX.current = null;
    if (startX == null || count < 2) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < 48) return;
    if (dx < 0) goTo(indexRef.current + 1);
    else goTo(indexRef.current - 1);
  };

  const onPointerCancel = () => {
    pointerStartX.current = null;
    swipeLocked.current = false;
  };

  return (
    <div
      className="fixed inset-0 z-[220] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Galerie photos"
      onClick={onClose}
    >
      <div
        className="relative z-30 flex shrink-0 items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold tabular-nums text-white backdrop-blur-sm sm:text-sm">
          {safeIndex + 1} / {count}
        </p>
        <button
          type="button"
          data-lightbox-nav
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose?.();
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-lg transition active:scale-95 hover:bg-white"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div
        className="relative z-10 min-h-0 flex-1 touch-none select-none overflow-hidden bg-black"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* Fond flou pour remplir le cadre sans zoomer la photo */}
        <img
          key={`bg-${currentSrc}`}
          src={currentSrc}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
          draggable={false}
        />
        {/* Photo entière, non croppée */}
        <img
          key={currentSrc}
          src={currentSrc}
          alt={`${altPrefix} ${safeIndex + 1}`}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />

        {count > 1 ? (
          <>
            <button
              type="button"
              data-lightbox-nav
              onClick={prevImg}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute left-2 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/30 backdrop-blur-md transition active:scale-95 hover:bg-black/70 sm:left-4 sm:h-14 sm:w-14"
              aria-label="Photo précédente"
            >
              <ChevronLeft className="h-7 w-7" aria-hidden />
            </button>
            <button
              type="button"
              data-lightbox-nav
              onClick={nextImg}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-2 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/30 backdrop-blur-md transition active:scale-95 hover:bg-black/70 sm:right-4 sm:h-14 sm:w-14"
              aria-label="Photo suivante"
            >
              <ChevronRight className="h-7 w-7" aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div
          className="relative z-30 hidden shrink-0 border-t border-white/10 bg-black/85 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:block"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {images.map((src, idx) => (
              <button
                key={`${src}-${idx}`}
                type="button"
                data-lightbox-nav
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goTo(idx);
                }}
                className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                  idx === safeIndex
                    ? "ring-orange-400"
                    : "ring-transparent opacity-70 hover:opacity-100"
                }`}
                aria-label={`Voir la photo ${idx + 1}`}
                aria-current={idx === safeIndex ? "true" : undefined}
              >
                <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {count > 1 ? (
        <div
          className="relative z-30 flex shrink-0 items-center justify-center gap-1.5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((_, idx) => (
            <button
              key={`dot-${idx}`}
              type="button"
              data-lightbox-nav
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goTo(idx);
              }}
              className={`h-2 rounded-full transition ${
                idx === safeIndex ? "w-5 bg-orange-400" : "w-2 bg-white/40"
              }`}
              aria-label={`Photo ${idx + 1}`}
            />
          ))}
        </div>
      ) : (
        <div className="pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden" aria-hidden />
      )}
    </div>
  );
}

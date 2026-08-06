import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Lightbox photos plein écran (catalogue public hôtels / activités) :
 * swipe, flèches, pastilles mobile, miniatures desktop.
 *
 * @param {{
 *   open: boolean,
 *   images: string[],
 *   index: number,
 *   onIndexChange: (index: number) => void,
 *   onClose: () => void,
 *   altPrefix?: string,
 * }} props
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
  const safeIndex = hasImages ? Math.max(0, Math.min(index, count - 1)) : 0;

  const prevImg = useCallback(() => {
    if (!hasImages) return;
    onIndexChange((prev) => {
      const current = Math.max(0, Math.min(Number(prev) || 0, count - 1));
      return (current - 1 + count) % count;
    });
  }, [hasImages, count, onIndexChange]);

  const nextImg = useCallback(() => {
    if (!hasImages) return;
    onIndexChange((prev) => {
      const current = Math.max(0, Math.min(Number(prev) || 0, count - 1));
      return (current + 1) % count;
    });
  }, [hasImages, count, onIndexChange]);

  useEffect(() => {
    if (!open || !hasImages) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowLeft") prevImg();
      if (e.key === "ArrowRight") nextImg();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, hasImages, onClose, prevImg, nextImg]);

  if (!open || !hasImages) return null;

  const currentSrc = images[safeIndex];

  return (
    <div
      className="fixed inset-0 z-[220] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Galerie photos"
      onClick={onClose}
    >
      <div
        className="relative z-20 flex shrink-0 items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold tabular-nums text-white backdrop-blur-sm sm:text-sm">
          {safeIndex + 1} / {count}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-lg transition active:scale-95 hover:bg-white"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1 touch-pan-y"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          const t = e.changedTouches?.[0];
          if (t) e.currentTarget.dataset.touchX = String(t.clientX);
        }}
        onTouchEnd={(e) => {
          const start = Number(e.currentTarget.dataset.touchX || 0);
          const t = e.changedTouches?.[0];
          if (!t || !start) return;
          const dx = t.clientX - start;
          if (Math.abs(dx) < 50) return;
          if (dx < 0) nextImg();
          else prevImg();
        }}
      >
        <img
          src={currentSrc}
          alt={`${altPrefix} ${safeIndex + 1}`}
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={prevImg}
              className="absolute left-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/25 backdrop-blur-sm transition active:scale-95 hover:bg-black/60 sm:left-4 sm:h-14 sm:w-14"
              aria-label="Photo précédente"
            >
              <ChevronLeft className="h-7 w-7" aria-hidden />
            </button>
            <button
              type="button"
              onClick={nextImg}
              className="absolute right-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/25 backdrop-blur-sm transition active:scale-95 hover:bg-black/60 sm:right-4 sm:h-14 sm:w-14"
              aria-label="Photo suivante"
            >
              <ChevronRight className="h-7 w-7" aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div
          className="relative z-20 hidden shrink-0 border-t border-white/10 bg-black/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:block"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {images.map((src, idx) => (
              <button
                key={`${src}-${idx}`}
                type="button"
                onClick={() => onIndexChange(idx)}
                className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                  idx === safeIndex
                    ? "ring-orange-400"
                    : "ring-transparent opacity-70 hover:opacity-100"
                }`}
                aria-label={`Voir la photo ${idx + 1}`}
                aria-current={idx === safeIndex ? "true" : undefined}
              >
                <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {count > 1 ? (
        <div
          className="relative z-20 flex shrink-0 items-center justify-center gap-1.5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((_, idx) => (
            <button
              key={`dot-${idx}`}
              type="button"
              onClick={() => onIndexChange(idx)}
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

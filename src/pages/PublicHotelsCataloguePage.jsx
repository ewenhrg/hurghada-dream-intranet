import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Baby,
  Building2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  MapPin,
  PartyPopper,
  Sparkles,
  Star,
  Sunset,
  Umbrella,
  Utensils,
  Waves,
  Wifi,
  X,
} from "lucide-react";
import { PUBLIC_HOTELS, HOTEL_ACCENT_COVERS } from "../data/publicHotels";

const MotionDiv = motion.div;
const MotionArticle = motion.article;

const WHATSAPP_BASE =
  "https://wa.me/201062002850?text=Bonjour%20Hurghada%20Dream%2C%20je%20suis%20int%C3%A9ress%C3%A9(e)%20par%20l%27h%C3%B4tel%20";

/** Libellé + icône Lucide pour chaque équipement. */
const AMENITY_META = {
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

function StarRow({ count = 0 }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${count} étoiles`}>
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
      ))}
    </span>
  );
}

function HotelCover({ hotel, className = "", iconClassName = "h-14 w-14" }) {
  const cover = HOTEL_ACCENT_COVERS[hotel.accent] || HOTEL_ACCENT_COVERS.violet;
  const firstImage = Array.isArray(hotel.images) ? hotel.images[0] : null;
  if (firstImage) {
    return (
      <img
        src={firstImage}
        alt=""
        loading="lazy"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`relative h-full w-full ${className}`} style={{ background: cover }}>
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

function AmenityChip({ amenity }) {
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

function HotelDetailModal({ hotel, onClose, onRequest }) {
  const reduceMotion = useReducedMotion();
  const [slide, setSlide] = useState(0);
  const images = useMemo(
    () => (Array.isArray(hotel?.images) ? hotel.images : []),
    [hotel]
  );
  const hasImages = images.length > 0;

  useEffect(() => {
    setSlide(0);
  }, [hotel?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (hasImages && e.key === "ArrowLeft") setSlide((s) => (s - 1 + images.length) % images.length);
      if (hasImages && e.key === "ArrowRight") setSlide((s) => (s + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, hasImages, images.length]);

  if (typeof document === "undefined" || !hotel) return null;

  return createPortal(
    <AnimatePresence>
      <MotionDiv
        className="fixed inset-0 z-[220] flex items-end justify-center p-0 sm:items-center sm:p-6"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-[4px]"
          aria-label="Fermer"
          onClick={onClose}
        />
        <MotionDiv
          role="dialog"
          aria-modal="true"
          aria-labelledby="hd-hotel-title"
          initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-violet-200/70 bg-white shadow-2xl shadow-violet-950/25 sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cover */}
          <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-slate-100 sm:aspect-[16/8]">
            {hasImages ? (
              <img src={images[slide]} alt="" className="h-full w-full object-cover" />
            ) : (
              <HotelCover hotel={hotel} iconClassName="h-20 w-20" />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />

            {hasImages && images.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setSlide((s) => (s - 1 + images.length) % images.length)}
                  className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-lg transition hover:bg-white"
                  aria-label="Photo précédente"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSlide((s) => (s + 1) % images.length)}
                  className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-lg transition hover:bg-white"
                  aria-label="Photo suivante"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-lg transition hover:bg-white"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-center gap-2 text-white">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide backdrop-blur-sm">
                {hotel.badge}
              </span>
              <StarRow count={hotel.stars} />
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            <h2
              id="hd-hotel-title"
              className="font-catalog-display text-2xl font-semibold tracking-tight text-catalog-ink sm:text-3xl"
            >
              {hotel.name}
            </h2>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-catalog-muted">
              <MapPin className="h-4 w-4 text-violet-600" aria-hidden />
              {hotel.location}
            </p>

            <p className="mt-4 text-[15px] leading-relaxed text-catalog-body">
              {hotel.description}
            </p>

            {hotel.highlights?.length ? (
              <div className="mt-6">
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-[0.16em] text-catalog-label">
                  Points forts
                </h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {hotel.highlights.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-sm font-semibold text-catalog-body"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <ArrowRight className="h-3 w-3" aria-hidden />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {hotel.amenities?.length ? (
              <div className="mt-6">
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-[0.16em] text-catalog-label">
                  Équipements
                </h3>
                <div className="flex flex-wrap gap-2">
                  {hotel.amenities.map((a) => (
                    <AmenityChip key={a} amenity={a} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer CTA */}
          <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-7">
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={() => onRequest(hotel)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-5 py-3.5 text-sm font-bold text-white shadow-md shadow-violet-900/25 transition hover:from-violet-900 hover:to-orange-500"
              >
                Demander un devis
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <a
                href={`${WHATSAPP_BASE}${encodeURIComponent(hotel.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-emerald-500 bg-white px-5 py-3.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50"
              >
                WhatsApp
              </a>
            </div>
            <p className="mt-2.5 text-center text-xs font-medium text-catalog-subtle">
              Tarifs communiqués sur demande, selon vos dates et le nombre de voyageurs.
            </p>
          </div>
        </MotionDiv>
      </MotionDiv>
    </AnimatePresence>,
    document.body
  );
}

export function PublicHotelsCataloguePage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState(null);

  const goToRequest = () => navigate("/demande-hotel");

  return (
    <div className="hd-public-catalog relative isolate flex min-h-screen flex-col overflow-x-hidden bg-catalog-bg font-catalog-sans text-catalog-body antialiased selection:bg-violet-200/55 selection:text-catalog-ink">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-catalog-bg" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-catalog-mesh opacity-[0.42]" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-catalog-grid opacity-[0.16] [background-size:48px_48px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[min(70vh,500px)] bg-[radial-gradient(ellipse_90%_70%_at_50%_-18%,rgba(167,139,250,0.22),transparent_58%)]"
      />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-violet-500/25 bg-catalog-night/95 text-white shadow-[0_16px_48px_-12px_rgba(15,8,32,0.65)] backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-950 via-fuchsia-900 to-orange-600 p-1.5 shadow-xl shadow-violet-950/50 ring-2 ring-orange-300/50 ring-offset-2 ring-offset-catalog-night">
              <img src="/logo.png" alt="Hurghada Dream" className="relative h-full w-full object-contain drop-shadow-md" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-catalog-display text-lg font-semibold tracking-tight text-white">
                Hurghada Dream
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-violet-200/95">
                Hôtels · Mer Rouge
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={goToRequest}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 px-4 py-2.5 text-sm font-extrabold tracking-tight text-slate-950 shadow-[0_4px_22px_-4px_rgba(234,88,12,0.55)] ring-2 ring-orange-200/90 transition hover:from-orange-400 hover:to-amber-300 active:scale-[0.98]"
          >
            Demander un devis
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="catalog-shell relative z-10 border-b border-violet-200/50 bg-white">
        <div className="relative mx-auto max-w-4xl px-4 pb-14 pt-12 text-center sm:px-6 sm:pb-16 sm:pt-16">
          <span className="mb-6 inline-flex animate-catalog-in-up items-center gap-2 rounded-full border border-violet-300/70 bg-gradient-to-r from-white via-violet-50/95 to-orange-50/90 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.26em] text-violet-950 opacity-0 shadow-md shadow-violet-900/15 backdrop-blur-sm motion-reduce:animate-none motion-reduce:opacity-100 sm:text-[11px]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500 shadow-[0_0_12px_rgba(234,88,12,0.85)]" aria-hidden />
            Nos hôtels sélectionnés
          </span>
          <h1 className="catalog-title-glow mx-auto max-w-3xl animate-catalog-in-up font-catalog-display text-[2rem] font-semibold leading-[1.08] tracking-tight text-catalog-ink opacity-0 motion-reduce:animate-none motion-reduce:opacity-100 sm:text-[2.4rem] md:text-5xl md:leading-[1.06]" style={{ animationDelay: "70ms" }}>
            Votre séjour de rêve{" "}
            <span className="relative inline-block">
              <span className="relative z-10 font-semibold text-violet-700 [text-shadow:0_1px_0_rgba(255,255,255,0.95),0_2px_14px_rgba(109,40,217,0.28)]">
                à Hurghada
              </span>
              <span
                aria-hidden
                className="absolute -inset-x-1 -bottom-1 z-0 h-3 rounded-md bg-gradient-to-r from-orange-400/95 via-violet-300/85 to-fuchsia-200/50"
              />
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-catalog-in-up text-[15px] font-semibold leading-relaxed text-catalog-body opacity-0 motion-reduce:animate-none motion-reduce:opacity-100 sm:text-lg" style={{ animationDelay: "130ms" }}>
            Une sélection d’hôtels de confiance, au bord de la Mer Rouge. Découvrez chaque adresse,
            puis demandez votre devis personnalisé — sans engagement.
          </p>
        </div>
      </section>

      {/* Grille hôtels */}
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {PUBLIC_HOTELS.map((hotel, index) => (
            <MotionArticle
              key={hotel.id}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: Math.min(index * 0.08, 0.3), ease: [0.22, 1, 0.36, 1] }}
              className="catalog-elevated group flex h-full flex-col overflow-hidden rounded-[1.75rem] border-2 border-violet-200/70 bg-white shadow-catalog-premium transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-orange-400/70 hover:shadow-catalog-premium-hover"
            >
              <button
                type="button"
                onClick={() => setSelected(hotel)}
                className="relative block aspect-[5/4] w-full overflow-hidden bg-slate-100 text-left"
                aria-label={`Découvrir ${hotel.name}`}
              >
                <div className="absolute inset-0 transition duration-700 ease-out group-hover:scale-[1.06]">
                  <HotelCover hotel={hotel} />
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-900/10 to-transparent" />
                <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-slate-950/85 px-3 py-1.5 text-xs font-extrabold text-white shadow-lg backdrop-blur-sm">
                    {hotel.badge}
                  </span>
                </div>
                <div className="absolute inset-x-4 bottom-4 text-white">
                  <div className="mb-1">
                    <StarRow count={hotel.stars} />
                  </div>
                  <h2 className="font-catalog-display text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
                    {hotel.name}
                  </h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-white/90">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {hotel.location}
                  </p>
                </div>
              </button>

              <div className="flex grow flex-col p-5">
                <p className="font-catalog-display text-sm font-bold text-violet-800">
                  {hotel.tagline}
                </p>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-catalog-muted">
                  {hotel.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {hotel.amenities.slice(0, 3).map((a) => (
                    <AmenityChip key={a} amenity={a} />
                  ))}
                  {hotel.amenities.length > 3 ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-catalog-subtle">
                      +{hotel.amenities.length - 3}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setSelected(hotel)}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-white px-4 py-3 text-sm font-bold text-violet-800 transition hover:border-violet-400 hover:bg-violet-50"
                >
                  Découvrir l’hôtel
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                </button>
              </div>
            </MotionArticle>
          ))}
        </div>

        {/* Bandeau bas */}
        <div className="mt-14 overflow-hidden rounded-3xl border-2 border-violet-200/70 bg-gradient-to-br from-white via-violet-50/60 to-orange-50/50 p-7 text-center shadow-catalog-premium sm:p-10">
          <h2 className="font-catalog-display text-2xl font-semibold tracking-tight text-catalog-ink sm:text-3xl">
            Vous ne trouvez pas votre bonheur ?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-relaxed text-catalog-muted sm:text-base">
            Dites-nous vos envies : budget, dates, formule. Nous vous proposons l’hôtel idéal pour
            votre séjour à Hurghada.
          </p>
          <button
            type="button"
            onClick={goToRequest}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-violet-900/25 transition hover:from-violet-900 hover:to-orange-500"
          >
            Demander une offre personnalisée
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </main>

      <footer className="relative z-10 border-t-2 border-violet-200/60 bg-gradient-to-b from-white via-violet-50/40 to-catalog-bg py-14 text-center">
        <div className="mx-auto max-w-lg px-4">
          <p className="font-catalog-display text-sm font-semibold tracking-wide text-catalog-ink">
            Hurghada Dream
          </p>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-catalog-muted">
            Hôtels & séjours sur-mesure · Mer Rouge — une équipe locale à votre écoute.
          </p>
        </div>
      </footer>

      {/* WhatsApp flottant */}
      <a
        href={`${WHATSAPP_BASE}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg transition hover:scale-105 active:scale-95"
        aria-label="WhatsApp"
      >
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>

      {selected ? (
        <HotelDetailModal
          hotel={selected}
          onClose={() => setSelected(null)}
          onRequest={goToRequest}
        />
      ) : null}
    </div>
  );
}

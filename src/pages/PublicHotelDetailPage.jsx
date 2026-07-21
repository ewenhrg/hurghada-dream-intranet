import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MessageCircle,
  X,
} from "lucide-react";
import { getHotelById, HOTEL_ACCENT_COVERS } from "../data/publicHotels";
import { HotelCover, StarRow } from "../components/public/HotelUI";
import { AMENITY_META, WHATSAPP_BASE } from "../components/public/hotelAmenities";

/**
 * Fiche hôtel publique (style Booking) : galerie, description, équipements,
 * encart réservation collant. Aucun prix affiché.
 * @param {{ hotelId: string }} props
 */
export function PublicHotelDetailPage({ hotelId }) {
  const navigate = useNavigate();
  const hotel = useMemo(() => getHotelById(hotelId), [hotelId]);

  const images = useMemo(() => (Array.isArray(hotel?.images) ? hotel.images : []), [hotel]);
  const hasImages = images.length > 0;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const goToRequest = useCallback(() => navigate("/demande-hotel"), [navigate]);

  const openLightbox = useCallback(
    (index) => {
      if (!hasImages) return;
      setLightboxIndex(Math.max(0, Math.min(index, images.length - 1)));
      setLightboxOpen(true);
    },
    [hasImages, images.length]
  );
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const prevImg = useCallback(
    () => setLightboxIndex((i) => (i - 1 + images.length) % images.length),
    [images.length]
  );
  const nextImg = useCallback(
    () => setLightboxIndex((i) => (i + 1) % images.length),
    [images.length]
  );

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeLightbox();
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
  }, [lightboxOpen, closeLightbox, prevImg, nextImg]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [hotelId]);

  if (!hotel) {
    return (
      <div className="hd-public-catalog min-h-screen bg-catalog-bg px-4 py-20 text-center font-catalog-sans text-catalog-body">
        <p className="font-catalog-display text-lg font-semibold text-catalog-ink">
          Cet hôtel n’existe pas ou n’est plus disponible.
        </p>
        <Link
          to="/hotels"
          className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Retour aux hôtels
        </Link>
      </div>
    );
  }

  const accentCover = HOTEL_ACCENT_COVERS[hotel.accent] || HOTEL_ACCENT_COVERS.violet;

  const BookingCard = (
    <div className="rounded-2xl border border-violet-900/12 bg-white p-6 shadow-soft shadow-violet-950/12">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-catalog-label">Votre séjour</p>
      <p className="mt-2 text-2xl font-catalog-display font-semibold tracking-tight text-catalog-ink">
        Tarif sur demande
      </p>
      <p className="mt-1 text-sm leading-relaxed text-catalog-muted">
        Le prix dépend de vos dates et du nombre de voyageurs. Recevez une proposition claire, sans
        engagement.
      </p>

      <div className="mt-5 space-y-2.5">
        <button
          type="button"
          onClick={goToRequest}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-800 to-orange-600 px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-violet-900/25 transition hover:from-violet-900 hover:to-orange-500"
        >
          Demander un devis
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
        <a
          href={`${WHATSAPP_BASE}${encodeURIComponent(hotel.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-500 bg-white px-4 py-3.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Écrire sur WhatsApp
        </a>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-3.5 py-3 text-xs font-semibold text-emerald-800">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        Réponse rapide par une équipe locale, 7j/7.
      </div>
    </div>
  );

  return (
    <div className="hd-public-catalog relative isolate flex min-h-screen flex-col bg-catalog-bg font-catalog-sans text-catalog-body antialiased selection:bg-violet-200/55 selection:text-catalog-ink">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-catalog-bg" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-catalog-mesh opacity-[0.42]" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-catalog-grid opacity-[0.16] [background-size:48px_48px]"
      />

      {/* Header */}
      <header className="sticky top-0 z-[100] border-b border-violet-500/25 bg-catalog-night/95 text-white shadow-[0_16px_48px_-12px_rgba(15,8,32,0.65)] backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link
            to="/hotels"
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-violet-200/95 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Hôtels
          </Link>
          <div className="h-8 w-px bg-white/15" aria-hidden />
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-950 via-fuchsia-900 to-orange-600 p-1.5 shadow-lg ring-2 ring-orange-300/45 ring-offset-2 ring-offset-catalog-night">
              <img src="/logo.png" alt="" className="h-full w-full object-contain drop-shadow" />
            </div>
            <span className="font-catalog-display text-sm font-semibold text-white">Hurghada Dream</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-grow">
        {/* Galerie */}
        <section className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 lg:px-8">
          <nav className="mb-4 hidden sm:block">
            <ol className="flex items-center gap-1.5 text-xs font-semibold text-catalog-muted">
              <li>
                <Link to="/hotels" className="text-catalog-label transition-colors hover:text-violet-900">
                  Hôtels
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <span className="text-catalog-body">{hotel.name}</span>
              </li>
            </ol>
          </nav>

          {hasImages ? (
            <div className="grid gap-2 overflow-hidden rounded-3xl sm:grid-cols-[2fr_1fr] sm:gap-2">
              <button
                type="button"
                onClick={() => openLightbox(0)}
                className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 sm:aspect-[16/11]"
                aria-label="Agrandir la photo principale"
              >
                <img src={images[0]} alt="" className="h-full w-full object-cover transition hover:opacity-95" />
              </button>
              <div className="hidden grid-rows-2 gap-2 sm:grid">
                {[1, 2].map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => openLightbox(idx)}
                    className="relative overflow-hidden bg-slate-100"
                    aria-label={`Agrandir la photo ${idx + 1}`}
                  >
                    {images[idx] ? (
                      <img src={images[idx]} alt="" className="h-full w-full object-cover transition hover:opacity-95" />
                    ) : (
                      <div className="h-full w-full" style={{ background: accentCover }} />
                    )}
                    {idx === 2 && images.length > 3 ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">
                        +{images.length - 3} photos
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl bg-slate-100 sm:aspect-[16/7]">
              <HotelCover hotel={hotel} iconClassName="h-24 w-24" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent" />
              <span className="absolute bottom-4 left-4 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                Photos bientôt disponibles
              </span>
            </div>
          )}
        </section>

        {/* Titre + contenu */}
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3 lg:items-start">
            <div className="space-y-8 lg:col-span-2">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-violet-800">
                    {hotel.badge}
                  </span>
                  <StarRow count={hotel.stars} />
                </div>
                <h1 className="font-catalog-display text-3xl font-semibold tracking-tight text-catalog-ink sm:text-4xl">
                  {hotel.name}
                </h1>
                <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-catalog-muted">
                  <MapPin className="h-4 w-4 text-violet-600" aria-hidden />
                  {hotel.location}
                </p>
                <p className="mt-3 font-catalog-display text-lg font-semibold text-violet-800">
                  {hotel.tagline}
                </p>
              </div>

              {/* Encart réservation mobile */}
              <div className="lg:hidden">{BookingCard}</div>

              <section>
                <h2 className="font-catalog-display text-xl font-semibold text-catalog-ink">
                  À propos de l’hôtel
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-catalog-body">{hotel.description}</p>
              </section>

              {hotel.highlights?.length ? (
                <section>
                  <h2 className="font-catalog-display text-xl font-semibold text-catalog-ink">Points forts</h2>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {hotel.highlights.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 rounded-xl border border-violet-100 bg-white/80 px-4 py-3 text-sm font-semibold text-catalog-body shadow-sm"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                          <Check className="h-3 w-3" aria-hidden />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {hotel.amenities?.length ? (
                <section>
                  <h2 className="font-catalog-display text-xl font-semibold text-catalog-ink">Équipements & services</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {hotel.amenities.map((a) => {
                      const meta = AMENITY_META[a];
                      if (!meta) return null;
                      const { label, Icon } = meta;
                      return (
                        <div
                          key={a}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-catalog-body shadow-sm"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                            <Icon className="h-4.5 w-4.5" aria-hidden />
                          </span>
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {/* Emplacement (placeholder soigné, sans carte tierce) */}
              <section>
                <h2 className="font-catalog-display text-xl font-semibold text-catalog-ink">Emplacement</h2>
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/60 px-5 py-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
                    <Building2 className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-catalog-ink">{hotel.location}</p>
                    <p className="text-xs font-semibold text-catalog-muted">
                      Transferts et détails précis communiqués lors de votre demande.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Sidebar desktop */}
            <aside className="hidden lg:col-span-1 lg:block">
              <div className="lg:sticky lg:top-24">{BookingCard}</div>
            </aside>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t-2 border-violet-200/60 bg-gradient-to-b from-white via-violet-50/40 to-catalog-bg py-12 text-center">
        <p className="font-catalog-display text-sm font-semibold tracking-wide text-catalog-ink">Hurghada Dream</p>
        <p className="mx-auto mt-3 max-w-lg px-4 text-sm font-semibold leading-relaxed text-catalog-muted">
          Hôtels & séjours sur-mesure · Mer Rouge — une équipe locale à votre écoute.
        </p>
      </footer>

      {/* Barre CTA mobile fixe */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-violet-900/12 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(76,29,149,0.14)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {hotel.name}
            </p>
            <p className="font-catalog-display text-sm font-bold text-violet-800">Tarif sur demande</p>
          </div>
          <button
            type="button"
            onClick={goToRequest}
            className="whitespace-nowrap rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-violet-900/25 transition hover:from-violet-900 hover:to-orange-500"
          >
            Demander un devis
          </button>
        </div>
      </div>

      {lightboxOpen && hasImages ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-3 sm:p-6"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Galerie photos"
        >
          <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition hover:bg-white"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              {images.length > 1 ? (
                <button
                  type="button"
                  onClick={prevImg}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition hover:bg-white"
                  aria-label="Photo précédente"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}
              <div className="h-[60vh] min-h-[280px] w-full overflow-hidden rounded-2xl bg-slate-900">
                <img src={images[lightboxIndex]} alt="" className="h-full w-full object-contain" />
              </div>
              {images.length > 1 ? (
                <button
                  type="button"
                  onClick={nextImg}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition hover:bg-white"
                  aria-label="Photo suivante"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-center text-xs font-semibold text-white/85">
              {lightboxIndex + 1} / {images.length}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

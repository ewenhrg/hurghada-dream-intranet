import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, MapPin } from "lucide-react";
import { AmenityChip, HotelCover, StarRow } from "../components/public/HotelUI";
import { WHATSAPP_BASE } from "../components/public/hotelAmenities";
import { loadPublicHotelsCatalog } from "../utils/publicHotelsCatalog";

const MotionArticle = motion.article;

export function PublicHotelsCataloguePage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await loadPublicHotelsCatalog({ publishedOnly: true });
      if (!cancelled) {
        setHotels(result.hotels || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goToRequest = () => navigate("/demande-hotel");
  const openHotel = (id) => navigate(`/hotels/${encodeURIComponent(id)}`);

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
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-800" aria-hidden />
            <p className="font-catalog-display text-base font-semibold text-catalog-ink">
              Chargement des hôtels…
            </p>
          </div>
        ) : hotels.length === 0 ? (
          <div className="rounded-3xl border border-violet-200/70 bg-white px-6 py-16 text-center shadow-catalog-premium">
            <p className="font-catalog-display text-xl font-semibold text-catalog-ink">
              Aucun hôtel publié pour le moment
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-catalog-muted">
              Revenez bientôt, ou demandez une offre personnalisée.
            </p>
            <button
              type="button"
              onClick={goToRequest}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-6 py-3.5 text-sm font-bold text-white"
            >
              Demander une offre
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {hotels.map((hotel, index) => (
            <MotionArticle
              key={hotel.dbId || hotel.slug || hotel.id}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: Math.min(index * 0.08, 0.3), ease: [0.22, 1, 0.36, 1] }}
              className="catalog-elevated group flex h-full flex-col overflow-hidden rounded-[1.75rem] border-2 border-violet-200/70 bg-white shadow-catalog-premium transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-orange-400/70 hover:shadow-catalog-premium-hover"
            >
              <button
                type="button"
                onClick={() => openHotel(hotel.slug || hotel.id)}
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
                  {(hotel.amenities || []).slice(0, 3).map((a) => (
                    <AmenityChip key={a} amenity={a} />
                  ))}
                  {(hotel.amenities || []).length > 3 ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-catalog-subtle">
                      +{(hotel.amenities || []).length - 3}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => openHotel(hotel.slug || hotel.id)}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-white px-4 py-3 text-sm font-bold text-violet-800 transition hover:border-violet-400 hover:bg-violet-50"
                >
                  Découvrir l’hôtel
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                </button>
              </div>
            </MotionArticle>
          ))}
        </div>
        )}

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
    </div>
  );
}

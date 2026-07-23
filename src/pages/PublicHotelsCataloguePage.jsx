import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ShoppingBag } from "lucide-react";
import { AmenityChip, HotelAgePolicyBadge, HotelCover, StarRow } from "../components/public/HotelUI";
import { HotelsDevisCart } from "../components/public/HotelsDevisCart";
import { WHATSAPP_BASE } from "../components/public/hotelAmenities";
import { loadPublicHotelsCatalog } from "../utils/publicHotelsCatalog";
import { loadPublicHotelsCart } from "../utils/publicHotelsCartStorage";

const MotionArticle = motion.article;

function HotelCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-violet-100 bg-white shadow-sm">
      <div className="aspect-[5/4] animate-pulse bg-violet-100/80" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-48 max-w-full animate-pulse rounded bg-violet-100" />
        <div className="h-3 w-full animate-pulse rounded bg-violet-50" />
        <div className="h-3 w-40 max-w-full animate-pulse rounded bg-violet-50" />
        <div className="mt-4 h-11 animate-pulse rounded-2xl bg-violet-100" />
      </div>
    </div>
  );
}

export function PublicHotelsCataloguePage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stayHotel, setStayHotel] = useState(null);
  const [openDrawerSignal, setOpenDrawerSignal] = useState(0);
  const [cartCount, setCartCount] = useState(() => loadPublicHotelsCart().items.length);

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

  useEffect(() => {
    const sync = (e) => {
      const items = e?.detail?.items;
      setCartCount(Array.isArray(items) ? items.length : loadPublicHotelsCart().items.length);
    };
    window.addEventListener("hd-hotels-cart", sync);
    return () => window.removeEventListener("hd-hotels-cart", sync);
  }, []);

  const goToCustomOffer = () => navigate("/demande-hotel");
  const openHotel = (id) => navigate(`/hotels/${encodeURIComponent(id)}`);
  const openCart = () => setOpenDrawerSignal((n) => n + 1);

  return (
    <div className="hd-public-catalog relative isolate flex min-h-screen flex-col overflow-x-hidden bg-catalog-bg font-catalog-sans text-catalog-body antialiased selection:bg-violet-200/55 selection:text-catalog-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 bg-catalog-bg" />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 bg-catalog-mesh opacity-[0.42]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-catalog-grid opacity-[0.16] [background-size:48px_48px]"
      />

      <header className="sticky top-0 z-30 border-b border-violet-500/25 bg-catalog-night text-white shadow-[0_16px_48px_-12px_rgba(15,8,32,0.65)]">
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
                Hôtels · All inclusive
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCart}
            className="hidden min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 px-4 py-2.5 text-sm font-extrabold tracking-tight text-slate-950 shadow-[0_4px_22px_-4px_rgba(234,88,12,0.55)] ring-2 ring-orange-200/90 transition hover:from-orange-400 hover:to-amber-300 active:scale-[0.98] sm:inline-flex"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Panier</span>
            {cartCount > 0 ? (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-950 px-1.5 text-xs font-extrabold text-white">
                {cartCount}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <section className="relative z-10 border-b border-violet-200/50 bg-white">
        <div className="relative mx-auto max-w-4xl px-4 pb-8 pt-8 text-center sm:px-6 sm:pb-14 sm:pt-16">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.28em] text-violet-700 sm:mb-5 sm:text-[11px]">
            Sélection Mer Rouge
          </p>
          <h1 className="catalog-title-glow mx-auto max-w-3xl font-catalog-display text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-catalog-ink sm:text-[2.5rem] md:text-5xl md:leading-[1.05]">
            Hôtels All inclusive
            <span className="mt-0.5 block text-violet-700 sm:mt-1">à Hurghada</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-relaxed text-catalog-body sm:mt-5 sm:text-lg">
            Ajoutez jusqu’à 3 hôtels, indiquez dates & voyageurs, puis envoyez votre devis.
          </p>
          <div className="mx-auto mt-5 hidden max-w-md flex-wrap items-center justify-center gap-3 text-xs font-bold text-catalog-muted sm:mt-8 sm:flex">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800">
              <Check className="h-3.5 w-3.5" aria-hidden /> All inclusive
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-800">
              Jusqu’à 3 hôtels
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-orange-900">
              Réponse rapide
            </span>
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-3 py-8 pb-28 sm:px-6 sm:py-12 sm:pb-14 lg:px-8 lg:py-14">
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <HotelCardSkeleton />
            <HotelCardSkeleton />
            <HotelCardSkeleton />
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
              onClick={goToCustomOffer}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-6 py-3.5 text-sm font-bold text-white"
            >
              Demander une offre
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7">
            {hotels.map((hotel, index) => (
              <MotionArticle
                key={hotel.dbId || hotel.slug || hotel.id}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-32px" }}
                transition={{
                  duration: 0.4,
                  delay: Math.min(index * 0.06, 0.24),
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-violet-200/80 bg-white shadow-catalog-premium transition duration-300 ease-out sm:rounded-[1.75rem] hover:-translate-y-1 hover:border-violet-300 hover:shadow-catalog-premium-hover"
              >
                <button
                  type="button"
                  onClick={() => openHotel(hotel.slug || hotel.id)}
                  className="relative block aspect-[16/11] w-full overflow-hidden bg-slate-100 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 sm:aspect-[5/4]"
                  aria-label={`Découvrir ${hotel.name}`}
                >
                  <div className="absolute inset-0 transition duration-700 ease-out group-hover:scale-[1.04]">
                    <HotelCover hotel={hotel} />
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent" />
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800 shadow-sm">
                    All inclusive
                  </span>
                  <div className="absolute inset-x-3 bottom-3 text-white sm:inset-x-4 sm:bottom-4">
                    <StarRow count={hotel.stars} />
                    <h2 className="mt-1 font-catalog-display text-xl font-bold leading-tight tracking-tight !text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-2xl">
                      {hotel.name}
                    </h2>
                  </div>
                </button>

                <div className="flex grow flex-col p-4 sm:p-5">
                  <HotelAgePolicyBadge hotel={hotel} className="mb-3" />
                  {hotel.highlights?.length ? (
                    <ul className="space-y-1.5">
                      {hotel.highlights.slice(0, 2).map((h) => (
                        <li key={h} className="flex items-start gap-2 text-sm font-semibold text-catalog-body sm:hidden">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                          <span className="leading-snug">{h}</span>
                        </li>
                      ))}
                      {hotel.highlights.slice(0, 3).map((h) => (
                        <li key={`d-${h}`} className="hidden items-start gap-2 text-sm font-semibold text-catalog-body sm:flex">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                          <span className="leading-snug">{h}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="line-clamp-2 text-sm leading-relaxed text-catalog-muted sm:line-clamp-3">
                      {hotel.description}
                    </p>
                  )}

                  {(hotel.amenities || []).length > 0 ? (
                    <div className="mt-3 hidden flex-wrap gap-1.5 sm:mt-4 sm:flex">
                      {(hotel.amenities || []).slice(0, 3).map((a) => (
                        <AmenityChip key={a} amenity={a} />
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-auto grid gap-2 pt-4 sm:pt-5">
                    <button
                      type="button"
                      onClick={() => setStayHotel(hotel)}
                      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-4 text-sm font-bold text-white shadow-md shadow-violet-900/20 transition hover:brightness-110 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                    >
                      Ajouter au panier
                    </button>
                    <button
                      type="button"
                      onClick={() => openHotel(hotel.slug || hotel.id)}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 text-sm font-bold text-violet-800 transition hover:border-violet-400 hover:bg-violet-50 active:scale-[0.99]"
                    >
                      Voir la fiche
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </MotionArticle>
            ))}
          </div>
        )}

        <div className="mt-14 rounded-3xl border border-violet-200/70 bg-white px-6 py-10 text-center shadow-catalog-premium sm:px-10">
          <h2 className="font-catalog-display text-2xl font-semibold tracking-tight text-catalog-ink sm:text-3xl">
            Besoin d’une autre adresse ?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-relaxed text-catalog-muted sm:text-base">
            Décrivez vos dates et votre budget : nous vous proposons un hôtel All inclusive adapté.
          </p>
          <button
            type="button"
            onClick={goToCustomOffer}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-110"
          >
            Offre personnalisée
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </main>

      <footer className="relative z-10 hidden border-t border-violet-200/60 bg-white py-12 text-center sm:block">
        <p className="font-catalog-display text-sm font-semibold tracking-wide text-catalog-ink">
          Hurghada Dream
        </p>
        <p className="mx-auto mt-2 max-w-md px-4 text-sm font-semibold text-catalog-muted">
          Hôtels All inclusive · Mer Rouge — équipe locale, réponse rapide.
        </p>
      </footer>

      {/* Dock mobile : panier + WhatsApp */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-violet-200/80 bg-white/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_28px_rgba(76,29,149,0.12)] backdrop-blur-md sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-2 gap-2">
          <button
            type="button"
            onClick={openCart}
            className="relative inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-800 to-orange-600 px-3 text-sm font-bold text-white active:scale-[0.98]"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden />
            Panier
            {cartCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-950 px-1 text-[11px] font-extrabold text-white">
                {cartCount}
              </span>
            ) : null}
          </button>
          <a
            href={WHATSAPP_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-emerald-500 bg-emerald-50 px-3 text-sm font-bold text-emerald-800 active:scale-[0.98]"
          >
            WhatsApp
          </a>
        </div>
      </div>

      <a
        href={WHATSAPP_BASE}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:flex"
        aria-label="Contacter sur WhatsApp"
      >
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>

      <HotelsDevisCart
        stayHotel={stayHotel}
        onStayHotelHandled={() => setStayHotel(null)}
        openDrawerSignal={openDrawerSignal}
        hideFab
      />
    </div>
  );
}

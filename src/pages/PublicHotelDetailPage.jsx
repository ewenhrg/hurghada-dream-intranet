import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Expand, ExternalLink, MapPin, Plus, ShieldCheck, ShoppingBag } from "lucide-react";
import { getHotelMapEmbedUrl, getHotelMapsOpenUrl } from "../data/publicHotels";
import { GuestHeaderButton, PublicAppShell } from "../components/public/PublicAppShell";
import { HotelAgePolicyBadge, HotelCover, StarRow } from "../components/public/HotelUI";
import { HdLoader } from "../components/public/GuestPageLoader";
import { StateCard, WhatsAppGlyph } from "../components/public/PublicUI";
import { CatalogPhotoLightbox } from "../components/public/CatalogPhotoLightbox";
import { HotelsDevisCart } from "../components/public/HotelsDevisCart";
import { AMENITY_META, WHATSAPP_BASE } from "../components/public/hotelAmenities";
import { loadPublicHotelBySlug } from "../utils/publicHotelsCatalog";
import { loadPublicHotelsCart } from "../utils/publicHotelsCartStorage";

/**
 * Fiche hôtel publique (style Booking) : galerie, description, équipements,
 * encart réservation collant. Aucun prix affiché.
 * @param {{ hotelId: string }} props
 */
export function PublicHotelDetailPage({ hotelId }) {
  const [hotel, setHotel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const result = await loadPublicHotelBySlug(hotelId);
      if (!cancelled) {
        setHotel(result.hotel);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hotelId]);

  const images = useMemo(() => (Array.isArray(hotel?.images) ? hotel.images : []), [hotel]);
  const hasImages = images.length > 0;
  const mapEmbedUrl = useMemo(() => (hotel ? getHotelMapEmbedUrl(hotel) : null), [hotel]);
  const mapsOpenUrl = useMemo(() => (hotel ? getHotelMapsOpenUrl(hotel) : null), [hotel]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [stayHotel, setStayHotel] = useState(null);
  const [openDrawerSignal, setOpenDrawerSignal] = useState(0);
  const [cartCount, setCartCount] = useState(() => loadPublicHotelsCart().items.length);

  const requestDevis = useCallback(() => {
    if (hotel) setStayHotel(hotel);
  }, [hotel]);

  useEffect(() => {
    const sync = (e) => {
      const items = e?.detail?.items;
      setCartCount(Array.isArray(items) ? items.length : loadPublicHotelsCart().items.length);
    };
    window.addEventListener("hd-hotels-cart", sync);
    return () => window.removeEventListener("hd-hotels-cart", sync);
  }, []);

  const openLightbox = useCallback(
    (index) => {
      if (!hasImages) return;
      setLightboxIndex(Math.max(0, Math.min(index, images.length - 1)));
      setLightboxOpen(true);
    },
    [hasImages, images.length]
  );
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [hotelId]);

  if (loading) {
    return (
      <PublicAppShell title="Hôtel" wide revealKey="loading">
        <HdLoader label="Chargement de l’hôtel…" className="py-28" />
      </PublicAppShell>
    );
  }

  if (!hotel) {
    return (
      <PublicAppShell title="Hôtel" wide revealKey="missing">
        <div className="mx-auto max-w-lg px-4 py-10">
          <StateCard
            tone="error"
            title="Cet hôtel n’est plus disponible"
            action={
              <Link to="/hotels" data-press className="hdc-btn hdc-btn-ink">
                <ArrowLeft className="h-4 w-4" aria-hidden /> Tous les hôtels
              </Link>
            }
          >
            Il a peut-être été retiré du catalogue. Découvrez nos autres adresses.
          </StateCard>
        </div>
      </PublicAppShell>
    );
  }

    const BookingCard = (
    <div className="hdc-card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="hdc-eyebrow">Votre séjour</p>
        <span className="rounded-full bg-catalog-lagoonSoft px-2.5 py-1 text-[0.6875rem] font-semibold text-catalog-lagoon">All inclusive</span>
      </div>
      <p className="mt-3 font-catalog-display text-[1.625rem] leading-tight text-catalog-ink">
        Tarif <span className="hdc-serif">sur demande</span>
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-catalog-muted">
        Ajoutez l’hôtel avec vos dates et voyageurs, puis finalisez pour recevoir votre devis.
      </p>
      <div className="mt-5 space-y-2">
        <button type="button" data-press onClick={requestDevis} className="hdc-btn hdc-btn-primary w-full">
          <Plus className="h-4 w-4" aria-hidden />
          Ajouter au panier
        </button>
        <a
          href={`${WHATSAPP_BASE}${encodeURIComponent(hotel.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          data-press
          className="hdc-btn hdc-btn-ghost w-full"
        >
          <WhatsAppGlyph className="h-5 w-5 text-[#1F8F55]" />
          Écrire sur WhatsApp
        </a>
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-catalog-muted">
        <ShieldCheck className="h-4 w-4 shrink-0 text-catalog-lagoon" aria-hidden />
        Réponse rapide par une équipe locale, 7j/7.
      </p>
    </div>
  );

  return (
    <PublicAppShell
      title={hotel.name}
      wide
      revealKey={hotel.slug || hotel.id}
      right={
        <GuestHeaderButton onClick={() => setOpenDrawerSignal((n) => n + 1)} count={cartCount} ariaLabel="Panier">
          <ShoppingBag className="h-4 w-4" aria-hidden />
        </GuestHeaderButton>
      }
    >
      <main className="relative z-10 pb-16">
        {/* Photo principale (cible du vol photo depuis la liste) */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div data-hero-media className="relative h-[clamp(340px,52vh,520px)] overflow-hidden rounded-[1.25rem] bg-catalog-mist">
            <button
              type="button"
              onClick={() => openLightbox(0)}
              disabled={!hasImages}
              className="absolute inset-0 block h-full w-full"
              aria-label="Agrandir la photo principale"
            >
              <div data-hero-img className="absolute inset-0">
                {hasImages ? (
                  <img data-kenburns src={images[0]} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <HotelCover hotel={hotel} iconClassName="h-16 w-16" />
                )}
              </div>
            </button>
            {hasImages ? (
              <span className="pointer-events-none absolute bottom-4 right-4 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white/90 px-3 text-xs font-semibold text-catalog-ink">
                <Expand className="h-3.5 w-3.5" aria-hidden />
                {images.length} photo{images.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>

          {hasImages && images.length > 1 ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {images.slice(1, 8).map((src, i) => (
                <button
                  key={src}
                  type="button"
                  data-press
                  onClick={() => openLightbox(i + 1)}
                  className="h-16 w-20 shrink-0 overflow-hidden rounded-xl p-0"
                  aria-label={`Agrandir la photo ${i + 2}`}
                >
                  <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3 lg:items-start">
            <div className="space-y-10 lg:col-span-2">
              <div>
                <StarRow count={hotel.stars} />
                <h1 data-split className="mt-2 font-catalog-display text-[2rem] leading-[1.1] text-catalog-ink">
                  {hotel.name}
                </h1>
                {hotel.location ? (
                  <p data-reveal="item" className="mt-2 flex items-center gap-1.5 text-sm text-catalog-muted">
                    <MapPin className="h-4 w-4 text-catalog-lagoon" aria-hidden />
                    {hotel.location}
                  </p>
                ) : null}
                <div data-reveal="item">
                  <HotelAgePolicyBadge hotel={hotel} className="mt-3 max-w-md" />
                </div>
              </div>

              <div data-reveal="item" className="lg:hidden">{BookingCard}</div>

              <section data-reveal="item">
                <p className="hdc-eyebrow">L’adresse</p>
                <h2 className="mt-1.5 font-catalog-display text-[1.5rem] leading-tight">À propos de l’hôtel</h2>
                <p className="mt-3 text-[0.9375rem] leading-[1.75] text-catalog-body">{hotel.description}</p>
              </section>

              {hotel.highlights?.length ? (
                <section data-reveal="item">
                  <p className="hdc-eyebrow">On aime</p>
                  <h2 className="mt-1.5 font-catalog-display text-[1.5rem] leading-tight">Points forts</h2>
                  <ul className="mt-4 divide-y divide-catalog-line border-y border-catalog-line">
                    {hotel.highlights.map((item) => (
                      <li key={item} className="flex items-start gap-3 py-3.5 text-[0.9375rem] text-catalog-body">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-catalog-lagoon" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {hotel.amenities?.length ? (
                <section data-reveal="item">
                  <p className="hdc-eyebrow">Sur place</p>
                  <h2 className="mt-1.5 font-catalog-display text-[1.5rem] leading-tight">Équipements & services</h2>
                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {hotel.amenities.map((a) => {
                      const meta = AMENITY_META[a];
                      if (!meta) return null;
                      const { label, Icon } = meta;
                      return (
                        <div key={a} className="flex items-center gap-3 rounded-[1rem] bg-white px-3.5 py-3 text-sm text-catalog-body ring-1 ring-catalog-line">
                          <Icon className="h-5 w-5 shrink-0 text-catalog-lagoon" strokeWidth={1.5} aria-hidden />
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section data-reveal="item">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="hdc-eyebrow">Localisation</p>
                    <h2 className="mt-1.5 font-catalog-display text-[1.5rem] leading-tight">Emplacement</h2>
                  </div>
                  {mapsOpenUrl ? (
                    <a href={mapsOpenUrl} target="_blank" rel="noopener noreferrer" data-press className="hdc-btn hdc-btn-ghost !min-h-11 !px-4 text-sm">
                      Google Maps
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
                <div className="hdc-card overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-4">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-catalog-lagoon" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-catalog-ink">{hotel.name}</p>
                      <p className="mt-0.5 text-sm leading-snug text-catalog-muted">{hotel.address || hotel.location}</p>
                    </div>
                  </div>
                  {mapEmbedUrl ? (
                    <div className="relative aspect-[16/11] w-full bg-catalog-mist sm:aspect-[16/9]">
                      <iframe
                        title={`Carte Google Maps — ${hotel.name}`}
                        src={mapEmbedUrl}
                        className="absolute inset-0 h-full w-full border-0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div className="px-5 py-8 text-center text-sm text-catalog-muted">Carte indisponible pour cet hôtel.</div>
                  )}
                </div>
              </section>
            </div>

            <aside className="hidden lg:col-span-1 lg:block">
              <div className="lg:sticky lg:top-28">{BookingCard}</div>
            </aside>
          </div>
        </section>
      </main>

      <HotelsDevisCart
        stayHotel={stayHotel}
        onStayHotelHandled={() => setStayHotel(null)}
        openDrawerSignal={openDrawerSignal}
        hideFab
      />

      <CatalogPhotoLightbox
        open={lightboxOpen}
        images={images}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={closeLightbox}
        altPrefix={hotel?.name || "Hôtel"}
      />
    </PublicAppShell>
  );
}

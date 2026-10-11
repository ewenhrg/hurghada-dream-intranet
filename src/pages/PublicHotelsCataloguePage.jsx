import { memo, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GuestHeaderButton, PublicAppShell } from "../components/public/PublicAppShell";
import { ArrowRight, MapPin, Plus, ShoppingBag } from "lucide-react";
import { AmenityChip, HotelAgePolicyBadge, HotelCover, StarRow } from "../components/public/HotelUI";
import { HotelsDevisCart } from "../components/public/HotelsDevisCart";
import { StateCard, WhatsAppFab } from "../components/public/PublicUI";
import { startPhotoFlight } from "../components/public/motion";
import { WHATSAPP_BASE } from "../components/public/hotelAmenities";
import { loadPublicHotelsCatalog } from "../utils/publicHotelsCatalog";
import { loadPublicHotelsCart } from "../utils/publicHotelsCartStorage";

function HotelCardSkeleton() {
  return (
    <div aria-hidden className="hdc-card overflow-hidden">
      <div className="hdc-skeleton aspect-[4/3]" />
      <div className="space-y-3 p-5">
        <div className="hdc-skeleton h-3 w-24 rounded-full" />
        <div className="hdc-skeleton h-7 w-4/5 rounded-md" />
        <div className="hdc-skeleton h-4 w-full rounded-md" />
        <div className="grid grid-cols-2 gap-2 pt-3">
          <div className="hdc-skeleton h-12 rounded-full" />
          <div className="hdc-skeleton h-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

const PublicHotelCatalogueCard = memo(function PublicHotelCatalogueCard({ hotel, onOpen, onAddToCart }) {
  const open = (event) => {
    startPhotoFlight(event.currentTarget.closest("article")?.querySelector("[data-card-media] img"));
    onOpen(hotel.slug || hotel.id);
  };
  return (
    <article data-reveal="card" className="hdc-card overflow-hidden">
      <button
        type="button"
        data-press
        onClick={open}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-catalog-mist text-left"
        aria-label={`Découvrir ${hotel.name}`}
      >
        <div data-card-media className="absolute inset-0 overflow-hidden">
          <HotelCover hotel={hotel} />
        </div>
        <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[0.6875rem] font-semibold text-catalog-ink">
          All inclusive
        </span>
      </button>

      <div className="p-5">
        <StarRow count={hotel.stars} />
        <h2 className="mt-2 font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">{hotel.name}</h2>
        {hotel.location ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-catalog-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {hotel.location}
          </p>
        ) : null}
        {hotel.highlights?.length ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-catalog-body">{hotel.highlights.slice(0, 3).join(" · ")}</p>
        ) : (
          <p className="mt-3 line-clamp-2 text-[0.9375rem] leading-relaxed text-catalog-body">{hotel.description}</p>
        )}
        {(hotel.amenities || []).length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {(hotel.amenities || []).slice(0, 3).map((a) => (
              <AmenityChip key={a} amenity={a} />
            ))}
          </div>
        ) : null}
        <HotelAgePolicyBadge hotel={hotel} className="mt-4" />
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" data-press onClick={open} className="hdc-btn hdc-btn-ghost">
            Voir la fiche
          </button>
          <button type="button" data-press onClick={() => onAddToCart(hotel)} className="hdc-btn hdc-btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            Ajouter
          </button>
        </div>
      </div>
    </article>
  );
});

export function PublicHotelsCataloguePage() {
  const navigate = useNavigate();
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stayHotel, setStayHotel] = useState(null);
  const [openDrawerSignal, setOpenDrawerSignal] = useState(0);
  const [openCustomOfferSignal, setOpenCustomOfferSignal] = useState(0);
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

  const goToCustomOffer = () => setOpenCustomOfferSignal((n) => n + 1);
  const openHotel = useCallback(
    (id) => navigate(`/hotels/${encodeURIComponent(id)}`),
    [navigate]
  );
  const openCart = () => setOpenDrawerSignal((n) => n + 1);

  return (
    <PublicAppShell
      title="Hôtels"
      wide
      revealKey={loading ? "loading" : hotels.length}
      right={
        <GuestHeaderButton onClick={openCart} count={cartCount} ariaLabel="Panier">
          <ShoppingBag className="h-4 w-4" aria-hidden />
        </GuestHeaderButton>
      }
    >
      <section className="mx-auto max-w-6xl px-4 pb-2 pt-4 sm:px-6 lg:px-8">
        <p data-reveal="item" className="hdc-eyebrow">Sélection Mer Rouge</p>
        <h1 data-split className="mt-2 font-catalog-display text-[2rem] leading-[1.1] text-catalog-ink">
          Hôtels all inclusive, <span className="hdc-serif text-catalog-lagoon">face à la mer.</span>
        </h1>
        <p data-reveal="item" className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-catalog-muted">
          Ajoutez jusqu’à 3 hôtels, indiquez vos dates et voyageurs, puis recevez votre devis.
        </p>
      </section>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        <button
          type="button"
          data-reveal="item"
          data-press
          onClick={goToCustomOffer}
          className="mb-6 flex w-full items-center gap-4 rounded-[1.25rem] bg-catalog-lagoonSoft p-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-catalog-lagoon">Sans préférence d’hôtel</span>
            <span className="mt-0.5 block font-catalog-display text-[1.25rem] leading-snug text-catalog-ink">
              Recevoir une proposition sur mesure
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-catalog-lagoon" aria-hidden />
        </button>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <HotelCardSkeleton />
            <HotelCardSkeleton />
            <div className="hidden lg:block">
              <HotelCardSkeleton />
            </div>
          </div>
        ) : hotels.length === 0 ? (
          <StateCard
            title="Aucun hôtel publié pour le moment"
            action={
              <button type="button" data-press onClick={goToCustomOffer} className="hdc-btn hdc-btn-primary">
                Demander une offre
              </button>
            }
          >
            Revenez bientôt, ou demandez une offre personnalisée.
          </StateCard>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7">
            {hotels.map((hotel) => (
              <PublicHotelCatalogueCard
                key={hotel.dbId || hotel.slug || hotel.id}
                hotel={hotel}
                onOpen={openHotel}
                onAddToCart={setStayHotel}
              />
            ))}
          </div>
        )}

        <div data-reveal="item" className="mt-10 rounded-[1.25rem] bg-catalog-brassSoft p-6">
          <p className="hdc-eyebrow !text-catalog-brass">Sur mesure</p>
          <h2 data-heading className="mt-2 font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">Besoin d’une autre adresse&nbsp;?</h2>
          <p className="mt-2 max-w-xl text-[0.9375rem] leading-relaxed text-catalog-muted">
            Décrivez vos dates et votre budget : nous vous proposons un hôtel all inclusive adapté.
          </p>
          <button type="button" data-press onClick={goToCustomOffer} className="hdc-btn hdc-btn-ink mt-5">
            Offre personnalisée
          </button>
        </div>
      </main>

      <WhatsAppFab href={WHATSAPP_BASE} label="Contacter sur WhatsApp" />

      <HotelsDevisCart
        stayHotel={stayHotel}
        onStayHotelHandled={() => setStayHotel(null)}
        openDrawerSignal={openDrawerSignal}
        openCustomOfferSignal={openCustomOfferSignal}
        hideFab
      />
    </PublicAppShell>
  );
}

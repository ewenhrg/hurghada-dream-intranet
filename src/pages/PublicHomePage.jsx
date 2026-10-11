import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Headset,
  Hotel,
  MapPin,
  Phone,
  Sun,
} from "lucide-react";
import { HomeReviewsMarquee } from "../components/public/HomeReviewsMarquee";
import { fetchInstagramReels, InstagramReelsRail } from "../components/public/InstagramReelsRail";
import { PublicAppShell } from "../components/public/PublicAppShell";
import { StarRow } from "../components/public/HotelUI";
import { WhatsAppGlyph } from "../components/public/PublicUI";
import {
  gsap,
  prefersReducedMotion,
  ScrollTrigger,
  startPhotoFlight,
  useGSAP,
  useHeroArrival,
} from "../components/public/motion";
import { useHurghadaWeather } from "../hooks/useHurghadaWeather";
import { loadPublicHotelsCatalog } from "../utils/publicHotelsCatalog";

const AGENCY_WHATSAPP_URL = "https://wa.me/201062002850?text=Bonjour%20Hurghada%20Dream%2C%20";
const AGENCY_MAPS_URL = "https://maps.app.goo.gl/qcx9LvVG3QwKUWyWA";
const AGENCY_MAP_EMBED = "https://www.google.com/maps?q=27.1893675,33.8324796&z=16&hl=fr&output=embed";
const HERO_IMAGE = "/client/home-hero-red-sea.jpg";
const TILE_EXCURSIONS = "/client/home-tile-excursions.jpg";
const TILE_STAY = "/client/home-tile-stay-calendar.jpg";
const heroReelsPromise = fetchInstagramReels();
/** Réel du hero. L’affiche du réel est visible tout de suite, la lecture démarre dès que possible. */
function HeroReel({ reel }) {
  const videoRef = useRef(null);
  const still = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    const node = videoRef.current;
    if (!node || still) return undefined;
    node.muted = true;
    const play = () => {
      node.play().catch(() => {});
    };
    play();
    node.addEventListener("loadeddata", play);
    return () => node.removeEventListener("loadeddata", play);
  }, [reel.video, still]);

  return (
    <div className="hdc-hero-reel relative h-full shrink-0 snap-start overflow-hidden">
      <video
        ref={videoRef}
        src={reel.video}
        poster={reel.image}
        autoPlay={!still}
        muted
        loop
        playsInline
        preload="auto"
        referrerPolicy="no-referrer"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 || h >= 18 ? "Bonsoir" : "Bonjour";
}

function WeatherIcon({ code, className }) {
  const c = Number(code);
  if (c === 0) return <Sun className={className} strokeWidth={1.75} aria-hidden />;
  if (c === 1 || c === 2) return <CloudSun className={className} strokeWidth={1.75} aria-hidden />;
  if (c === 3 || c === 45 || c === 48) return <Cloud className={className} strokeWidth={1.75} aria-hidden />;
  if (c >= 95) return <CloudLightning className={className} strokeWidth={1.75} aria-hidden />;
  if (c >= 51) return <CloudRain className={className} strokeWidth={1.75} aria-hidden />;
  return <Sun className={className} strokeWidth={1.75} aria-hidden />;
}

/** Puce « verre dépoli » posée sur la photo du hero. */
function GlassChip({ children }) {
  return (
    <span
      data-hero-chip
      className="inline-flex min-h-9 items-center gap-2 rounded-full bg-white/15 px-3 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur-md"
    >
      {children}
    </span>
  );
}

export function PublicHomePage() {
  const navigate = useNavigate();
  const [hotels, setHotels] = useState([]);
  const [heroReels, setHeroReels] = useState([]);
  const [reelsSettled, setReelsSettled] = useState(false);
  const weather = useHurghadaWeather();
  const hello = useMemo(() => greeting(), []);
  const heroRef = useRef(null);
  const heroScrollRef = useRef(null);
  const railRef = useRef(null);
  const railDragRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await loadPublicHotelsCatalog({ publishedOnly: true });
      if (!cancelled) setHotels(result.hotels || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hotelsWithPhoto = useMemo(() => hotels.filter((h) => Array.isArray(h.images) && h.images[0]), [hotels]);
  const hotelPhoto = hotelsWithPhoto[0]?.images[0] || null;

  useEffect(() => {
    let cancelled = false;
    heroReelsPromise.then((list) => {
      if (cancelled) return;
      setHeroReels(list.filter((reel) => reel.video).slice(0, 12));
      setReelsSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const root = heroScrollRef.current;
    if (!root || heroReels.length < 3 || prefersReducedMotion()) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          if (!(video instanceof HTMLVideoElement)) return;
          if (entry.isIntersecting) {
            video.muted = true;
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { root, threshold: 0.35 }
    );
    root.querySelectorAll("video").forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, [heroReels]);

  const actions = [
    { to: "/catalogue", title: "Excursions", subtitle: "Mer, désert, Louxor", image: TILE_EXCURSIONS },
    { to: "/hotels", title: "Hôtels", subtitle: "All inclusive, en bord de mer", image: hotelPhoto || HERO_IMAGE },
  ];

  /* L’ouverture attend les 3 réels, pour ne pas dévoiler la photo de secours avant eux. */
  useHeroArrival(heroRef, heroReels.length >= 3 || reelsSettled);

  /* ——— Carrousel « Nos adresses » : parallaxe horizontale dans chaque photo ——— */
  useGSAP(
    () => {
      const rail = railRef.current;
      if (!rail || !hotelsWithPhoto.length) return undefined;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
      const cards = Array.from(rail.querySelectorAll("[data-rail-card]"));
      const setters = cards.map((c) => gsap.quickSetter(c.querySelector("img"), "xPercent"));
      const update = () => {
        const mid = rail.scrollLeft + rail.clientWidth / 2;
        cards.forEach((card, i) => {
          const center = card.offsetLeft + card.offsetWidth / 2;
          setters[i](gsap.utils.clamp(-12, 12, ((center - mid) / rail.clientWidth) * -14));
        });
      };
      cards.forEach((c) => gsap.set(c.querySelector("img"), { scale: 1.25 }));
      update();
      rail.addEventListener("scroll", update, { passive: true });
      gsap.fromTo(
        cards,
        { x: 60, autoAlpha: 0 },
        {
          x: 0,
          autoAlpha: 1,
          duration: 0.9,
          ease: "expo.out",
          stagger: 0.07,
          scrollTrigger: { trigger: rail, start: "top 90%", once: true },
        }
      );
      ScrollTrigger.refresh();
      return () => rail.removeEventListener("scroll", update);
    },
    { dependencies: [hotelsWithPhoto.length], scope: railRef }
  );

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let axis = null;
    const onStart = (event) => {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      startScroll = rail.scrollLeft;
      axis = null;
      railDragRef.current = false;
    };
    const onMove = (event) => {
      if (event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (axis !== "x") return;
      rail.scrollLeft = startScroll - dx;
      if (Math.abs(dx) > 10) railDragRef.current = true;
    };
    const onClickCapture = (event) => {
      if (!railDragRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      railDragRef.current = false;
    };
    rail.addEventListener("touchstart", onStart, { passive: true });
    rail.addEventListener("touchmove", onMove, { passive: true });
    rail.addEventListener("click", onClickCapture, true);
    return () => {
      rail.removeEventListener("touchstart", onStart);
      rail.removeEventListener("touchmove", onMove);
      rail.removeEventListener("click", onClickCapture, true);
    };
  }, [hotelsWithPhoto.length]);

  const openHotel = (event, hotel) => {
    if (railDragRef.current) return;
    startPhotoFlight(event.currentTarget.querySelector("img"));
    navigate(`/hotels/${encodeURIComponent(hotel.slug || hotel.id)}`);
  };

  const desktopNav = (
    <nav aria-label="Navigation" className="flex items-center gap-1">
      {[
        ["/catalogue", "Excursions"],
        ["/hotels", "Hôtels"],
        ["/sejour", "Mon séjour"],
        ["/contacts", "Contacts"],
      ].map(([to, label]) => (
        <Link
          key={to}
          to={to}
          className="inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold text-catalog-ink hover:bg-white"
        >
          {label}
        </Link>
      ))}
    </nav>
  );

  return (
    <PublicAppShell title="Accueil" wide="xl" nav={desktopNav}>
      {/* ——— Hero « horizon » ——— */}
      <section ref={heroRef} className="hdc-hero-screen relative">
        {/* Grand bleu derrière l’ouverture : l’horizon se trace sur la mer avant que l’image s’ouvre. */}
        <div aria-hidden className="absolute inset-0 bg-catalog-abyss" />
        <div
          data-hero-frame
          className="relative h-full overflow-hidden bg-catalog-raised"
        >
          <div data-hero-stage className="absolute inset-0 bg-catalog-abyss">
            {heroReels.length >= 3 ? (
              <div ref={heroScrollRef} className="hdc-hero-reels absolute inset-0" aria-label="Réels Instagram">
                {heroReels.map((reel) => (
                  <HeroReel key={reel.id} reel={reel} />
                ))}
              </div>
            ) : reelsSettled ? (
              <img src={HERO_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-1/2" data-veil-top />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-1/2" data-veil-bottom />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[3] bg-[linear-gradient(180deg,rgba(10,42,51,0.32)_0%,rgba(10,42,51,0)_30%,rgba(11,79,92,0.18)_55%,rgba(8,36,46,0.88)_100%)]" />

          <div data-hero-copy className="pointer-events-none absolute inset-x-5 bottom-16 z-[5] lg:inset-x-0 lg:bottom-20">
            <div className="lg:mx-auto lg:max-w-7xl lg:px-8">
            <p data-hero-eyebrow className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-white/85">
              <span data-hero-rule className="h-px w-6 origin-left bg-catalog-sand" />
              Hurghada · Mer Rouge
            </p>
            <h1 data-hero-title className="hdc-hero-title mt-3 text-[2.85rem] leading-[0.98] !text-white sm:text-6xl lg:max-w-5xl lg:text-[5.25rem]">
              {hello}, <span className="hdc-hero-accent text-catalog-sand">bienvenue</span> en mer Rouge.
            </h1>
            <p data-hero-sub className="mt-3 max-w-xs text-[0.9375rem] leading-relaxed text-white/85 lg:max-w-xl lg:text-lg">
              Hôtels d’exception, excursions privées et votre séjour orchestré par la référence locale.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {weather ? (
                <GlassChip>
                  <WeatherIcon code={weather.code} className="h-4 w-4" />
                  <span className="tabular-nums">{weather.celsius}°</span>
                  <span className="font-medium text-white/80">{weather.label}</span>
                </GlassChip>
              ) : null}
              {hotels.length ? (
                <GlassChip>
                  <Hotel className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {hotels.length} hôtels sélectionnés
                </GlassChip>
              ) : null}
              <GlassChip>
                <Headset className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Équipe française 7j/7
              </GlassChip>
            </div>
            </div>
          </div>
        </div>
        {/* Invite au scroll : décorative, s’efface dès les premiers pixels de défilement. */}
        <span
          data-hero-cue
          aria-hidden
          className="hdc-hero-cue pointer-events-none absolute bottom-5 left-1/2 z-[6] -translate-x-1/2 text-white/80"
        >
          <ChevronDown className="h-6 w-6" strokeWidth={1.5} />
        </span>
        {/* Fil d’horizon qui se trace avant l’ouverture de l’image. */}
        <span
          data-horizon
          aria-hidden
          className="hdc-horizon pointer-events-none absolute inset-x-8 top-1/2 z-[6] origin-center bg-catalog-sand sm:inset-x-16"
          style={{ transform: "scaleX(0)" }}
        />
      </section>

      <main className="mx-auto w-full max-w-lg pb-12 lg:max-w-7xl lg:px-8">
        {/* ——— Les deux univers ——— */}
        <section className="px-4 pt-8 lg:px-0 lg:pt-14">
          <p data-reveal="item" className="hdc-eyebrow">Réserver</p>
          <h2 data-heading className="mt-1.5 font-catalog-display text-[1.625rem] leading-tight text-catalog-ink lg:text-5xl">
            Que souhaitez-vous <span className="hdc-serif">vivre</span>&nbsp;?
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:mt-8 lg:grid-cols-3 lg:gap-5">
            {actions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                data-reveal="card"
                data-press
                className="group relative flex h-56 flex-col items-start justify-end overflow-hidden rounded-[1.25rem] bg-catalog-raised p-4 text-left lg:h-80 lg:p-6"
              >
                <div data-card-media className="absolute inset-0">
                  <img src={action.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                </div>
                <div aria-hidden className="absolute inset-0 bg-catalog-photo-fade" />
                <span className="relative block font-catalog-display text-[1.375rem] leading-none text-white lg:text-[2rem]">{action.title}</span>
                <span className="relative mt-1 block text-xs leading-snug text-white/80 lg:text-sm">{action.subtitle}</span>
                <span className="relative mt-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-catalog-ink">
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            ))}
          <Link
            to="/sejour"
            data-reveal="card"
            data-press
            className="relative col-span-2 flex min-h-[6rem] items-center justify-start gap-4 overflow-hidden rounded-[1.25rem] bg-catalog-raised p-4 text-left lg:col-span-1 lg:h-80 lg:flex-col lg:items-start lg:justify-end lg:p-6"
          >
            <div data-card-media className="absolute inset-0">
              <img src={TILE_STAY} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60 lg:opacity-100" />
            </div>
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,79,92,0.92)_0%,rgba(14,124,134,0.45)_100%)] lg:hidden" />
            <div aria-hidden className="absolute inset-0 hidden bg-catalog-photo-fade lg:block" />
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md lg:hidden">
              <CalendarDays className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span className="relative min-w-0 flex-1 lg:flex-none">
              <span className="block font-catalog-display text-[1.375rem] leading-tight text-white lg:text-[2rem] lg:leading-none">Mon séjour</span>
              <span className="mt-0.5 block text-sm text-white/80 lg:mt-1 lg:text-sm">En maintenance pour le moment</span>
            </span>
            <ChevronRight className="relative h-5 w-5 shrink-0 text-white/80 lg:hidden" aria-hidden />
            <span className="relative mt-3 hidden h-9 w-9 items-center justify-center rounded-full bg-white/90 text-catalog-ink lg:inline-flex">
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Link>
          </div>
        </section>

        <HomeReviewsMarquee />

        <InstagramReelsRail />

        {/* ——— Nos adresses ——— */}
        {hotelsWithPhoto.length ? (
          <section className="pt-10 lg:pt-16">
            <div data-reveal="item" className="flex items-end justify-between gap-3 px-4 lg:px-0">
              <div>
                <p className="hdc-eyebrow">Nos adresses</p>
                <h2 data-heading className="mt-1.5 font-catalog-display text-[1.625rem] leading-tight text-catalog-ink lg:text-5xl">
                  Les hôtels <span className="hdc-serif">de la sélection</span>
                </h2>
              </div>
              <Link to="/hotels" data-press className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-catalog-lagoon">
                Tout voir
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div ref={railRef} className="hdc-hotel-rail mt-4 flex snap-x snap-proximity gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide lg:mt-8 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0">
              {hotelsWithPhoto.slice(0, 8).map((hotel) => (
                <button
                  key={hotel.dbId || hotel.slug || hotel.id}
                  type="button"
                  data-rail-card
                  data-press
                  onClick={(e) => openHotel(e, hotel)}
                  className="relative h-72 w-[72%] shrink-0 snap-center overflow-hidden rounded-[1.25rem] bg-catalog-raised p-0 text-left lg:h-80 lg:w-auto"
                  aria-label={`Découvrir ${hotel.name}`}
                >
                  <img src={hotel.images[0]} alt="" loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                  <div aria-hidden className="absolute inset-0 bg-catalog-photo-fade" />
                  <span className="absolute inset-x-4 bottom-4">
                    <StarRow count={hotel.stars} />
                    <span className="mt-1.5 block font-catalog-display text-[1.375rem] leading-tight text-white">{hotel.name}</span>
                    {hotel.location ? <span className="mt-0.5 block text-xs text-white/80">{hotel.location}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* ——— Conciergerie ——— */}
        <div className="mt-10 px-4 lg:mt-16 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,22rem)] lg:items-stretch lg:gap-5 lg:px-0">
        <section data-reveal="item" className="relative overflow-hidden rounded-[1.25rem] bg-catalog-abyss p-6 text-white shadow-catalog-float lg:flex lg:items-end lg:justify-between lg:gap-10 lg:p-10">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(227,174,85,0.45)_0%,rgba(227,174,85,0)_70%)]" />
          <div className="relative max-w-xl">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-catalog-sand">Conciergerie</p>
          <p className="mt-2 font-catalog-display text-[1.5rem] leading-snug !text-white lg:text-4xl">
            Une équipe française vous répond, <span className="hdc-serif text-catalog-sand">7 jours sur 7.</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/75 lg:text-base">Une question, un transfert, une envie de dernière minute : écrivez-nous.</p>
          </div>
          <a href={AGENCY_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" data-press className="hdc-btn hdc-btn-ghost relative mt-5 w-full lg:mt-0 lg:w-auto lg:shrink-0">
            <WhatsAppGlyph className="h-5 w-5 text-[#1F8F55]" />
            Écrire sur WhatsApp
          </a>
        </section>

        <div className="flex flex-col gap-3 pt-3 lg:pt-0">
          <div className="hdc-card flex flex-col overflow-hidden lg:min-h-0 lg:flex-1">
            <div className="flex items-start gap-3 px-4 py-3.5">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-catalog-lagoon" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-catalog-ink">L’agence</p>
                <p className="mt-0.5 text-sm leading-snug text-catalog-muted">Esplanada mall, villages touristiques, Hurghada</p>
              </div>
            </div>
            <div className="relative h-44 w-full bg-catalog-mist lg:h-auto lg:min-h-[12rem] lg:flex-1">
              <iframe
                title="Carte Google Maps — agence Hurghada Dream, Esplanada mall, Hurghada"
                src={AGENCY_MAP_EMBED}
                className="absolute inset-0 h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <a
              href={AGENCY_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-press
              className="inline-flex min-h-11 items-center px-4 text-sm font-semibold text-catalog-lagoon"
            >
              Ouvrir dans Google Maps
            </a>
          </div>
          <Link to="/contacts" data-press className="hdc-btn hdc-btn-ink w-full lg:shrink-0">
            <Phone className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            Nos contacts
          </Link>
        </div>
        </div>
      </main>
    </PublicAppShell>
  );
}

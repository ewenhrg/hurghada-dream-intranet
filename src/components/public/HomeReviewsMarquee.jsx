import { useLayoutEffect, useRef } from "react";
import { StarRow } from "./HotelUI";

const GOOGLE_REVIEWS_URL = "https://www.trustindex.io/reviews/hurghadadream.com";

/** Avis Google 5 étoiles de Hurghada Dream, mars 2025 (Trustindex, hurghadadream.com). */
const ROW_ONE = [
  {
    name: "Salfaay Ls",
    date: "mars 2025",
    text: "Un conseil, ne plus réserver dans une autre agence que celle-là. Tout était top : organisation, ambiance, bonne humeur, personnel et équipements. Grand merci à Loulou et Moustapha.",
  },
  {
    name: "lisa zz",
    date: "mars 2025",
    text: "Super expérience avec Hurghada Dream, deuxième fois que je passe par cette agence française. Mustafa, notre guide à Eden Island, est dévoué à nous trouver les meilleurs spots. Je recommande.",
  },
  {
    name: "Camille",
    date: "mars 2025",
    text: "Très belle journée sur Mahmya Island avec Ralph. L’excursion est bien organisée, l’île est très belle, le repas à volonté et bon. On recommande vivement.",
  },
  {
    name: "Jérémy Journet",
    date: "mars 2025",
    text: "Excellente activité complète entre quad, cheval et dromadaire. Dépaysement total. Notre guide Lulu est au top, très agréable et à notre écoute. Je recommande fortement.",
  },
  {
    name: "Laura Guenot",
    date: "mars 2025",
    text: "Buggy safari avec Manu. Un guide investi et souriant. Nous avons passé une super matinée pleine de sensations.",
  },
  {
    name: "Youness Fatouak",
    date: "mars 2025",
    text: "Nawel et Loulou sont des guides adorables qui nous ont tout expliqué. Je recommande mille fois : pas de faux plan, très assidus et ponctuels.",
  },
];

const ROW_TWO = [
  {
    name: "Bryan",
    date: "mars 2025",
    text: "Loulou et Moustapha ont été parfaits. Ils parlent parfaitement français et savent animer. Le snorkeling était très bien, le bateau spacieux, et l’ambiance à Orange Bay vraiment cosy.",
  },
  {
    name: "Palmir Lafosse",
    date: "mars 2025",
    text: "Activité Mahmya avec Ralph : une super journée, le repas très bon, le personnel sympathique, une plage magnifique digne des Caraïbes.",
  },
  {
    name: "Maxime Majorczyk",
    date: "mars 2025",
    text: "Manu, meilleur guide de Hurghada pour le safari buggy. Il s’occupe de tout sur place, vous met à l’aise et donne toutes les informations pour passer le meilleur moment.",
  },
  {
    name: "cindy graindorge",
    date: "mars 2025",
    text: "Fantastic Sahara : quad, chameau et cheval. Les animaux sont super bien traités, tout le monde est accueillant. Mention particulière à Loulou, au top.",
  },
  {
    name: "méline renard",
    date: "mars 2025",
    text: "Après-midi buggy avec Manu : excellente. Prise en charge complète et pleine de bonne humeur. Je conseille +++.",
  },
  {
    name: "Isadora Robert",
    date: "mars 2025",
    text: "Très réactif, très efficace et très aimable. Super expérience.",
  },
];

function ReviewCard({ review }) {
  return (
    <figure className="flex w-[18.5rem] shrink-0 flex-col rounded-[1.15rem] bg-white px-4 py-3.5 shadow-catalog-card ring-1 ring-catalog-line lg:w-[22rem]">
      <StarRow count={5} />
      <blockquote className="mt-2 text-sm leading-snug text-catalog-ink lg:text-[0.9375rem]">
        <p>“{review.text}”</p>
      </blockquote>
      <figcaption className="mt-3 text-xs text-catalog-muted">
        <span className="font-semibold text-catalog-ink">{review.name}</span>
        <span> · Google · {review.date}</span>
      </figcaption>
    </figure>
  );
}

function ReviewLine({ reviews, reverse = false }) {
  const rowRef = useRef(null);
  const trackRef = useRef(null);
  const pausedRef = useRef(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const track = trackRef.current;
    const half = track?.firstElementChild;
    if (!row || !track || !half) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    let offset = null;
    let last = 0;
    let frame = 0;
    const readSpeed = () => {
      const raw = parseFloat(window.getComputedStyle(row).getPropertyValue("--hdc-review-speed"));
      return Number.isFinite(raw) && raw > 0 ? raw : 0.004;
    };

    const tick = (now) => {
      if (!last) last = now;
      const dt = Math.min(40, now - last);
      last = now;
      const width = half.offsetWidth;
      if (!pausedRef.current && width > 1) {
        if (offset === null) offset = reverse ? -width : 0;
        const step = dt * readSpeed();
        offset += reverse ? step : -step;
        if (reverse && offset >= 0) offset -= width;
        if (!reverse && offset <= -width) offset += width;
        track.style.transform = `translate3d(${offset}px,0,0)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      track.style.transform = "";
    };
  }, [reverse]);

  return (
    <div
      ref={rowRef}
      className="hdc-review-row"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") pausedRef.current = true;
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") pausedRef.current = false;
      }}
    >
      <div ref={trackRef} className="hdc-review-track">
        {[0, 1].map((copy) => (
          <ul
            key={copy}
            className="hdc-review-set"
            aria-hidden={copy === 1 ? true : undefined}
          >
            {reviews.map((review) => (
              <li key={`${copy}-${review.name}`}>
                <ReviewCard review={review} />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

export function HomeReviewsMarquee() {
  return (
    <section className="pt-10 lg:pt-16" aria-labelledby="home-reviews-title">
      <div className="flex items-end justify-between gap-3 px-4 lg:px-0">
        <div>
          <p data-reveal="item" className="hdc-eyebrow">Avis Google</p>
          <h2 id="home-reviews-title" data-heading className="mt-1.5 font-catalog-display text-[1.625rem] leading-tight text-catalog-ink lg:text-5xl">
            Cinq étoiles, <span className="hdc-serif">mot pour mot</span>
          </h2>
        </div>
        <a
          href={GOOGLE_REVIEWS_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-press
          className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-catalog-lagoon"
        >
          7&nbsp;800 avis
        </a>
      </div>
      <div className="mt-4 grid gap-3 lg:mt-8">
        <ReviewLine reviews={ROW_ONE} />
        <ReviewLine reviews={ROW_TWO} reverse />
      </div>
    </section>
  );
}

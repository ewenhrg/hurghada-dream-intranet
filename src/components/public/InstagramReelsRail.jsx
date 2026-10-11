import { useEffect, useRef, useState } from "react";
import { IS_CLIENT_APP } from "../../config/clientApp";
import { prefersReducedMotion } from "./motion";

const PROFILE_URL = "https://www.instagram.com/hurghada_dream/";
const REELS_URL = IS_CLIENT_APP
  ? "https://hurghada-dream-intranet.vercel.app/api/instagram-reels"
  : "/api/instagram-reels";

const REELS_CACHE_KEY = "hd-ig-reels";
const REELS_CACHE_MS = 2 * 60 * 60 * 1000;
let reelsRequest = null;

export function readCachedReels() {
  try {
    const raw = sessionStorage.getItem(REELS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > REELS_CACHE_MS) return [];
    return Array.isArray(parsed.reels) ? parsed.reels : [];
  } catch {
    return [];
  }
}

function rememberReels(reels) {
  const slim = reels.filter((reel) => reel?.video).slice(0, 12);
  if (slim.length < 3) return;
  try {
    sessionStorage.setItem(REELS_CACHE_KEY, JSON.stringify({ at: Date.now(), reels: slim }));
  } catch {
    /* quota pleine : la lecture reste possible sans cache */
  }
}

/** Précharge les 3 réels du hero sans ouvrir de lecteur caché (un téléphone n’en décode qu’un ou deux). */
function warmReels(reels) {
  if (typeof document === "undefined") return;
  reels.filter((reel) => reel?.video).slice(0, 3).forEach((reel, index) => {
    const id = `hd-preload-reel-${index}`;
    let link = document.getElementById(id);
    if (link?.getAttribute("href") === reel.video) return;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "preload";
      link.as = "video";
      link.referrerPolicy = "no-referrer";
      document.head.appendChild(link);
    }
    link.href = reel.video;
  });
}

export function fetchInstagramReels() {
  if (!reelsRequest) {
    reelsRequest = (async () => {
      try {
        const response = await fetch(REELS_URL);
        if (!response.ok) return [];
        const payload = await response.json();
        const reels = Array.isArray(payload?.reels) ? payload.reels : [];
        rememberReels(reels);
        warmReels(reels);
        return reels;
      } catch {
        return [];
      }
    })();
  }
  return reelsRequest;
}

warmReels(readCachedReels());
fetchInstagramReels();

function ReelCard({ reel, onError, still }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return undefined;
    node.muted = true;
    return undefined;
  }, [reel.video]);

  return (
    <a
      href={reel.href || PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-press
      aria-label={reel.caption || "Ouvrir le réel Instagram"}
      className="relative block h-72 w-40 overflow-hidden rounded-[1.25rem] bg-catalog-raised lg:h-80 lg:w-44"
    >
      {reel.video ? (
        <video
          ref={videoRef}
          src={reel.video}
          poster={reel.image}
          autoPlay={!still}
          muted
          loop
          playsInline
          preload={still ? "metadata" : "auto"}
          referrerPolicy="no-referrer"
          className="pointer-events-none h-full w-full object-cover"
          onError={onError}
        />
      ) : (
        <img
          src={reel.image}
          alt=""
          referrerPolicy="no-referrer"
          decoding="async"
          className="pointer-events-none h-full w-full object-cover"
          onError={onError}
        />
      )}
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,36,46,0)_62%,rgba(8,36,46,0.55)_100%)]" />
    </a>
  );
}

export function InstagramReelsRail() {
  const [reels, setReels] = useState([]);
  const marqueeRef = useRef(null);
  const halfRef = useRef(null);
  const pausedRef = useRef(false);
  // Mouvement réduit : ni défilement ni lecture automatiques, la bande reste balayable.
  const [still] = useState(() => prefersReducedMotion());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchInstagramReels();
        if (!cancelled) setReels(list.slice(0, 12));
      } catch {
        /* La bande reste masquée si Instagram ne répond pas. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const root = marqueeRef.current;
    const half = halfRef.current;
    if (!root || !half || reels.length < 2) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    let last = 0;
    let frame = 0;
    let writing = false;
    let resumeTimer = 0;
    let speed = 0.016;

    const readSpeed = () => {
      const raw = parseFloat(window.getComputedStyle(root).getPropertyValue("--hdc-reel-speed"));
      speed = Number.isFinite(raw) && raw > 0 ? raw : 0.016;
    };
    readSpeed();

    const onScroll = () => {
      if (writing) return;
      pausedRef.current = true;
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        pausedRef.current = false;
      }, 1600);
    };
    const onResize = () => readSpeed();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    const tick = (now) => {
      if (!last) last = now;
      const dt = Math.min(32, now - last);
      last = now;
      if (!pausedRef.current) {
        const width = half.offsetWidth;
        writing = true;
        root.scrollLeft += dt * speed;
        if (width > 1 && root.scrollLeft >= width) root.scrollLeft -= width;
        writing = false;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(resumeTimer);
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [reels]);

  useEffect(() => {
    const root = marqueeRef.current;
    if (!root || still) return undefined;
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
      { root, rootMargin: "0px 120px", threshold: 0.35 }
    );
    root.querySelectorAll("video").forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, [reels, still]);

  if (reels.length < 2) return null;

  return (
    <section className="pt-10 lg:pt-16" aria-labelledby="home-reels-title">
      <div className="flex items-end justify-between gap-3 px-4 lg:px-0">
        <div>
          <p data-reveal="item" className="hdc-eyebrow">Instagram</p>
          <h2 id="home-reels-title" data-heading className="mt-1.5 font-catalog-display text-[1.625rem] leading-tight text-catalog-ink lg:text-5xl">
            Les réels <span className="hdc-serif">du moment</span>
          </h2>
        </div>
        <a
          href={PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-press
          className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-catalog-lagoon"
        >
          @hurghada_dream
        </a>
      </div>

      <div
        ref={marqueeRef}
        className="hdc-reel-marquee mt-4 lg:mt-8"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") pausedRef.current = true;
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") pausedRef.current = false;
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") pausedRef.current = true;
        }}
        onPointerUp={(event) => {
          if (event.pointerType !== "mouse") pausedRef.current = false;
        }}
        onPointerCancel={() => {
          pausedRef.current = false;
        }}
      >
        <div className="hdc-reel-track">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              ref={copy === 0 ? halfRef : undefined}
              className="flex gap-3 pr-3"
              aria-hidden={copy === 1 ? true : undefined}
            >
              {reels.map((reel) => (
                <li key={`${copy}-${reel.id}`} className="shrink-0">
                  <ReelCard
                    reel={reel}
                    still={still}
                    onError={() => {
                      setReels((prev) => prev.filter((item) => item.id !== reel.id));
                    }}
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

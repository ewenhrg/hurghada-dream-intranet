import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
    const href = String(reel.video || "");
    if (!/^https?:\/\//.test(href)) return;
    const id = `hd-preload-reel-${index}`;
    let link = document.getElementById(id);
    if (link?.getAttribute("href") === href) return;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "preload";
      link.as = "fetch";
      link.crossOrigin = "anonymous";
      link.href = href;
      document.head.appendChild(link);
      return;
    }
    link.href = href;
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

function ReelCard({ reel, onError, still, lazy = false }) {
  const cardRef = useRef(null);
  const videoRef = useRef(null);
  const [near, setNear] = useState(!lazy);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (!lazy) return undefined;
    const node = cardRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { root: null, rootMargin: "80px 40px", threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [lazy, reel.id]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return undefined;
    node.muted = true;
    node.defaultMuted = true;
    node.setAttribute("muted", "");
    node.setAttribute("playsinline", "");
    return undefined;
  }, [reel.video, near, still, videoFailed]);

  const showVideo = Boolean(reel.video) && !still && !videoFailed && near;

  return (
    <a
      ref={cardRef}
      href={reel.href || PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-press
      aria-label={reel.caption || "Ouvrir le réel Instagram"}
      className="relative block h-72 w-40 overflow-hidden rounded-[1.25rem] bg-catalog-raised lg:h-80 lg:w-44"
    >
      {showVideo ? (
        <video
          ref={videoRef}
          src={reel.video}
          poster={reel.image}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          referrerPolicy="no-referrer"
          className="pointer-events-none h-full w-full object-cover"
          onError={() => setVideoFailed(true)}
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

export function InstagramReelsRail({ videos = true }) {
  const [reels, setReels] = useState(() => readCachedReels().slice(0, 12));
  const marqueeRef = useRef(null);
  const trackRef = useRef(null);
  const pausedRef = useRef(false);
  // Mouvement réduit : ni défilement ni lecture automatiques.
  const [still] = useState(() => prefersReducedMotion());
  const [phone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches);
  const showVideo = videos && !still;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchInstagramReels();
        if (!cancelled && list.length >= 2) setReels(list.slice(0, 12));
      } catch {
        /* garde le cache éventuel */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Même principe que les avis Google : translate3d (fiable sur téléphone sous overflow-x: clip).
  useLayoutEffect(() => {
    const root = marqueeRef.current;
    const track = trackRef.current;
    const half = track?.firstElementChild;
    if (!root || !track || !half || reels.length < 2) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    let offset = 0;
    let last = 0;
    let frame = 0;
    let resumeTimer = 0;

    const readSpeed = () => {
      const raw = parseFloat(window.getComputedStyle(root).getPropertyValue("--hdc-reel-speed"));
      return Number.isFinite(raw) && raw > 0 ? raw : 0.028;
    };

    const tick = (now) => {
      if (!last) last = now;
      const dt = Math.min(40, now - last);
      last = now;
      const width = half.offsetWidth;
      if (!pausedRef.current && width > 1) {
        offset -= dt * readSpeed();
        if (offset <= -width) offset += width;
        track.style.transform = `translate3d(${offset}px,0,0)`;
      }
      frame = requestAnimationFrame(tick);
    };

    const pauseBriefly = () => {
      pausedRef.current = true;
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        pausedRef.current = false;
      }, 1600);
    };

    root.addEventListener("pointerdown", pauseBriefly, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(resumeTimer);
      root.removeEventListener("pointerdown", pauseBriefly);
      track.style.transform = "";
    };
  }, [reels]);

  useEffect(() => {
    const root = marqueeRef.current;
    if (!root || !showVideo) return undefined;
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
      { root: null, rootMargin: "120px 80px", threshold: 0.2 }
    );
    root.querySelectorAll("video").forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, [reels, showVideo]);

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
          135K abonnés
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
      >
        <div ref={trackRef} className="hdc-reel-track">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              className="flex gap-3 pr-3 pl-4 lg:pl-0"
              aria-hidden={copy === 1 ? true : undefined}
            >
              {reels.map((reel) => (
                <li key={`${copy}-${reel.id}`} className="shrink-0">
                  <ReelCard
                    reel={reel}
                    still={!showVideo}
                    lazy={phone && showVideo}
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

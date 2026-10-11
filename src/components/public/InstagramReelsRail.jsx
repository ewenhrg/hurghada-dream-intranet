import { useEffect, useRef, useState } from "react";
import { IS_CLIENT_APP } from "../../config/clientApp";

const PROFILE_URL = "https://www.instagram.com/hurghada_dream/";
const REELS_URL = IS_CLIENT_APP
  ? "https://hurghada-dream-intranet.vercel.app/api/instagram-reels"
  : "/api/instagram-reels";

function ReelCard({ reel, onError }) {
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
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
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
  const trackRef = useRef(null);
  const marqueeRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(REELS_URL);
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled && Array.isArray(payload?.reels)) setReels(payload.reels.slice(0, 12));
      } catch {
        /* La bande reste masquée si Instagram ne répond pas. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || reels.length < 2) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const marquee = marqueeRef.current;
    let x = 0;
    let last = 0;
    let frame = 0;
    let speed = 0.016;
    let step = 0;
    const gap = parseFloat(window.getComputedStyle(track).columnGap || "12") || 12;

    const measure = () => {
      const first = track.firstElementChild;
      const raw = marquee
        ? parseFloat(window.getComputedStyle(marquee).getPropertyValue("--hdc-reel-speed"))
        : 0.016;
      speed = Number.isFinite(raw) && raw > 0 ? raw : 0.016;
      step = first ? first.getBoundingClientRect().width + gap : 0;
    };
    measure();

    const onResize = () => measure();
    window.addEventListener("resize", onResize);

    const tick = (now) => {
      if (!last) last = now;
      const dt = Math.min(32, now - last);
      last = now;
      if (!pausedRef.current) x -= dt * speed;
      if (step > 1 && -x >= step) {
        x += step;
        const first = track.firstElementChild;
        if (first) track.appendChild(first);
      }
      track.style.transform = `translate3d(${x}px,0,0)`;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [reels]);

  useEffect(() => {
    const root = marqueeRef.current;
    if (!root) return undefined;
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
  }, [reels]);

  if (reels.length < 2) return null;

  return (
    <section className="pt-10 lg:pt-16" aria-labelledby="home-reels-title">
      <div className="flex items-end justify-between gap-3 px-4 lg:px-0">
        <div>
          <p className="hdc-eyebrow">Instagram</p>
          <h2 id="home-reels-title" className="mt-1.5 font-catalog-display text-[1.625rem] leading-tight text-catalog-ink lg:text-5xl">
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
        <ul ref={trackRef} className="hdc-reel-track">
          {reels.map((reel) => (
            <li key={reel.id} className="shrink-0">
              <ReelCard
                reel={reel}
                onError={() => {
                  setReels((prev) => prev.filter((item) => item.id !== reel.id));
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

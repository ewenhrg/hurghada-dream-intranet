import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { IS_CLIENT_APP } from "../../config/clientApp";

const PROFILE_URL = "https://www.instagram.com/hurghada_dream/";
const REELS_URL = IS_CLIENT_APP
  ? "https://hurghada-dream-intranet.vercel.app/api/instagram-reels"
  : "/api/instagram-reels";

export function InstagramReelsRail() {
  const [reels, setReels] = useState([]);

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

  if (reels.length < 2) return null;

  const duration = `${Math.max(reels.length, 4) * 5}s`;

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

      <div className="hdc-reel-marquee mt-4 lg:mt-8">
        <div className="hdc-reel-track" style={{ animationDuration: duration }}>
          {[0, 1].map((copy) => (
            <ul key={copy} className="hdc-reel-group" aria-hidden={copy === 1 ? true : undefined}>
              {reels.map((reel) => (
                <li key={`${copy}-${reel.id}`} className="shrink-0">
                  <a
                    href={reel.href || PROFILE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-press
                    aria-label={copy === 0 ? reel.caption || "Ouvrir le réel Instagram" : undefined}
                    tabIndex={copy === 1 ? -1 : undefined}
                    className="relative block h-72 w-40 overflow-hidden rounded-[1.25rem] bg-catalog-raised lg:h-80 lg:w-44"
                  >
                    <img
                      src={reel.image}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      className="pointer-events-none h-full w-full object-cover"
                      onError={() => {
                        setReels((prev) => prev.filter((item) => item.id !== reel.id));
                      }}
                    />
                    <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,36,46,0)_55%,rgba(8,36,46,0.72)_100%)]" />
                    <span className="pointer-events-none absolute bottom-3 left-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-catalog-ink">
                      <Play className="h-4 w-4" aria-hidden />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Fiche Google de l’agence (Esplanada mall, Hurghada). */
const GOOGLE_FTID = "0x1452870d003ceaef:0xf4b0551e74e830e5";

/** Fiche Google Maps : les avis y sont publics et vérifiables. */
export const GOOGLE_MAPS_PLACE_URL = "https://maps.app.goo.gl/qcx9LvVG3QwKUWyWA";

/**
 * Ouvre directement la fenêtre « Écrire un avis » de Google sur la fiche Hurghada Dream.
 * (Le lien officiel g.page/r/…/review du Google Business Profile peut le remplacer.)
 */
export const GOOGLE_WRITE_REVIEW_URL = `https://www.google.com/search?q=Hurghada+Dream+Hurghada#lrd=${GOOGLE_FTID},3,,,`;

/** Logo « G » officiel de Google, en couleurs. */
export function GoogleG({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
    </svg>
  );
}

/** « Google » écrit en entier, aux couleurs de la marque. */
const WORDMARK = [
  ["G", "#4285F4"],
  ["o", "#EA4335"],
  ["o", "#FBBC05"],
  ["g", "#4285F4"],
  ["l", "#34A853"],
  ["e", "#EA4335"],
];
export function GoogleWordmark({ className = "" }) {
  return (
    <span className={`font-bold tracking-[-0.01em] ${className}`}>
      {WORDMARK.map(([letter, color], i) => (
        <span key={i} style={{ color }}>
          {letter}
        </span>
      ))}
    </span>
  );
}

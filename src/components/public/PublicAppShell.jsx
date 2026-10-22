import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "@fontsource-variable/figtree";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import { publicBackPath } from "../../config/clientApp";
import { PublicBackLink } from "./PublicBackLink";
import { useHeaderMorph, usePopOnChange, usePressFeedback, useScreenIntro, useScrollMotion } from "./motion";
import { Sheet, SheetHeader } from "./PublicUI";

/** Couleur des barres système Android / navigateur : identique au fond de l’appli. */
const APP_CHROME_COLOR = "#FAF6EF";

const SOCIALS = [
  {
    name: "Snapchat",
    href: "https://www.snapchat.com/@hdreamtours",
    path: "M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.27.56-.225 1.013-.57 1.334-.57.18 0 .27.135.27.27 0 .09-.045.18-.12.285-.27.36-.87.72-1.335.96-.09.045-.18.09-.255.12.045.21.075.435.09.66.06.84-.15 1.56-.63 2.16-.405.51-.99.9-1.74 1.14-.12.045-.255.075-.39.12.18.36.33.75.42 1.17.21.96.045 1.86-.48 2.55-.48.63-1.2.99-2.07 1.05-.09 0-.18.015-.27.03-1.05.18-2.1.27-3.15.27-1.05 0-2.1-.09-3.15-.27-.09-.015-.18-.03-.27-.03-.87-.06-1.59-.42-2.07-1.05-.525-.69-.69-1.59-.48-2.55.09-.42.24-.81.42-1.17-.135-.045-.27-.075-.39-.12-.75-.24-1.335-.63-1.74-1.14-.48-.6-.69-1.32-.63-2.16.015-.225.045-.45.09-.66-.075-.03-.165-.075-.255-.12-.465-.24-1.065-.6-1.335-.96-.075-.105-.12-.195-.12-.285 0-.135.09-.27.27-.27.321 0 .774.345 1.334.57.374.15.733.254 1.033.27.198 0 .326-.045.401-.09-.008-.165-.018-.33-.03-.51l-.003-.06c-.104-1.628-.23-3.654.299-4.847C7.859 1.069 11.216.793 12.206.793z",
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@hurghadadream",
    path: "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.2 8.2 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15z",
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/hurghada_dream/",
    path: "M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95C23.73 2.69 21.31.27 16.95.07 15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zM12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4zm6.41-11.85a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44z",
  },
];

const HOME_MENU = [
  { to: "/catalogue", label: "Excursions" },
  { to: "/hotels", label: "Hôtels" },
  { to: "/sejour", label: "Mon séjour" },
  { to: "/evenements", label: "Événements" },
  { to: "/contacts", label: "Contacts" },
  { to: "/qui-sommes-nous", label: "Qui sommes-nous" },
  { to: "/politique", label: "Remboursement" },
  { to: "/confidentialite", label: "Confidentialité" },
];

const B2B_MENU = [
  { to: "/b2b", label: "Connexion B2B" },
  { to: "/b2b?demande=1", label: "Demander un accès B2B" },
];

function SocialMark({ path }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d={path} />
    </svg>
  );
}

export function GuestHeaderButton({ onClick, count, children, ariaLabel }) {
  const badgeRef = useRef(null);
  usePopOnChange(badgeRef, count);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${ariaLabel} (${count})` : ariaLabel}
      data-press
      className="relative inline-flex min-h-11 items-center gap-2 rounded-full bg-white py-1 pl-3.5 pr-1.5 text-catalog-ink ring-1 ring-catalog-border"
    >
      {children}
      <span
        ref={badgeRef}
        className={`flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${
          count > 0 ? "bg-catalog-coral text-white" : "bg-catalog-bg text-catalog-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * Coquille de chaque écran de l’appli client.
 * Header fixe sous la barre d’état (padding natif MainActivity + safe-area), fond ivoire.
 * Accueil = logo ; sinon flèche retour en haut à gauche. Pas de barre d’onglets.
 */
export function PublicAppShell({ title, right, children, wide = false, revealKey, nav = null }) {
  const { pathname } = useLocation();
  const backTo = publicBackPath(pathname);
  // `wide="xl"` : catalogue excursions (contenu en max-w-7xl), aligne le header sur la grille.
  const inner = wide === "xl" ? "max-w-7xl lg:px-8" : wide ? "max-w-6xl" : "max-w-lg";
  const rootRef = useRef(null);
  const headerRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const onHome = !backTo;

  usePressFeedback(rootRef);
  useScreenIntro(rootRef, [revealKey, pathname]);
  useScrollMotion(rootRef, [revealKey, pathname]);
  useHeaderMorph(headerRef, Boolean(backTo));

  useEffect(() => {
    document.title = title ? `${title} · Hurghada Dream` : "Hurghada Dream";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", APP_CHROME_COLOR);
  }, [title]);

  // Le fond ivoire de démarrage (index.html) passe la main au scope `.hd-public-catalog`.
  useEffect(() => {
    document.documentElement.classList.remove("hd-public-boot");
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div
      ref={rootRef}
      className="hd-public-catalog relative isolate flex min-h-screen flex-col overflow-x-clip bg-catalog-bg font-catalog-sans text-catalog-body antialiased"
    >
      {backTo ? (
        <header ref={headerRef} data-solid className="fixed inset-x-0 top-0 z-50">
          <div aria-hidden className="hdc-header-bg" />
          <div className={`relative mx-auto flex items-center gap-3 px-4 pb-2 pt-[max(0.35rem,env(safe-area-inset-top))] sm:px-6 ${inner}`}>
            <PublicBackLink to={backTo} />
            <p data-header-title className="min-w-0 flex-1 truncate font-catalog-display text-[1.15rem] leading-none text-catalog-ink">
              {title}
            </p>
            {right}
          </div>
        </header>
      ) : null}

      {backTo ? <div aria-hidden className="h-[calc(max(0.35rem,env(safe-area-inset-top))+3.25rem)] shrink-0" /> : null}

      <div className="relative flex-1 pb-[env(safe-area-inset-bottom)]">
        {backTo ? null : (
          <div className={`relative mx-auto flex items-center justify-center gap-6 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] ${nav ? "hdc-homebar lg:justify-between" : ""} ${inner}`}>
            <img src="/client/logo-wordmark.png" alt="Hurghada Dream" className="hdc-wordmark object-contain" />
            {nav ? <div className="hidden lg:block">{nav}</div> : null}
            {onHome ? (
              <button
                type="button"
                data-press
                aria-label="Ouvrir le menu"
                aria-expanded={menuOpen}
                aria-controls="client-home-menu"
                onClick={() => setMenuOpen(true)}
                className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-catalog-ink ring-1 ring-catalog-border lg:static lg:translate-y-0"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            ) : null}
          </div>
        )}
        {children}
      </div>

      {menuOpen ? (
        <Sheet variant="right" onClose={() => setMenuOpen(false)} labelledBy="client-home-menu-title">
          <div id="client-home-menu">
            <SheetHeader eyebrow="Hurghada Dream" title="Menu" titleId="client-home-menu-title" onClose={() => setMenuOpen(false)} dark />
          </div>
          <nav aria-label="Pages" className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <ul className="space-y-1">
              {HOME_MENU.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    data-press
                    onClick={() => setMenuOpen(false)}
                    className={`flex min-h-12 items-center rounded-2xl px-3 text-base font-semibold ${
                      pathname === item.to ? "bg-catalog-lagoonSoft text-catalog-lagoon" : "text-catalog-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mb-1 mt-5 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-catalog-label">Agences</p>
            <ul className="space-y-1">
              {B2B_MENU.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    data-press
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-12 items-center rounded-2xl px-3 text-base font-semibold text-catalog-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Sheet>
      ) : null}

      <footer className={`mx-auto w-full px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 ${inner}`}>
        <div className="flex flex-col items-center gap-4 border-t border-catalog-line pt-6">
          <div className="flex items-center justify-center gap-3">
            {SOCIALS.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                data-press
                aria-label={social.name}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-catalog-ink ring-1 ring-catalog-border"
              >
                <SocialMark path={social.path} />
              </a>
            ))}
          </div>
          <nav aria-label="Mentions légales" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-semibold text-catalog-lagoon">
            <Link to="/qui-sommes-nous" data-press className="min-h-11 inline-flex items-center">
              Qui sommes-nous
            </Link>
            <Link to="/politique" data-press className="min-h-11 inline-flex items-center">
              Remboursement
            </Link>
            <Link to="/confidentialite" data-press className="min-h-11 inline-flex items-center">
              Confidentialité
            </Link>
            <Link to="/b2b" data-press className="min-h-11 inline-flex items-center">
              Espace agences
            </Link>
          </nav>
          <p className="text-center text-xs leading-relaxed text-catalog-muted">
            © {new Date().getFullYear()} Hurghada Dream. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
}

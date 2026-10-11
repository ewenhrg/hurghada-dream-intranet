import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import "@fontsource-variable/manrope";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import { publicBackPath } from "../../config/clientApp";
import { PublicBackLink } from "./PublicBackLink";
import { useHeaderMorph, usePopOnChange, usePressFeedback, useScreenIntro, useScrollMotion } from "./motion";

/** Couleur des barres système Android / navigateur : identique au fond de l’appli. */
const APP_CHROME_COLOR = "#FAF6EF";

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
export function PublicAppShell({ title, right, children, wide = false, revealKey }) {
  const { pathname } = useLocation();
  const backTo = publicBackPath(pathname);
  // `wide="xl"` : catalogue excursions (contenu en max-w-7xl), aligne le header sur la grille.
  const inner = wide === "xl" ? "max-w-7xl lg:px-8" : wide ? "max-w-6xl" : "max-w-lg";
  const rootRef = useRef(null);
  const headerRef = useRef(null);

  usePressFeedback(rootRef);
  useScreenIntro(rootRef, [revealKey, pathname]);
  useScrollMotion(rootRef, [revealKey, pathname]);
  useHeaderMorph(headerRef);

  useEffect(() => {
    document.title = title ? `${title} · Hurghada Dream` : "Hurghada Dream";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", APP_CHROME_COLOR);
  }, [title]);

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
          <div className={`mx-auto flex justify-center px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] ${inner}`}>
            <img
              src="/client/logo-wordmark.png"
              alt="Hurghada Dream"
              className="object-contain"
              style={{ height: "1.4rem", width: "auto", maxWidth: "7.5rem" }}
            />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

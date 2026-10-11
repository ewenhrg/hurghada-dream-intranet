import { useRef } from "react";
import { AlertCircle, Compass, X } from "lucide-react";
import { gsap, useGSAP, useSheetEnter } from "./motion";

const WHATSAPP_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

const SHEET_ALIGN = {
  right: "justify-end",
  center: "items-center justify-center p-4",
  bottom: "items-end justify-center sm:items-center sm:p-4",
};

const SHEET_PANEL = {
  right: "flex h-full w-full max-w-md flex-col bg-catalog-bg shadow-2xl",
  center: "w-full max-w-md rounded-[1.5rem] bg-white shadow-2xl",
  bottom: "flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-[1.5rem] bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[1.5rem]",
};

export function WhatsAppGlyph({ className = "h-6 w-6" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={WHATSAPP_PATH} />
    </svg>
  );
}

/** Bouton WhatsApp flottant, discret : pastille blanche, entrée en fondu après le contenu. */
export function WhatsAppFab({ href, label = "Écrire sur WhatsApp", className = "flex" }) {
  const ref = useRef(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(ref.current, { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, delay: 0.6, ease: "power3.out", clearProps: "transform" });
      });
    },
    { scope: ref }
  );
  return (
    <a
      ref={ref}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-press
      aria-label={label}
      className={`fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-40 ${className} h-14 w-14 items-center justify-center rounded-full bg-white shadow-catalog-float ring-1 ring-catalog-border`}
    >
      <WhatsAppGlyph className="h-6 w-6 text-[#1F8F55]" />
    </a>
  );
}

/** État vide / erreur, sobre. */
export function StateCard({ tone = "empty", title, children, action }) {
  const Icon = tone === "error" ? AlertCircle : Compass;
  return (
    <div data-reveal="item" className="hdc-card px-6 py-10 text-center">
      <Icon className={`mx-auto h-6 w-6 ${tone === "error" ? "text-catalog-coral" : "text-catalog-lagoon"}`} strokeWidth={1.5} aria-hidden />
      <p className="mt-4 font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-catalog-muted">{children}</div> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Titre de section : sur-titre + titre serif. */
export function SectionHeading({ eyebrow, title, aside, className = "" }) {
  return (
    <div data-reveal="item" className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow ? <p className="hdc-eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-1.5 font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">{title}</h2>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

/**
 * Modal / tiroir : voile + panneau qui glisse à l’ouverture (GSAP).
 * À monter uniquement quand il est ouvert. `as="form"` pour un formulaire.
 */
export function Sheet({
  variant = "bottom",
  onClose,
  closeLabel = "Fermer",
  zClass = "z-[120]",
  labelledBy,
  as: Panel = "div",
  panelProps = {},
  panelClassName = "",
  children,
}) {
  const ref = useRef(null);
  useSheetEnter(ref, { from: variant === "right" ? "right" : "bottom" });
  return (
    <div
      ref={ref}
      className={`hdc-sheet fixed inset-0 ${zClass} flex ${SHEET_ALIGN[variant]}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <button type="button" data-scrim className="absolute inset-0 bg-catalog-night/45" aria-label={closeLabel} onClick={onClose} />
      <Panel data-sheet {...panelProps} className={`relative z-10 ${SHEET_PANEL[variant]} ${panelClassName}`}>
        {variant === "bottom" ? <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-catalog-border sm:hidden" aria-hidden /> : null}
        {children}
      </Panel>
    </div>
  );
}

/** En-tête de feuille : sur-titre + titre serif + bouton fermer 44 px. */
export function SheetHeader({ eyebrow, title, titleId, onClose, dark = false }) {
  return (
    <div
      className={`flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4 sm:px-6 sm:pt-5 ${
        dark ? "bg-catalog-bg pt-[calc(max(0.75rem,env(safe-area-inset-top))+0.5rem)]" : ""
      }`}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="hdc-eyebrow">{eyebrow}</p> : null}
        <h2 id={titleId} className="mt-1 truncate font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">
          {title}
        </h2>
      </div>
      <button
        type="button"
        data-press
        onClick={onClose}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-catalog-ink ring-1 ring-catalog-border"
        aria-label="Fermer"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

/** Pied de feuille collant (CTA principal), respecte la barre de navigation. */
export function SheetFooter({ children }) {
  return (
    <div className="shrink-0 border-t border-catalog-line bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      {children}
    </div>
  );
}

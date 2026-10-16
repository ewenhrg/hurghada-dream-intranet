import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, Compass, Star } from "lucide-react";
import { startPhotoFlight } from "./motion";
import { CATEGORY_ICONS, displayActivityName, formatMoney, getPublicCategoryLabel } from "./catalogueDisplay";
import { getActivityDayLabelsList } from "../../utils/activityDaysDisplay";

export function CategoryIcon({ categoryKey, className = "h-4 w-4", strokeWidth = 1.75 }) {
  const Icon = CATEGORY_ICONS[categoryKey] || Compass;
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}

/** Jours de départ réels de l’activité, en clair ; rien si la donnée manque. */
function formatDepartureDays(activity) {
  const labels = getActivityDayLabelsList(activity);
  if (!labels || labels.length === 0) return "";
  if (labels.length === 7) return "Tous les jours";
  if (labels.length >= 5) return `${labels.length} jours / 7`;
  return labels.join(" · ");
}

/** Texte saisi à l’intranet : on retire markdown, pictogrammes et titres en capitales pour l’accroche. */
function cleanLine(line) {
  return String(line || "")
    .replace(/\p{Extended_Pictographic}|️/gu, "")
    .replace(/[*_#`>]+/g, "")
    .replace(/^[-•–—:\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hideMoney(text) {
  return String(text || "")
    .replace(/\s*[–—-]?\s*\d[\d\s.,]*\s*(?:€|eur)(?:\s*\/\s*\p{L}+|\s+par\s+\p{L}+)?/giu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

function isShouting(line) {
  const letters = line.replace(/[^\p{L}]/gu, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

/** Première vraie phrase du texte public (pas un titre), pour l’accroche de la carte. */
function teaser(text, name) {
  const title = cleanLine(name).toLowerCase();
  return (
    String(text || "")
      .split(/\n+/)
      .map(cleanLine)
      .find((line) => line.length >= 24 && !isShouting(line) && line.toLowerCase() !== title) || ""
  );
}

/**
 * Carte d’excursion du catalogue client : vrai lien (clic molette, partage), photo 4/3
 * révélée au scroll, prix « à partir de » et jours de départ issus des données de l’activité.
 */
export function CatalogueActivityCard({
  activity,
  categoryKey,
  coverUrl,
  fromPrice,
  prose,
  priority = false,
  onAdd,
  href,
  quoteOnly = false,
  ctaLabel = "Découvrir",
}) {
  const asButton = typeof onAdd === "function";
  const hidePrice = quoteOnly || asButton;
  const to = href || `/catalogue/activity/${encodeURIComponent(String(activity.id))}`;
  const rawName = displayActivityName(activity.name) || "Activité";
  const name = quoteOnly ? hideMoney(rawName) || rawName : rawName;
  const days = formatDepartureDays(activity);
  const hook = quoteOnly ? hideMoney(teaser(prose, rawName)) : teaser(prose, rawName);
  const hasPrice = !hidePrice && fromPrice != null && fromPrice > 0;

  const onClick = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    startPhotoFlight(event.currentTarget.querySelector("[data-card-media] img"));
  };

  const shellClass = "hdc-excursion group flex h-full w-full flex-col overflow-hidden rounded-[1.25rem] bg-white text-left";
  const inner = (
    <>
      <div data-card-media className="relative aspect-[4/3] w-full overflow-hidden bg-catalog-mist">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={name}
            draggable={false}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            className="hdc-excursion-img pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(160deg,#DCF0EF_0%,#B9E0DE_100%)]">
            <CategoryIcon categoryKey={categoryKey} className="h-10 w-10 text-catalog-lagoon/60" strokeWidth={1.25} />
          </div>
        )}
        <div aria-hidden className="absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(10,42,51,0.28)_0%,rgba(10,42,51,0)_100%)]" />
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-white/95 px-2.5 text-[0.6875rem] font-semibold text-catalog-ink shadow-sm">
            <CategoryIcon categoryKey={categoryKey} className="h-3.5 w-3.5 text-catalog-lagoon" />
            {getPublicCategoryLabel(categoryKey)}
          </span>
          {activity.popular === true ? (
            <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-catalog-ink/85 px-2.5 text-[0.6875rem] font-semibold text-white">
              <Star className="h-3 w-3 fill-catalog-sand text-catalog-sand" aria-hidden />
              Populaire
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex grow flex-col px-5 pb-5 pt-4">
        <h3 className="line-clamp-2 font-catalog-display text-[1.375rem] leading-[1.15] text-catalog-ink">{name}</h3>
        {hook ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-catalog-muted">{hook}</p> : null}
        {days ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-catalog-body">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-catalog-lagoon" strokeWidth={1.75} aria-hidden />
            <span className="truncate">{days}</span>
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div className="min-w-0">
            {hasPrice ? (
              <>
                <span className="block text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-catalog-muted">À partir de</span>
                <span className="mt-0.5 block text-[1.375rem] font-semibold leading-none tabular-nums text-catalog-ink">
                  {formatMoney(fromPrice, activity.currency || "EUR")}
                </span>
              </>
            ) : (
              <>
                <span className="block text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-catalog-muted">
                  {hidePrice ? "Tarif professionnel" : "Tarif"}
                </span>
                <span className="mt-0.5 block text-base font-semibold leading-none text-catalog-brass">Sur devis</span>
              </>
            )}
          </div>
          <span className="hdc-excursion-cta inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full pl-4 pr-3 text-sm font-semibold">
            {ctaLabel}
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </>
  );

  if (asButton) {
    return (
      <button type="button" onClick={() => onAdd(activity)} data-reveal="card" data-press className={shellClass}>
        {inner}
      </button>
    );
  }

  return (
    <Link to={to} onClick={onClick} data-reveal="card" data-press className={shellClass}>
      {inner}
    </Link>
  );
}

/** Squelette aux proportions exactes d’une carte : aucun saut de mise en page au chargement. */
export function CatalogueActivityCardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col overflow-hidden rounded-[1.25rem] bg-white ring-1 ring-catalog-line">
      <div className="hdc-skeleton aspect-[4/3] w-full" />
      <div className="space-y-3 px-5 pb-5 pt-4">
        <div className="hdc-skeleton h-6 w-4/5 rounded-md" />
        <div className="hdc-skeleton h-4 w-full rounded-md" />
        <div className="hdc-skeleton h-4 w-2/3 rounded-md" />
        <div className="flex items-end justify-between pt-4">
          <div className="hdc-skeleton h-8 w-24 rounded-md" />
          <div className="hdc-skeleton h-11 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}

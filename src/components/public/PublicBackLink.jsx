import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/** Seul retour de l’appli : 44 px+, jamais masqué par les animations. */
export function PublicBackLink({ to, label }) {
  return (
    <Link
      to={to}
      data-press
      aria-label={label ? `Retour ${label}` : "Retour"}
      className="relative z-50 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white text-catalog-ink ring-1 ring-catalog-border"
    >
      <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
      {label ? <span className="pr-2 text-sm font-semibold">{label}</span> : null}
    </Link>
  );
}

import { useLanguage } from "../../contexts/LanguageContext";

/**
 * Bascule FR / EN pour le site public (catalogue, accueil, etc.).
 */
export function PublicLanguageToggle({ className = "", compact = false }) {
  const { language, setLanguage } = useLanguage();
  const isEn = language === "en";

  return (
    <div
      role="group"
      aria-label={isEn ? "Language" : "Langue"}
      className={`inline-flex items-center rounded-full bg-white p-0.5 ring-1 ring-catalog-border ${className}`}
    >
      <button
        type="button"
        data-press
        aria-pressed={!isEn}
        onClick={() => setLanguage("fr")}
        className={`min-h-8 rounded-full px-2.5 text-[11px] font-extrabold tracking-wide transition ${
          !isEn ? "bg-catalog-ink text-white" : "text-catalog-muted hover:text-catalog-ink"
        } ${compact ? "px-2" : "sm:min-h-9 sm:px-3 sm:text-xs"}`}
      >
        FR
      </button>
      <button
        type="button"
        data-press
        aria-pressed={isEn}
        onClick={() => setLanguage("en")}
        className={`min-h-8 rounded-full px-2.5 text-[11px] font-extrabold tracking-wide transition ${
          isEn ? "bg-catalog-ink text-white" : "text-catalog-muted hover:text-catalog-ink"
        } ${compact ? "px-2" : "sm:min-h-9 sm:px-3 sm:text-xs"}`}
      >
        EN
      </button>
    </div>
  );
}

import { useCallback, useMemo, useState } from "react";
import { LS_KEYS } from "../constants";
import { saveLS, cleanPhoneNumber } from "../utils";
import { PrimaryBtn, GhostBtn } from "../components/ui";
import { useTranslation } from "../hooks/useTranslation";
import { toast } from "../utils/toast.js";
import { buildDraftFromPastedText } from "../utils/pasteQuoteParser";
import { HD_PUBLIC_QUOTE_TO_DRAFT_EVENT } from "../utils/publicQuoteToDraft";

export function AutoDevisPage({ activities }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [lastWarnings, setLastWarnings] = useState([]);

  const canSubmit = useMemo(() => text.trim().length > 0, [text]);

  const handleAnalyze = useCallback(() => {
    const raw = text.trim();
    if (!raw) {
      toast.warning("Collez d’abord le texte du client.");
      return;
    }

    const { draft, warnings } = buildDraftFromPastedText(raw, activities);

    const phoneClean = cleanPhoneNumber(draft.client?.phone || "");
    const enriched = {
      ...draft,
      client: {
        ...draft.client,
        phone: phoneClean,
      },
    };

    setLastWarnings(warnings);

    try {
      saveLS(LS_KEYS.quoteForm, enriched);
    } catch {
      /* ignore */
    }

    window.dispatchEvent(new CustomEvent(HD_PUBLIC_QUOTE_TO_DRAFT_EVENT, { detail: enriched }));

    if (warnings.length) {
      toast.warning(
        `Devis ouvert : ${warnings.length} point${warnings.length > 1 ? "s" : ""} à vérifier (correspondances d’activités, etc.).`,
        5000
      );
    } else {
      toast.success("Devis ouvert — vérifiez les champs puis validez.");
    }
  }, [activities, text]);

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-7 text-slate-800 shadow-sm">
      <p className="text-sm leading-relaxed text-slate-600">
        Collez un message type (liste d’excursions, coordonnées, dates, adresse Airbnb…). Le système remplit l’onglet{" "}
        <strong className="text-slate-800">Devis</strong> comme pour une demande catalogue : vous n’avez plus qu’à contrôler
        les activités proposées, les dates et les quantités.
      </p>

      <label htmlFor="auto-devis-paste" className="block text-xs font-bold uppercase tracking-wide text-indigo-950">
        Texte à analyser
      </label>
      <textarea
        id="auto-devis-paste"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        spellCheck={false}
        className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-900 shadow-inner outline-none ring-indigo-400/30 focus:border-indigo-400 focus:ring-2"
        placeholder={`Ex. :\nEden Island\nLuxury SPA à 40€ (2 fois)\n…\n\nNOM Prénom\n0612345678\nmail@exemple.com\nAdresse de l’airbnb : …\nDate de séjour : 16 au 27 août\nNombre de participants : 4 personnes`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <PrimaryBtn type="button" onClick={handleAnalyze} disabled={!canSubmit} className="rounded-xl px-5 py-2.5 text-sm font-semibold">
          Analyser et ouvrir le devis
        </PrimaryBtn>
        <GhostBtn type="button" size="sm" onClick={() => setText("")} className="rounded-xl text-sm">
          Effacer
        </GhostBtn>
      </div>

      {lastWarnings.length > 0 && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950"
          role="status"
          aria-live="polite"
        >
          <p className="mb-2 font-semibold">{t("page.autoDevis.warningsTitle")}</p>
          <ul className="list-inside list-disc space-y-1 text-amber-900/95">
            {lastWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

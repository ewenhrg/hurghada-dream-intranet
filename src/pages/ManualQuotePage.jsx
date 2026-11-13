import { useMemo, useState } from "react";
import { Plus, Printer, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { currencyNoCents } from "../utils";
import {
  computeManualQuoteTotal,
  emptyManualLine,
  normalizeManualLines,
  saveManualQuote,
} from "../utils/manualQuotes";
import { generateManualQuoteHTML } from "../utils/printTemplates";
import { toast } from "../utils/toast.js";

function openPrint(html) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const popup = window.open(url);
  if (!popup) {
    URL.revokeObjectURL(url);
    toast.error("Autorisez les pop-ups pour imprimer.");
    return false;
  }
  window.setTimeout(() => {
    try {
      popup.focus();
      popup.print();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  }, 400);
  return true;
}

export function ManualQuotePage({ user }) {
  const [clientName, setClientName] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([emptyManualLine()]);
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => computeManualQuoteTotal(lines), [lines]);
  const validLines = useMemo(
    () => normalizeManualLines(lines).filter((line) => line.label.trim() && Number(line.price) >= 0),
    [lines]
  );
  const canPrint = validLines.some((line) => line.label.trim());

  const updateLine = (id, patch) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyManualLine()]);

  const removeLine = (id) => {
    setLines((prev) => {
      if (prev.length <= 1) return [emptyManualLine()];
      return prev.filter((line) => line.id !== id);
    });
  };

  const handlePrint = async () => {
    const cleaned = normalizeManualLines(lines).filter((line) => line.label.trim());
    if (cleaned.length === 0) {
      toast.warning("Ajoutez au moins une ligne avec une désignation.");
      return;
    }
    setSaving(true);
    const draft = {
      clientName,
      note,
      currency: "EUR",
      lines: cleaned,
    };
    const result = await saveManualQuote(supabase, draft, user?.name || "");
    setSaving(false);
    if (!result.ok || !result.quote) {
      toast.error("Impossible d’enregistrer le devis. Réessayez.");
      return;
    }
    openPrint(generateManualQuoteHTML(result.quote));
    toast.success("Devis enregistré et prêt à imprimer.");
    setClientName("");
    setNote("");
    setLines([emptyManualLine()]);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-indigo-300 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Client (optionnel)
            </span>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nom du client"
              className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-base font-medium text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Note (optionnel)
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Infos complémentaires"
              className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-base font-medium text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => (
          <div
            key={line.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-slate-900">Ligne {index + 1}</p>
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 className="size-4" aria-hidden />
                Retirer
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_9rem]">
              <label className="block md:col-span-1">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
                  Désignation
                </span>
                <input
                  type="text"
                  value={line.label}
                  onChange={(e) => updateLine(line.id, { label: e.target.value })}
                  placeholder="Ex. Transfert aéroport, Safari…"
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-base font-medium text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
                  Date (optionnel)
                </span>
                <input
                  type="date"
                  value={line.date || ""}
                  onChange={(e) => updateLine(line.id, { date: e.target.value })}
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-base font-medium text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
                  Prix (€)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  value={line.price}
                  onChange={(e) => updateLine(line.id, { price: e.target.value })}
                  placeholder="0"
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-base font-semibold tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-indigo-300 bg-white px-4 text-sm font-bold text-indigo-900 hover:bg-indigo-50"
        >
          <Plus className="size-4" aria-hidden />
          Ajouter une ligne
        </button>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <p className="text-right text-base font-extrabold tabular-nums text-slate-950">
            Total : {currencyNoCents(Math.round(total), "EUR")}
          </p>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={!canPrint || saving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:opacity-40"
          >
            <Printer className="size-4" aria-hidden />
            {saving ? "Enregistrement…" : "Imprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Pencil, Printer, Trash2, X } from "lucide-react";
import {
  isManualQuoteDraftReady,
  ManualQuoteForm,
  validateManualQuoteDraft,
} from "../components/ManualQuoteForm";
import { NEIGHBORHOODS } from "../constants";
import { supabase } from "../lib/supabase";
import { currencyNoCents, uuid } from "../utils";
import {
  deleteManualQuote,
  emptyManualClient,
  emptyManualLine,
  fetchManualQuotes,
  normalizeManualClient,
  normalizeManualLines,
  updateManualQuote,
} from "../utils/manualQuotes";
import { generateManualQuoteHTML } from "../utils/printTemplates";
import { toast } from "../utils/toast.js";

function formatWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLineDate(date) {
  if (!date) return "—";
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR");
}

function neighborhoodLabel(key) {
  return NEIGHBORHOODS.find((n) => n.key === key)?.label || key || "";
}

function openPrint(html) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const popup = window.open(url);
  if (!popup) {
    URL.revokeObjectURL(url);
    toast.error("Autorisez les pop-ups pour imprimer.");
    return;
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
}

function quoteToDraft(quote) {
  const client = normalizeManualClient(quote?.client || emptyManualClient());
  if (!client.name && quote?.clientName) client.name = String(quote.clientName).trim();
  const lines = normalizeManualLines(quote?.lines || []).map((line) => ({
    ...line,
    id: line.id || uuid(),
    price: line.price === 0 || line.price ? String(line.price) : "",
  }));
  return {
    client,
    note: String(quote?.note || ""),
    lines: lines.length > 0 ? lines : [emptyManualLine()],
  };
}

export function ManualQuotesHistoryPage() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [client, setClient] = useState(() => emptyManualClient());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([emptyManualLine()]);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await fetchManualQuotes(supabase);
    setQuotes(result.quotes || []);
    setLoading(false);
    if (!result.ok) toast.error("Impossible de charger l’historique.");
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const startEdit = (quote) => {
    const draft = quoteToDraft(quote);
    setEditingId(quote.id);
    setClient(draft.client);
    setNote(draft.note);
    setLines(draft.lines);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setClient(emptyManualClient());
    setNote("");
    setLines([emptyManualLine()]);
  };

  const handleSaveEdit = async () => {
    if (editingId == null) return;
    const error = validateManualQuoteDraft(client, lines);
    if (error) {
      toast.warning(error);
      return;
    }
    setSaving(true);
    const draft = {
      client,
      note,
      currency: "EUR",
      lines: normalizeManualLines(lines).filter((line) => line.label.trim()),
    };
    const result = await updateManualQuote(supabase, editingId, draft);
    setSaving(false);
    if (!result.ok || !result.quote) {
      toast.error("Impossible d’enregistrer les modifications.");
      return;
    }
    setQuotes((prev) => prev.map((item) => (item.id === editingId ? result.quote : item)));
    toast.success("Devis modifié.");
    cancelEdit();
  };

  const handleDelete = async (quote) => {
    if (!quote?.id) return;
    const ok = window.confirm("Supprimer ce devis manuel ?");
    if (!ok) return;
    const result = await deleteManualQuote(supabase, quote.id);
    if (!result.ok) {
      toast.error("Suppression impossible.");
      return;
    }
    if (editingId === quote.id) cancelEdit();
    setQuotes((prev) => prev.filter((item) => item.id !== quote.id));
    toast.success("Devis supprimé.");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-indigo-300 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-bold text-indigo-950">Historique des devis manuels</p>
        <p className="mt-0.5 text-xs font-medium text-slate-600">
          Visible uniquement pour Sophia, Ewen et Karim. Modification, réimpression et suppression.
        </p>
      </div>

      {editingId != null ? (
        <div className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50/40 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-amber-950">Modification du devis #{editingId}</p>
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
            >
              <X className="size-4" aria-hidden />
              Annuler
            </button>
          </div>
          <ManualQuoteForm
            client={client}
            setClient={setClient}
            note={note}
            setNote={setNote}
            lines={lines}
            setLines={setLines}
            footer={
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={!isManualQuoteDraftReady(client, lines) || saving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-bold text-white disabled:opacity-40"
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            }
          />
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Chargement…
        </div>
      ) : quotes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Aucun devis manuel pour le moment.
        </div>
      ) : (
        <div className="space-y-3">
          {quotes.map((quote) => (
            <article
              key={quote.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm md:p-5 ${
                editingId === quote.id ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-extrabold text-slate-950">
                    {quote.client?.name || quote.clientName || "Sans nom client"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {formatWhen(quote.createdAt)}
                    {quote.createdByName ? ` · ${quote.createdByName}` : ""}
                    {" · "}
                    {quote.lines.length} ligne{quote.lines.length > 1 ? "s" : ""}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    {[
                      quote.client?.phone,
                      quote.client?.email,
                      quote.client?.isAirbnb
                        ? `Airbnb${quote.client?.hotel ? ` · ${quote.client.hotel}` : ""}`
                        : quote.client?.hotel,
                      quote.client?.room ? `ch. ${quote.client.room}` : "",
                      neighborhoodLabel(quote.client?.neighborhood),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {quote.lines.map((line) => (
                      <li
                        key={line.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-800"
                      >
                        <span className="min-w-0 font-semibold">
                          {line.label}
                          <span className="ml-2 font-medium text-slate-500">
                            {formatLineDate(line.date)}
                          </span>
                        </span>
                        <span className="font-bold tabular-nums">
                          {currencyNoCents(Math.round(Number(line.price) || 0), quote.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {quote.note ? (
                    <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                      {quote.note}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row lg:flex-col">
                  <p className="text-right text-lg font-extrabold tabular-nums text-slate-950 lg:mb-1">
                    {currencyNoCents(Math.round(Number(quote.total) || 0), quote.currency)}
                  </p>
                  <button
                    type="button"
                    onClick={() => startEdit(quote)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                  >
                    <Pencil className="size-4" aria-hidden />
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => openPrint(generateManualQuoteHTML(quote))}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white"
                  >
                    <Printer className="size-4" aria-hidden />
                    Réimprimer
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(quote)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Supprimer
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

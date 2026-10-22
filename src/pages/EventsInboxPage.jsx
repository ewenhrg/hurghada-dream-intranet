import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { formatPhoneWithPlus } from "../utils";
import { formatQuoteEuro, generateEventQuoteHTML } from "../utils/eventQuotePrint";
import { toast } from "../utils/toast";

const QUOTE_STATUSES = [
  { id: "pending", label: "En attente" },
  { id: "sent", label: "Envoyé" },
  { id: "awaiting_payment", label: "En attente de paiement" },
];

const QUOTE_COLUMNS =
  "id, request_id, status, first_name, last_name, phone, email, hotel, arrival_date, departure_date, event_type, event_date, guest_count, budget, wants_photographer, client_message, lines, created_at";

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function quoteNumber(id) {
  return id ? `EV-${String(id).padStart(4, "0")}` : "Devis";
}

function createLine() {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: "", price: "" };
}

function parsePrice(value) {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function quoteFromRow(row) {
  const lines = Array.isArray(row.lines) ? row.lines : [];
  return {
    id: row.id,
    requestId: row.request_id,
    status: QUOTE_STATUSES.some((item) => item.id === row.status) ? row.status : "pending",
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    phone: row.phone || "",
    email: row.email || "",
    hotel: row.hotel || "",
    arrivalDate: row.arrival_date || "",
    departureDate: row.departure_date || "",
    eventType: row.event_type || "",
    eventDate: row.event_date || "",
    guestCount: row.guest_count || "",
    budget: row.budget || "",
    wantsPhotographer: Boolean(row.wants_photographer),
    clientMessage: row.client_message || "",
    lines: lines.map((line, index) => ({
      key: `${row.id}-${index}`,
      label: String(line?.label || ""),
      price: line?.price === 0 || line?.price ? String(line.price) : "",
    })),
    createdAt: row.created_at,
  };
}

function draftFromRequest(row) {
  return {
    id: null,
    requestId: row.id,
    status: "pending",
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    phone: row.phone || "",
    email: row.email || "",
    hotel: row.hotel || "",
    arrivalDate: row.arrival_date || "",
    departureDate: row.departure_date || "",
    eventType: row.event_type || "",
    eventDate: row.event_date || "",
    guestCount: row.guest_count || "",
    budget: row.budget || "",
    wantsPhotographer: Boolean(row.wants_photographer),
    clientMessage: row.message || "",
    lines: [createLine()],
    createdAt: null,
  };
}

function pricedLines(lines) {
  const clean = [];
  for (const line of lines) {
    const label = String(line.label || "").trim();
    const price = parsePrice(line.price);
    if (!label && price == null) continue;
    if (!label || price == null) return { error: "Chaque ligne doit avoir un intitulé et un prix.", lines: [] };
    clean.push({ label, price });
  }
  if (clean.length === 0) return { error: "Ajoutez au moins une prestation.", lines: [] };
  return { error: "", lines: clean };
}

function printModel(draft, lines) {
  const total = lines.reduce((sum, line) => sum + line.price, 0);
  return {
    number: quoteNumber(draft.id),
    issuedAt: formatWhen(draft.createdAt || new Date().toISOString()),
    clientName: `${draft.firstName} ${draft.lastName}`.trim() || "—",
    phone: formatPhoneWithPlus(draft.phone) || "—",
    email: draft.email || "—",
    hotel: draft.hotel || "—",
    stay: `${formatDay(draft.arrivalDate)} — ${formatDay(draft.departureDate)}`,
    eventType: draft.eventType || "—",
    eventDate: formatDay(draft.eventDate),
    guestCount: draft.guestCount ? String(draft.guestCount) : "—",
    budget: draft.budget || "—",
    photographer: draft.wantsPhotographer ? "Oui" : "Non",
    message: draft.clientMessage || "",
    lines: lines.map((line) => ({ label: line.label, priceLabel: formatQuoteEuro(line.price) })),
    total: formatQuoteEuro(total),
  };
}

function showQuoteDocument(popup, draft, lines) {
  const html = generateEventQuoteHTML(printModel(draft, lines));
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  popup.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function openQuoteDocument(draft, lines) {
  const popup = window.open("about:blank", "_blank");
  if (!popup) {
    toast.error("Autorisez les fenêtres pop-up pour afficher le devis.");
    return;
  }
  showQuoteDocument(popup, draft, lines);
}

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ClientFacts({ person }) {
  return (
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      <Fact label="Téléphone">{formatPhoneWithPlus(person.phone) || "—"}</Fact>
      <Fact label="Email"><span className="break-all">{person.email || "—"}</span></Fact>
      <Fact label="Hôtel">{person.hotel || "—"}</Fact>
      <Fact label="Séjour">{formatDay(person.arrivalDate || person.arrival_date)} — {formatDay(person.departureDate || person.departure_date)}</Fact>
      <Fact label="Date de l’événement">{formatDay(person.eventDate || person.event_date)}</Fact>
      <Fact label="Personnes">{person.guestCount || person.guest_count || "—"}</Fact>
      <Fact label="Budget">{person.budget || "—"}</Fact>
      <Fact label="Photographe / vidéaste">{(person.wantsPhotographer ?? person.wants_photographer) ? "Oui" : "Non"}</Fact>
    </dl>
  );
}

function QuoteEditor({ draft, saving, onChange, onCancel, onGenerate }) {
  const total = draft.lines.reduce((sum, line) => sum + (parsePrice(line.price) || 0), 0);
  const updateLine = (key, patch) => {
    onChange({
      ...draft,
      lines: draft.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    });
  };
  const removeLine = (key) => {
    const next = draft.lines.filter((line) => line.key !== key);
    onChange({ ...draft, lines: next.length ? next : [createLine()] });
  };

  return (
    <div className="rounded-2xl bg-white p-4 text-slate-900 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">Devis</p>
          <p className="text-base font-extrabold">{draft.firstName} {draft.lastName}</p>
          <p className="mt-1 text-sm font-semibold text-indigo-700">{draft.eventType || "Type non précisé"}</p>
        </div>
        <button type="button" onClick={onCancel} className="min-h-10 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700">
          Retour
        </button>
      </div>
      <ClientFacts person={draft} />
      {draft.clientMessage ? (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">{draft.clientMessage}</p>
      ) : null}

      <div className="mt-5 space-y-2">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Prestations</p>
        {draft.lines.map((line) => (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
            <input
              value={line.label}
              onChange={(event) => updateLine(line.key, { label: event.target.value })}
              placeholder="Prestation"
              className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm"
            />
            <input
              value={line.price}
              onChange={(event) => updateLine(line.key, { price: event.target.value })}
              inputMode="decimal"
              placeholder="Prix €"
              className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => removeLine(line.key)}
              className="min-h-11 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-600"
            >
              Retirer
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...draft, lines: [...draft.lines, createLine()] })}
          className="min-h-10 rounded-xl border border-dashed border-slate-300 px-3 text-xs font-bold text-slate-700"
        >
          Ajouter une ligne
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-base font-extrabold">Total {formatQuoteEuro(total)}</p>
        <button
          type="button"
          onClick={onGenerate}
          disabled={saving}
          className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "Génération…" : "Générer un devis"}
        </button>
      </div>
    </div>
  );
}

export function EventsInboxPage() {
  const [rows, setRows] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [error, setError] = useState("");
  const [view, setView] = useState("inbox");
  const [historyStatus, setHistoryStatus] = useState("pending");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase) {
      setError("Connexion indisponible.");
      return;
    }
    const [requestsResult, quotesResult] = await Promise.all([
      supabase
        .from("public_event_requests")
        .select("id, last_name, first_name, phone, email, hotel, arrival_date, departure_date, event_type, event_date, guest_count, budget, wants_photographer, message, status, created_at")
        .eq("site_key", SITE_KEY)
        .order("created_at", { ascending: false }),
      supabase
        .from("public_event_quotes")
        .select(QUOTE_COLUMNS)
        .eq("site_key", SITE_KEY)
        .order("created_at", { ascending: false }),
    ]);
    if (requestsResult.error || quotesResult.error) {
      setError("Les demandes n’ont pas pu être chargées.");
      return;
    }
    setError("");
    setRows(requestsResult.data || []);
    setQuotes((quotesResult.data || []).map(quoteFromRow));
  }, []);

  useEffect(() => {
    let cancelled = false;
    reload().catch(() => {
      if (!cancelled) setError("Les demandes n’ont pas pu être chargées.");
    });
    if (!supabase) return undefined;
    const channel = supabase
      .channel("public-event-quotes-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "public_event_requests" }, () => {
        if (!cancelled) reload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "public_event_quotes" }, () => {
        if (!cancelled) reload();
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const quotedRequestIds = new Set(quotes.map((quote) => quote.requestId).filter(Boolean));
  const incoming = rows.filter((row) => (row.status || "pending") !== "treated" && !quotedRequestIds.has(row.id));
  const history = quotes.filter((quote) => quote.status === historyStatus);

  const generateQuote = async () => {
    if (!draft || !supabase || saving) return;
    const priced = pricedLines(draft.lines);
    if (priced.error) {
      setError(priced.error);
      return;
    }
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      toast.error("Autorisez les fenêtres pop-up pour afficher le devis.");
      return;
    }
    setSaving(true);
    const payload = {
      site_key: SITE_KEY,
      request_id: draft.requestId,
      status: draft.status || "pending",
      first_name: draft.firstName,
      last_name: draft.lastName,
      phone: draft.phone,
      email: draft.email,
      hotel: draft.hotel,
      arrival_date: draft.arrivalDate,
      departure_date: draft.departureDate,
      event_type: draft.eventType,
      event_date: draft.eventDate,
      guest_count: draft.guestCount ? Number(draft.guestCount) : null,
      budget: draft.budget,
      wants_photographer: Boolean(draft.wantsPhotographer),
      client_message: draft.clientMessage,
      lines: priced.lines,
      updated_at: new Date().toISOString(),
    };
    const query = draft.id
      ? supabase.from("public_event_quotes").update(payload).eq("id", draft.id).eq("site_key", SITE_KEY)
      : supabase.from("public_event_quotes").insert(payload);
    const { data, error: saveError } = await query.select("id, created_at").single();
    setSaving(false);
    if (saveError || !data) {
      popup.close();
      setError("Le devis n’a pas pu être enregistré.");
      return;
    }
    const saved = { ...draft, id: data.id, createdAt: draft.createdAt || data.created_at, lines: priced.lines.map((line, index) => ({
      key: `${data.id}-${index}`,
      label: line.label,
      price: String(line.price),
    })) };
    setError("");
    setDraft(null);
    setView("history");
    setHistoryStatus(saved.status);
    toast.success("Devis généré.");
    showQuoteDocument(popup, saved, priced.lines);
    reload();
  };

  const moveQuote = async (quote, status) => {
    if (!supabase || quote.status === status) return;
    const { error: updateError } = await supabase
      .from("public_event_quotes")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", quote.id)
      .eq("site_key", SITE_KEY);
    if (updateError) {
      setError("Le devis n’a pas changé de section.");
      return;
    }
    setQuotes((current) => current.map((item) => (item.id === quote.id ? { ...item, status } : item)));
    const label = QUOTE_STATUSES.find((item) => item.id === status)?.label || status;
    toast.success(`Devis déplacé vers ${label}.`);
  };

  const deleteQuote = async (quote) => {
    if (!supabase) return;
    if (!window.confirm(`Supprimer le devis ${quoteNumber(quote.id)} ?`)) return;
    const { error: deleteError } = await supabase
      .from("public_event_quotes")
      .delete()
      .eq("id", quote.id)
      .eq("site_key", SITE_KEY);
    if (deleteError) {
      setError("Le devis n’a pas pu être supprimé.");
      return;
    }
    setQuotes((current) => current.filter((item) => item.id !== quote.id));
    toast.success("Devis supprimé.");
  };

  const printQuote = (quote) => {
    const priced = pricedLines(quote.lines);
    if (priced.error) {
      setError("Ce devis n’a pas de prestation à imprimer.");
      return;
    }
    openQuoteDocument(quote, priced.lines);
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</p>
      ) : null}

      {view === "editor" && draft ? (
        <QuoteEditor
          draft={draft}
          saving={saving}
          onChange={setDraft}
          onCancel={() => {
            setDraft(null);
            setView(draft.id ? "history" : "inbox");
          }}
          onGenerate={generateQuote}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-indigo-100">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">Événementiel</p>
              <p className="text-sm font-semibold text-slate-700">
                {view === "history"
                  ? `${history.length} devis`
                  : `${incoming.length} demande${incoming.length > 1 ? "s" : ""}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView("inbox")}
                className={`min-h-10 rounded-xl px-3 text-xs font-bold ${view === "inbox" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                Nouvelles
              </button>
              <button
                type="button"
                onClick={() => setView("history")}
                className={`min-h-10 rounded-xl px-3 text-xs font-bold ${view === "history" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                Historique
              </button>
            </div>
          </div>

          {view === "history" ? (
            <div className="flex flex-wrap gap-2">
              {QUOTE_STATUSES.map((status) => {
                const count = quotes.filter((quote) => quote.status === status.id).length;
                return (
                  <button
                    key={status.id}
                    type="button"
                    onClick={() => setHistoryStatus(status.id)}
                    className={`min-h-10 rounded-xl px-3 text-xs font-bold ${
                      historyStatus === status.id ? "bg-indigo-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
                    }`}
                  >
                    {status.label} ({count})
                  </button>
                );
              })}
            </div>
          ) : null}

          {view === "inbox" && incoming.length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">Aucune nouvelle demande.</p>
          ) : null}
          {view === "history" && history.length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">Aucun devis dans cette section.</p>
          ) : null}

          {view === "inbox" ? (
            <ul className="space-y-3">
              {incoming.map((row) => (
                <li key={row.id} className="rounded-2xl bg-white p-4 text-slate-900 ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-extrabold">{row.first_name} {row.last_name}</p>
                      <p className="mt-1 text-sm font-semibold text-indigo-700">{row.event_type || "Type non précisé"}</p>
                      <p className="mt-1 text-sm text-slate-600">{formatWhen(row.created_at)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setDraft(draftFromRequest(row));
                        setView("editor");
                      }}
                      className="min-h-10 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white"
                    >
                      Faire un devis
                    </button>
                  </div>
                  <ClientFacts person={row} />
                  <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">{row.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-3">
              {history.map((quote) => {
                const total = quote.lines.reduce((sum, line) => sum + (parsePrice(line.price) || 0), 0);
                return (
                  <li key={quote.id} className="rounded-2xl bg-white p-4 text-slate-900 ring-1 ring-slate-200">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-600">{quoteNumber(quote.id)}</p>
                        <p className="text-base font-extrabold">{quote.firstName} {quote.lastName}</p>
                        <p className="mt-1 text-sm font-semibold text-indigo-700">{quote.eventType || "Type non précisé"}</p>
                        <p className="mt-1 text-sm text-slate-600">{formatWhen(quote.createdAt)} · {formatQuoteEuro(total)}</p>
                      </div>
                      <label className="text-xs font-bold text-slate-600">
                        Section
                        <select
                          value={quote.status}
                          onChange={(event) => moveQuote(quote, event.target.value)}
                          className="mt-1 block min-h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900"
                        >
                          {QUOTE_STATUSES.map((status) => (
                            <option key={status.id} value={status.id}>{status.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <ul className="mt-3 space-y-1 text-sm">
                      {quote.lines.map((line) => (
                        <li key={line.key} className="flex justify-between gap-3">
                          <span>{line.label}</span>
                          <span className="font-semibold">{formatQuoteEuro(parsePrice(line.price) || 0)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => deleteQuote(quote)} className="min-h-10 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white">
                        Supprimer
                      </button>
                      <button type="button" onClick={() => printQuote(quote)} className="min-h-10 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white">
                        Imprimer
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          setDraft({ ...quote, lines: quote.lines.length ? quote.lines : [createLine()] });
                          setView("editor");
                        }}
                        className="min-h-10 rounded-xl bg-indigo-700 px-3 text-xs font-bold text-white"
                      >
                        Modifier
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

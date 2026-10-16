import { useEffect, useMemo, useState } from "react";
import { b2bSetupMessage, listB2BQuotes, updateB2BQuoteStatus } from "../utils/b2b";

const STATUSES = [
  { id: "new", label: "Nouvelle" },
  { id: "in_progress", label: "En cours" },
  { id: "done", label: "Traitée" },
];

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function parseItems(raw) {
  if (Array.isArray(raw)) return raw;
  return [];
}

export function B2BQuotesPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [agency, setAgency] = useState("all");

  async function reload() {
    setRows(await listB2BQuotes());
  }

  useEffect(() => {
    let cancelled = false;
    reload().catch((err) => {
      if (!cancelled) setError(b2bSetupMessage(err));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const agencies = useMemo(() => {
    const names = new Set(rows.map((row) => row.agency_name || row.agency_login).filter(Boolean));
    return [...names];
  }, [rows]);

  const visible = rows.filter((row) => agency === "all" || (row.agency_name || row.agency_login) === agency);

  async function handleStatus(id, status) {
    setError("");
    try {
      await updateB2BQuoteStatus(id, status);
      await reload();
    } catch (err) {
      setError(b2bSetupMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-indigo-100">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">Réception</p>
          <p className="text-sm font-semibold text-slate-700">{visible.length} demande{visible.length > 1 ? "s" : ""} · prix à chiffrer</p>
        </div>
        <label className="text-xs font-bold uppercase tracking-wide text-indigo-950">
          Agence
          <select value={agency} onChange={(e) => setAgency(e.target.value)} className="mt-1 block min-w-[14rem] rounded-xl border-2 border-indigo-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal">
            <option value="all">Toutes les agences</option>
            {agencies.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-sm text-slate-500 ring-1 ring-slate-200">Aucune demande B2B pour le moment.</p>
      ) : null}

      {visible.map((quote) => {
        const items = parseItems(quote.items);
        return (
          <article key={quote.id} className="overflow-hidden rounded-2xl border-2 border-indigo-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-indigo-50 bg-indigo-50/60 px-4 py-4 sm:px-6">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">{quote.agency_name || quote.agency_login}</p>
                <h3 className="mt-1 text-lg font-bold text-slate-950">{quote.client_name || "Client"}</h3>
                <p className="text-sm text-slate-600">
                  {quote.client_phone}{quote.client_email ? ` · ${quote.client_email}` : ""} · {formatWhen(quote.created_at)}
                </p>
              </div>
              <select
                value={quote.status || "new"}
                onChange={(e) => handleStatus(quote.id, e.target.value)}
                className="rounded-xl border-2 border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-950"
              >
                {STATUSES.map((status) => (
                  <option key={status.id} value={status.id}>{status.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 px-4 py-4 text-sm text-slate-700 sm:grid-cols-3 sm:px-6">
              <p><span className="font-bold text-slate-950">Hôtel.</span> {quote.client_hotel || "—"}</p>
              <p><span className="font-bold text-slate-950">Arrivée.</span> {formatDay(quote.arrival_date)}</p>
              <p><span className="font-bold text-slate-950">Départ.</span> {formatDay(quote.departure_date)}</p>
            </div>
            <ul className="space-y-2 px-4 pb-4 sm:px-6">
              {items.map((item, index) => (
                <li key={`${quote.id}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <p className="font-bold text-slate-950">{item.activityName || "Activité"}</p>
                  <p className="text-slate-600">
                    {formatDay(item.date)} · {item.adults || 0} adulte{(item.adults || 0) > 1 ? "s" : ""} · {item.children || 0} enfant{(item.children || 0) > 1 ? "s" : ""}
                    {item.babies ? ` · ${item.babies} bébé${item.babies > 1 ? "s" : ""}` : ""}
                  </p>
                  {item.note ? <p className="text-slate-500">{item.note}</p> : null}
                </li>
              ))}
            </ul>
            {quote.notes ? <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:px-6">{quote.notes}</p> : null}
          </article>
        );
      })}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { formatPhoneWithPlus } from "../utils";

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

export function EventsInboxPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");

  const reload = useCallback(async () => {
    if (!supabase) {
      setError("Connexion indisponible.");
      return;
    }
    const { data, error: loadError } = await supabase
      .from("public_event_requests")
      .select("id, last_name, first_name, phone, email, hotel, arrival_date, departure_date, event_type, event_date, guest_count, budget, wants_photographer, message, status, created_at")
      .eq("site_key", SITE_KEY)
      .order("created_at", { ascending: false });
    if (loadError) {
      setError("Les demandes n’ont pas pu être chargées.");
      return;
    }
    setError("");
    setRows(data || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    reload().catch(() => {
      if (!cancelled) setError("Les demandes n’ont pas pu être chargées.");
    });
    if (!supabase) return undefined;
    const channel = supabase
      .channel("public-event-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "public_event_requests" },
        () => {
          if (!cancelled) reload();
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const visible = rows.filter((row) => filter === "all" || (row.status || "pending") === filter);

  const markTreated = async (id) => {
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("public_event_requests")
      .update({ status: "treated" })
      .eq("id", id)
      .eq("site_key", SITE_KEY);
    if (updateError) {
      setError("Le statut n’a pas été enregistré.");
      return;
    }
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status: "treated" } : row)));
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-indigo-100">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">Événementiel</p>
          <p className="text-sm font-semibold text-slate-700">
            {visible.length} demande{visible.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {[
            ["pending", "Nouvelles"],
            ["treated", "Traitées"],
            ["all", "Toutes"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`min-h-10 rounded-xl px-3 text-xs font-bold ${
                filter === id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
          Aucune demande pour ce filtre.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li key={row.id} className="rounded-2xl bg-white p-4 text-slate-900 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-extrabold">
                    {row.first_name} {row.last_name}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-indigo-700">{row.event_type || "Type non précisé"}</p>
                  <p className="mt-1 text-sm text-slate-600">{formatWhen(row.created_at)}</p>
                </div>
                {row.status !== "treated" ? (
                  <button
                    type="button"
                    onClick={() => markTreated(row.id)}
                    className="min-h-10 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white"
                  >
                    Marquer comme traitée
                  </button>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">Traitée</span>
                )}
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Téléphone</dt>
                  <dd>{formatPhoneWithPlus(row.phone) || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Email</dt>
                  <dd className="break-all">{row.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Hôtel</dt>
                  <dd>{row.hotel || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Séjour</dt>
                  <dd>
                    {formatDay(row.arrival_date)} — {formatDay(row.departure_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Date de l’événement</dt>
                  <dd>{formatDay(row.event_date)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Personnes</dt>
                  <dd>{row.guest_count ? row.guest_count : "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Budget</dt>
                  <dd>{row.budget || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Photographe / vidéaste</dt>
                  <dd>{row.wants_photographer ? "Oui" : "Non"}</dd>
                </div>
              </dl>
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                {row.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

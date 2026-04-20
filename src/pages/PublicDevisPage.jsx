import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, getQuotesRealtimeSiteKeyFilter } from "../constants";
import { logger } from "../utils/logger";

function parseItems(rawItems) {
  if (Array.isArray(rawItems)) return rawItems;
  if (typeof rawItems === "string") {
    try {
      const parsed = JSON.parse(rawItems);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (rawItems && typeof rawItems === "object") return [];
  return [];
}

function formatMoney(value, currency = "EUR") {
  const safeValue = Number(value) || 0;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: String(currency || "EUR").toUpperCase(),
    }).format(safeValue);
  } catch {
    return `${safeValue} ${currency || "EUR"}`;
  }
}

function rowToViewModel(row) {
  const createdAt = row.created_at || row.createdAt || "";
  return {
    id: String(row.id),
    supabaseId: row.id,
    createdAt,
    client: {
      name: row.client_name || "",
      phone: row.client_phone || "",
      email: row.client_email || "",
      hotel: row.client_hotel || "",
    },
    notes: row.notes || "",
    total: row.total || 0,
    currency: row.currency || "EUR",
    parsedItems: parseItems(row.items),
  };
}

/**
 * Demandes catalogue public — source : table `public_quotes` (pas `quotes`).
 */
export function PublicDevisPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError("Supabase non configuré.");
      return;
    }
    setError("");
    try {
      const { data, err } = await supabase
        .from("public_quotes")
        .select(
          "id, client_name, client_phone, client_email, client_hotel, notes, total, currency, items, created_at"
        )
        .eq("site_key", SITE_KEY)
        .order("created_at", { ascending: false })
        .limit(500);

      if (err) {
        logger.error("PublicDevisPage load:", err);
        setError(err.message || "Impossible de charger les devis publics.");
        setRows([]);
        return;
      }
      setRows((data || []).map(rowToViewModel));
    } catch (e) {
      logger.error("PublicDevisPage load:", e);
      setError("Erreur inattendue au chargement.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("public-quotes-intranet")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "public_quotes",
          filter: getQuotesRealtimeSiteKeyFilter(),
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">
        Chargement des demandes catalogue public…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-900">
        {error}
        <p className="mt-2 text-xs font-normal text-red-800">
          Vérifiez d&apos;avoir exécuté le script SQL <code className="rounded bg-red-100 px-1">supabase_public_quotes_table.sql</code>{" "}
          sur votre projet Supabase.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-700">
        Aucune demande reçue depuis la page publique pour le moment.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((quote) => (
        <article key={quote.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-slate-900">{quote.client?.name || "Client sans nom"}</h3>
            <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-teal-900">
              Catalogue public
            </span>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <p>
              <span className="font-semibold">Téléphone :</span> {quote.client?.phone || "—"}
            </p>
            <p>
              <span className="font-semibold">Email :</span> {quote.client?.email || "—"}
            </p>
            <p>
              <span className="font-semibold">Hôtel :</span> {quote.client?.hotel || "—"}
            </p>
            <p>
              <span className="font-semibold">Date de demande :</span>{" "}
              {quote.createdAt ? new Date(quote.createdAt).toLocaleString("fr-FR") : "—"}
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[580px] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-600">
                  <th className="py-2 pr-2">Activité</th>
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2 text-right">A</th>
                  <th className="py-2 pr-2 text-right">E</th>
                  <th className="py-2 pr-2 text-right">B</th>
                  <th className="py-2 text-right">Sous-total</th>
                </tr>
              </thead>
              <tbody>
                {quote.parsedItems.map((item, index) => (
                  <tr key={`${quote.id}-item-${index}`} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-medium text-slate-900">{item.activityName || "—"}</td>
                    <td className="py-2 pr-2">{item.date || "—"}</td>
                    <td className="py-2 pr-2 text-right">{item.adults ?? 0}</td>
                    <td className="py-2 pr-2 text-right">{item.children ?? 0}</td>
                    <td className="py-2 pr-2 text-right">{item.babies ?? 0}</td>
                    <td className="py-2 text-right font-semibold">{formatMoney(item.lineTotal || 0, quote.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Note client :</span> {quote.notes || "—"}
            </p>
            <p className="text-base font-black text-slate-900">{formatMoney(quote.total || 0, quote.currency)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

import { useMemo } from "react";

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

function isPublicQuote(quote) {
  return String(quote?.createdByName || "").trim().toLowerCase() === "public devis";
}

export function PublicDevisPage({ quotes }) {
  const publicQuotes = useMemo(() => {
    return (quotes || [])
      .filter(isPublicQuote)
      .map((quote) => ({
        ...quote,
        parsedItems: parseItems(quote.items),
      }))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [quotes]);

  if (publicQuotes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-700">
        Aucun devis reçu depuis la page publique pour le moment.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {publicQuotes.map((quote) => (
        <article key={quote.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-slate-900">{quote.client?.name || "Client sans nom"}</h3>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-800">
              Public Devis
            </span>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <p>
              <span className="font-semibold">Téléphone:</span> {quote.client?.phone || "-"}
            </p>
            <p>
              <span className="font-semibold">Email:</span> {quote.client?.email || "-"}
            </p>
            <p>
              <span className="font-semibold">Hôtel:</span> {quote.client?.hotel || "-"}
            </p>
            <p>
              <span className="font-semibold">Date de demande:</span>{" "}
              {quote.createdAt ? new Date(quote.createdAt).toLocaleString("fr-FR") : "-"}
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
                    <td className="py-2 pr-2 font-medium text-slate-900">{item.activityName || "-"}</td>
                    <td className="py-2 pr-2">{item.date || "-"}</td>
                    <td className="py-2 pr-2 text-right">{item.adults || 0}</td>
                    <td className="py-2 pr-2 text-right">{item.children || 0}</td>
                    <td className="py-2 pr-2 text-right">{item.babies || 0}</td>
                    <td className="py-2 text-right font-semibold">{formatMoney(item.lineTotal || 0, quote.currency || "EUR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Note client:</span> {quote.notes || "-"}
            </p>
            <p className="text-base font-black text-slate-900">{formatMoney(quote.total || 0, quote.currency || "EUR")}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

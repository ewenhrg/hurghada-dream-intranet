import { useState, useMemo } from "react";
import { currency } from "../utils";
import { TextInput } from "../components/ui";

export function HistoryPage({ quotes }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return quotes;
    const needle = q.replace(/\D+/g, "");
    return quotes.filter((d) => (d.client?.phone || "").replace(/\D+/g, "").includes(needle));
  }, [q, quotes]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <TextInput
        placeholder="Rechercher par numéro de téléphone"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />
      <div className="space-y-3">
        {filtered.map((d) => (
          <div key={d.id} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500">{new Date(d.createdAt).toLocaleString("fr-FR")}</p>
                <p className="text-sm text-gray-700">
                  {d.client?.phone || "Tél ?"} — {d.client?.hotel || "Hôtel ?"} ({d.client?.room || "ch ?"})
                </p>
              </div>
              <p className="text-base font-semibold">{currency(d.total, d.currency)}</p>
            </div>
            <div className="mt-2 space-y-1">
              {d.items.map((li, i) => (
                <div key={i} className="text-xs text-gray-500 border-t pt-1">
                  {li.activityName} — {new Date(li.date + "T12:00:00").toLocaleDateString("fr-FR")}
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Aucun devis trouvé.</p>}
      </div>
    </div>
  );
}


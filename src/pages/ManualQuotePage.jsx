import { useMemo, useState } from "react";
import { Plus, Printer, Trash2 } from "lucide-react";
import { NEIGHBORHOODS } from "../constants";
import { supabase } from "../lib/supabase";
import { currencyNoCents, formatPhoneWithPlus } from "../utils";
import {
  computeManualQuoteTotal,
  emptyManualClient,
  emptyManualLine,
  normalizeManualLines,
  saveManualQuote,
} from "../utils/manualQuotes";
import { generateManualQuoteHTML } from "../utils/printTemplates";
import { toast } from "../utils/toast.js";

const fieldClass =
  "w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-base font-medium text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

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
  const [client, setClient] = useState(() => emptyManualClient());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([emptyManualLine()]);
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => computeManualQuoteTotal(lines), [lines]);
  const validLines = useMemo(
    () => normalizeManualLines(lines).filter((line) => line.label.trim()),
    [lines]
  );
  const canPrint = validLines.length > 0 && Boolean(client.name.trim()) && Boolean(client.phone.trim());

  const updateClient = (patch) => setClient((prev) => ({ ...prev, ...patch }));

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
    if (!client.name.trim() || !client.phone.trim()) {
      toast.warning("Nom et téléphone client obligatoires.");
      return;
    }
    if (client.isAirbnb && !String(client.airbnbMapsUrl || "").trim()) {
      toast.warning("Lien Google Maps obligatoire pour un Airbnb.");
      return;
    }
    const cleaned = normalizeManualLines(lines).filter((line) => line.label.trim());
    if (cleaned.length === 0) {
      toast.warning("Ajoutez au moins une ligne avec une désignation.");
      return;
    }
    setSaving(true);
    const draft = {
      client,
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
    setClient(emptyManualClient());
    setNote("");
    setLines([emptyManualLine()]);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-indigo-300 bg-white p-4 shadow-sm md:p-5">
        <h3 className="mb-4 text-lg font-extrabold text-slate-950">Informations client</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Nom complet *
            </span>
            <input
              type="text"
              value={client.name}
              onChange={(e) => updateClient({ name: e.target.value })}
              placeholder="Jean Dupont"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Téléphone *
            </span>
            <input
              type="tel"
              value={formatPhoneWithPlus(client.phone)}
              onChange={(e) => updateClient({ phone: formatPhoneWithPlus(e.target.value) })}
              placeholder="+33 6 12 34 56 78"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Numéro d&apos;urgence
            </span>
            <input
              type="tel"
              value={formatPhoneWithPlus(client.emergencyPhone || "")}
              onChange={(e) => updateClient({ emergencyPhone: formatPhoneWithPlus(e.target.value) })}
              placeholder="+33 6 12 34 56 78"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Email
            </span>
            <input
              type="email"
              value={client.email || ""}
              onChange={(e) => updateClient({ email: e.target.value })}
              placeholder="email@exemple.com"
              className={fieldClass}
            />
          </label>
          <div className="block sm:col-span-2">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Hôtel</span>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800">
                <input
                  type="checkbox"
                  className="size-3.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                  checked={Boolean(client.isAirbnb)}
                  onChange={(e) =>
                    updateClient({
                      isAirbnb: e.target.checked,
                      airbnbMapsUrl: e.target.checked ? client.airbnbMapsUrl || "" : "",
                    })
                  }
                />
                Airbnb
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={client.hotel}
                onChange={(e) => updateClient({ hotel: e.target.value })}
                placeholder={client.isAirbnb ? "Nom / libellé Airbnb (optionnel)" : "Nom de l'hôtel"}
                className={`${fieldClass} flex-1`}
              />
              {(client.hotel || (client.isAirbnb && client.airbnbMapsUrl)) && (
                <button
                  type="button"
                  onClick={() => {
                    if (client.isAirbnb && String(client.airbnbMapsUrl || "").trim()) {
                      window.open(String(client.airbnbMapsUrl).trim(), "_blank", "noopener,noreferrer");
                      return;
                    }
                    const hotelName = encodeURIComponent(client.hotel);
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${hotelName}+Hurghada+Egypt`,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                  className="rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white hover:bg-indigo-700"
                >
                  📍 Maps
                </button>
              )}
            </div>
            {client.isAirbnb ? (
              <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-rose-800">
                    Lien Google Maps *
                  </span>
                  <input
                    type="url"
                    value={client.airbnbMapsUrl || ""}
                    onChange={(e) => updateClient({ airbnbMapsUrl: e.target.value })}
                    placeholder="https://maps.google.com/... ou maps.app.goo.gl/..."
                    className={fieldClass}
                  />
                </label>
              </div>
            ) : null}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Numéro de chambre
            </span>
            <input
              type="text"
              value={client.room}
              onChange={(e) => updateClient({ room: e.target.value })}
              placeholder="Ex: 205"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Quartier
            </span>
            <select
              value={client.neighborhood}
              onChange={(e) => updateClient({ neighborhood: e.target.value })}
              className={fieldClass}
            >
              <option value="">— Sélectionner un quartier —</option>
              {NEIGHBORHOODS.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Date d&apos;arrivée
            </span>
            <input
              type="date"
              value={client.arrivalDate || ""}
              onChange={(e) => updateClient({ arrivalDate: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Date de départ
            </span>
            <input
              type="date"
              value={client.departureDate || ""}
              onChange={(e) => updateClient({ departureDate: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="block sm:col-span-2 lg:col-span-3">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Note (optionnel)
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Infos complémentaires"
              className={fieldClass}
            />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={line.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
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
                  className={fieldClass}
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
                  className={fieldClass}
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
                  className={`${fieldClass} font-semibold tabular-nums`}
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

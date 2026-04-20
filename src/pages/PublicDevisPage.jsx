import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, getQuotesRealtimeSiteKeyFilter } from "../constants";
import { SPEED_BOAT_EXTRAS } from "../constants/activityExtras";
import { logger } from "../utils/logger";
import { toast } from "../utils/toast.js";
import { PrimaryBtn } from "../components/ui";
import {
  buildQuoteDraftFromPublicViewModel,
  HD_PUBLIC_QUOTE_TO_DRAFT_EVENT,
} from "../utils/publicQuoteToDraft";

/** Les lignes plus anciennes sont supprimées en base (affichage côté « Devis public »). */
const PUBLIC_QUOTE_TTL_MS = 24 * 60 * 60 * 1000;
const PUBLIC_QUOTES_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

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

function digitsOnly(s) {
  return String(s ?? "").replace(/\D/g, "");
}

function normalizeSpeedBoatExtras(item) {
  const raw = item?.speedBoatExtra;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (raw && typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

/**
 * Détail des options enregistrées depuis le catalogue public (ligne `items` JSON).
 */
function getCatalogLineOptionLines(item) {
  if (!item || typeof item !== "object") return [];
  const lines = [];

  if (item.extraDolphin) {
    lines.push("Dauphin (+20 € sur la ligne)");
  }
  for (const id of normalizeSpeedBoatExtras(item)) {
    const ex = SPEED_BOAT_EXTRAS.find((e) => e.id === id);
    if (ex?.id) {
      lines.push(`${ex.label} (+${ex.priceAdult} € / adulte · +${ex.priceChild} € / enfant)`);
    } else if (id) {
      lines.push(`Formule / île : ${id}`);
    }
  }

  const bs = Number(item.buggySimple) || 0;
  const bf = Number(item.buggyFamily) || 0;
  if (bs > 0) lines.push(`Buggy simple × ${bs}`);
  if (bf > 0) lines.push(`Buggy family × ${bf}`);

  const y250 = Number(item.yamaha250) || 0;
  const k640 = Number(item.ktm640) || 0;
  const k530 = Number(item.ktm530) || 0;
  if (y250 > 0) lines.push(`Moto Yamaha 250 × ${y250}`);
  if (k640 > 0) lines.push(`Moto KTM 640 × ${k640}`);
  if (k530 > 0) lines.push(`Moto KTM 530 × ${k530}`);

  if (item.cairePrivatif4pax) lines.push("Caire privatif — 4 personnes");
  if (item.cairePrivatif5pax) lines.push("Caire privatif — 5 personnes");
  if (item.cairePrivatif6pax) lines.push("Caire privatif — 6 personnes");
  if (item.louxorPrivatif4pax) lines.push("Louxor privatif — 4 personnes");
  if (item.louxorPrivatif5pax) lines.push("Louxor privatif — 5 personnes");
  if (item.louxorPrivatif6pax) lines.push("Louxor privatif — 6 personnes");

  if (item.allerSimple && !item.allerRetour) lines.push("Transfert : aller simple");
  if (item.allerRetour) lines.push("Transfert : aller-retour");

  const zt = [
    [item.zeroTracasTransfertVisaSim, "Zéro tracas — transfert + visa + SIM"],
    [item.zeroTracasTransfertVisa, "Zéro tracas — transfert + visa"],
    [item.zeroTracasTransfert3Personnes, "Zéro tracas — transfert (≤ 3 pers.)"],
    [item.zeroTracasTransfertPlus3Personnes, "Zéro tracas — transfert (> 3 pers.)"],
    [item.zeroTracasVisaSim, "Zéro tracas — visa + SIM"],
    [item.zeroTracasVisaSeul, "Zéro tracas — visa seul"],
  ];
  for (const [val, label] of zt) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) {
      lines.push(`${label} × ${n}`);
      continue;
    }
    const t = val != null ? String(val).trim() : "";
    if (t && t !== "0") lines.push(`${label} : ${t}`);
  }

  return lines;
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
      arrivalDate: row.client_arrival_date || "",
      departureDate: row.client_departure_date || "",
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
  const [phoneFilter, setPhoneFilter] = useState("");

  const phoneSearchDigits = useMemo(() => digitsOnly(phoneFilter), [phoneFilter]);

  const filteredRows = useMemo(() => {
    if (!phoneSearchDigits) return rows;
    return rows.filter((q) => {
      const p = digitsOnly(q.client?.phone);
      return p.includes(phoneSearchDigits);
    });
  }, [rows, phoneSearchDigits]);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError("Supabase non configuré.");
      return;
    }
    setError("");
    try {
      const { data, error: loadError } = await supabase
        .from("public_quotes")
        .select(
          "id, client_name, client_phone, client_email, client_hotel, client_arrival_date, client_departure_date, notes, total, currency, items, created_at"
        )
        .eq("site_key", SITE_KEY)
        .order("created_at", { ascending: false })
        .limit(500);

      if (loadError) {
        logger.error("PublicDevisPage load:", loadError);
        setError(loadError.message || "Impossible de charger les devis publics.");
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

  const deleteExpiredPublicQuotes = useCallback(async () => {
    if (!supabase) return;
    const cutoff = new Date(Date.now() - PUBLIC_QUOTE_TTL_MS).toISOString();
    const { error } = await supabase.from("public_quotes").delete().eq("site_key", SITE_KEY).lt("created_at", cutoff);
    if (error) {
      logger.warn("PublicDevisPage — suppression des demandes > 24h :", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      await deleteExpiredPublicQuotes();
      if (!cancelled) {
        await load();
      }
    };

    bootstrap();
    const intervalId = setInterval(async () => {
      await deleteExpiredPublicQuotes();
      if (!cancelled) {
        await load();
      }
    }, PUBLIC_QUOTES_CLEANUP_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [load, deleteExpiredPublicQuotes]);

  const handleStartDevis = useCallback(
    (quote) => {
      const draft = buildQuoteDraftFromPublicViewModel(quote);
      window.dispatchEvent(new CustomEvent(HD_PUBLIC_QUOTE_TO_DRAFT_EVENT, { detail: draft }));
      toast.success("Ouverture de l’onglet Devis — pensez à vérifier les infos avant validation.");
    },
    []
  );

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

  const showNoPhoneMatch = filteredRows.length === 0;

  return (
    <div className="space-y-5">
      <p className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-xs font-medium text-slate-700">
        Les demandes de plus de <strong>24 h</strong> sont supprimées automatiquement. Le bouton « Commencer le
        devis » ouvre l’onglet Devis avec le formulaire prérempli — la demande reste affichée ici.
      </p>

      {rows.length > 0 && (
        <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/40 px-4 py-3 shadow-sm sm:px-5 sm:py-4">
          <label htmlFor="public-devis-phone-search" className="block text-xs font-bold uppercase tracking-wide text-indigo-950">
            Rechercher par numéro de téléphone
          </label>
          <input
            id="public-devis-phone-search"
            type="search"
            value={phoneFilter}
            onChange={(e) => setPhoneFilter(e.target.value)}
            placeholder="Ex. 06 12 34 56 78 ou partie du numéro"
            autoComplete="off"
            className="mt-2 w-full rounded-xl border-2 border-indigo-200/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <p className="mt-2 text-[11px] font-medium text-indigo-900/80">
            {phoneSearchDigits ? (
              <>
                {filteredRows.length} demande{filteredRows.length > 1 ? "s" : ""} correspondant au filtre ·{" "}
                <button
                  type="button"
                  className="font-bold text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                  onClick={() => setPhoneFilter("")}
                >
                  Réinitialiser
                </button>
              </>
            ) : (
              `${rows.length} demande${rows.length > 1 ? "s" : ""} affichée${rows.length > 1 ? "s" : ""}`
            )}
          </p>
        </div>
      )}

      {showNoPhoneMatch && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-950">
          Aucune demande ne correspond à ce numéro. Vérifie les chiffres saisis ou efface la recherche.
        </div>
      )}

      <div className="space-y-8">
        {filteredRows.map((quote) => (
          <article
            key={quote.id}
            className="overflow-hidden rounded-2xl border-2 border-indigo-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-[0_12px_40px_-18px_rgba(30,27,75,0.22)] ring-1 ring-slate-200/80"
          >
            <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-violet-50/50 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-indigo-600">Demande catalogue</p>
                  <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
                    {quote.client?.name || "Client sans nom"}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <PrimaryBtn
                    type="button"
                    className="!min-h-0 !min-w-0 !text-sm !px-4 !py-2 whitespace-nowrap bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 border-0 shadow-md shadow-indigo-500/20"
                    onClick={() => handleStartDevis(quote)}
                  >
                    Commencer le devis
                  </PrimaryBtn>
                  <span className="rounded-full bg-teal-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-teal-900 ring-1 ring-teal-600/30">
                    Public
                  </span>
                </div>
              </div>
            </div>

            <div className="border-b border-slate-200/90 bg-slate-50/95 px-4 py-4 sm:px-6">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Coordonnées & séjour</p>
              <div className="grid gap-3 text-sm text-slate-800 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Téléphone</span>
                  <p className="mt-0.5 font-semibold text-slate-950">{quote.client?.phone || "—"}</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500">E-mail</span>
                  <p className="mt-0.5 break-all font-semibold text-slate-950">{quote.client?.email || "—"}</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm sm:col-span-2 lg:col-span-1">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Hôtel / lieu</span>
                  <p className="mt-0.5 font-semibold text-slate-950">{quote.client?.hotel || "—"}</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Arrivée</span>
                  <p className="mt-0.5 font-semibold text-slate-950">
                    {quote.client?.arrivalDate
                      ? new Date(`${quote.client.arrivalDate}T12:00:00`).toLocaleDateString("fr-FR")
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Départ</span>
                  <p className="mt-0.5 font-semibold text-slate-950">
                    {quote.client?.departureDate
                      ? new Date(`${quote.client.departureDate}T12:00:00`).toLocaleDateString("fr-FR")
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Date de la demande</span>
                  <p className="mt-0.5 font-semibold text-slate-950">
                    {quote.createdAt ? new Date(quote.createdAt).toLocaleString("fr-FR") : "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-2 py-4 sm:px-4 sm:py-5">
              <p className="mb-3 px-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:px-1">Activités demandées</p>
              <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-inner">
                <table className="min-w-[720px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/90 text-left text-[11px] uppercase tracking-wide text-slate-600">
                      <th className="py-3 pl-4 pr-2">Activité & options</th>
                      <th className="py-3 pr-2">Date</th>
                      <th className="py-3 pr-2 text-right">A</th>
                      <th className="py-3 pr-2 text-right">E</th>
                      <th className="py-3 pr-2 text-right">B</th>
                      <th className="py-3 pr-4 text-right">Sous-total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.parsedItems.map((item, index) => {
                      const optionLines = getCatalogLineOptionLines(item);
                      return (
                        <tr
                          key={`${quote.id}-item-${index}`}
                          className="border-b border-slate-100 align-top last:border-b-0"
                        >
                          <td className="py-3 pl-4 pr-2">
                            <p className="font-semibold text-slate-950">{item.activityName || "—"}</p>
                            {optionLines.length > 0 ? (
                              <ul className="mt-2 space-y-1 border-l-2 border-teal-400/70 pl-3 text-xs font-medium leading-snug text-slate-700">
                                {optionLines.map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                              </ul>
                            ) : null}
                          </td>
                          <td className="py-3 pr-2 font-medium text-slate-800 whitespace-nowrap">{item.date || "—"}</td>
                          <td className="py-3 pr-2 text-right tabular-nums">{item.adults ?? 0}</td>
                          <td className="py-3 pr-2 text-right tabular-nums">{item.children ?? 0}</td>
                          <td className="py-3 pr-2 text-right tabular-nums">{item.babies ?? 0}</td>
                          <td className="py-3 pr-4 text-right font-bold tabular-nums text-slate-900">
                            {formatMoney(item.lineTotal || 0, quote.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t-2 border-indigo-100 bg-white px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Message / précisions client</p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-slate-800">{quote.notes?.trim() ? quote.notes : "—"}</p>
              </div>
              <div className="shrink-0 rounded-xl border-2 border-indigo-200/80 bg-indigo-50/60 px-4 py-3 text-right shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-800">Total estimé</p>
                <p className="mt-1 font-display text-2xl font-black tabular-nums text-slate-950">
                  {formatMoney(quote.total || 0, quote.currency)}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

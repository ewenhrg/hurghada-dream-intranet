import { useCallback, useEffect, useState } from "react";
import { SITE_KEY } from "../constants";
import { supabase } from "../lib/supabase";
import { voidTicketAllocations } from "../utils/ticketSequence";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";

const MAX_NUMBERS = 50;

function parseTicketNumbers(raw) {
  const seen = new Set();
  const numbers = [];
  for (const part of String(raw || "").split(/[\s,;]+/)) {
    const number = part.trim();
    if (!number) continue;
    const key = number.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    numbers.push(number);
  }
  return numbers;
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VoidTicketNumbersPage() {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [voided, setVoided] = useState([]);

  const loadVoided = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("ticket_allocations")
      .select("ticket_number, updated_at")
      .eq("site_key", SITE_KEY)
      .eq("status", "void")
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) {
      logger.warn("Liste des numéros annulés:", error);
      return;
    }
    setVoided(data || []);
  }, []);

  useEffect(() => {
    void loadVoided();
  }, [loadVoided]);

  const burn = async () => {
    const numbers = parseTicketNumbers(raw);
    if (!numbers.length) {
      toast.warning("Indique au moins un numéro de ticket.");
      return;
    }
    if (numbers.length > MAX_NUMBERS) {
      toast.warning(`Maximum ${MAX_NUMBERS} numéros à la fois.`);
      return;
    }
    const invalid = numbers.filter((number) => !/^\d{1,12}$/.test(number));
    if (invalid.length) {
      toast.warning(`Numéro invalide : ${invalid.join(", ")}`);
      return;
    }
    if (!supabase) {
      toast.error("Connexion indispensable pour annuler un numéro.");
      return;
    }
    const confirmed = window.confirm(
      `Annuler définitivement ${numbers.join(", ")} ?\n\nCes numéros ne seront plus jamais attribués, même s’ils n’étaient sur aucun devis.`
    );
    if (!confirmed) return;

    setBusy(true);
    setNote("");
    try {
      const blocked = [];
      const already = [];
      const fresh = [];
      for (const number of numbers) {
        const { data: taken, error: takenError } = await supabase.rpc("ticket_number_in_quotes", {
          p_site_key: SITE_KEY,
          p_ticket_number: number,
        });
        if (takenError) throw takenError;
        if (taken === true) {
          blocked.push(number);
          continue;
        }
        const { data: row, error: rowError } = await supabase
          .from("ticket_allocations")
          .select("status, ticket_number")
          .eq("site_key", SITE_KEY)
          .eq("ticket_number", number)
          .maybeSingle();
        if (rowError) throw rowError;
        if (row?.status === "void") {
          already.push(row.ticket_number || number);
          continue;
        }
        fresh.push(number);
      }

      if (fresh.length) {
        const burned = await voidTicketAllocations(supabase, fresh);
        if (!burned.ok) throw burned.error || new Error("Annulation impossible");
      }

      const parts = [];
      if (fresh.length) parts.push(`${fresh.join(", ")} annulé${fresh.length > 1 ? "s" : ""} définitivement.`);
      if (already.length) parts.push(`${already.join(", ")} était déjà annulé.`);
      if (blocked.length) {
        parts.push(`${blocked.join(", ")} est déjà sur un devis. Annule l’activité depuis Modifications.`);
      }
      const message = parts.join(" ");
      setNote(message);
      if (fresh.length) toast.success(fresh.length > 1 ? `${fresh.length} numéros annulés.` : `Numéro ${fresh[0]} annulé.`);
      else if (blocked.length) toast.warning("Aucun numéro libre n’a été annulé.");
      else toast.info("Ces numéros étaient déjà annulés.");
      if (fresh.length) setRaw("");
      await loadVoided();
    } catch (err) {
      logger.error("Annulation de numéro:", err);
      toast.error("L’annulation n’a pas abouti.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-rose-100">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-600">Numéro mort</p>
        <p className="mt-1 text-sm font-semibold text-slate-700">
          Un numéro annulé ici sort du carnet pour toujours. Il n’a pas besoin d’être déjà attribué.
        </p>
        <label className="mt-4 block">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Numéro de ticket</span>
          <textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={3}
            placeholder="187004"
            className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-rose-400"
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">Plusieurs numéros possibles, séparés par un espace, une virgule ou un retour à la ligne.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void burn()}
          className="mt-4 min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? "Annulation…" : "Annuler définitivement"}
        </button>
        {note ? <p className="mt-3 text-sm font-semibold text-slate-800">{note}</p> : null}
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Déjà annulés</p>
        {voided.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun numéro annulé.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {voided.map((row) => (
              <li key={row.ticket_number} className="flex items-center justify-between gap-3 py-2">
                <span className="font-mono text-sm font-bold text-slate-900">{row.ticket_number}</span>
                <span className="text-xs text-slate-500">{formatWhen(row.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

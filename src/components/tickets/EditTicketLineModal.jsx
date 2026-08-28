import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { SITE_KEY, LS_KEYS } from "../../constants";
import { saveQuotesCache, calculateCardPrice } from "../../utils";
import { computePaidColumnsFromItems, findTicketNumberConflict } from "../../utils/ticketCollections";
import { isBoatPartyActivity } from "../../utils/activityHelpers";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../ui";
import { toast } from "../../utils/toast.js";
import { logger } from "../../utils/logger";

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

/**
 * Édition rapide d’une ligne ticket (champs ops).
 * Hôtel / chambre / client : niveau devis (impactent toutes les lignes du même devis).
 */
export function EditTicketLineModal({ open, row, quotes, setQuotes, onClose }) {
  const [ticketNumber, setTicketNumber] = useState("");
  const [date, setDate] = useState("");
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [hotel, setHotel] = useState("");
  const [room, setRoom] = useState("");
  const [adults, setAdults] = useState(0);
  const [children, setChildren] = useState(0);
  const [babies, setBabies] = useState(0);
  const [boatPartyMen, setBoatPartyMen] = useState(0);
  const [boatPartyWomen, setBoatPartyWomen] = useState(0);
  const [pickup, setPickup] = useState("");
  const [priceValue, setPriceValue] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saving, setSaving] = useState(false);

  const isBoatParty = isBoatPartyActivity(row?.activityBaseName || row?.activity || "");

  useEffect(() => {
    if (!open || !row) return;
    setTicketNumber(row.ticketNumber || "");
    setDate(row.date || "");
    setClientName(row.clientName || "");
    setPhone(row.phone || "");
    setHotel(row.hotel || "");
    setRoom(row.room || "");
    setAdults(Number(row.adults) || 0);
    setChildren(Number(row.children) || 0);
    setBabies(Number(row.babies) || 0);
    setBoatPartyMen(Number(row.boatPartyMen) || 0);
    setBoatPartyWomen(Number(row.boatPartyWomen) || 0);
    setPickup(row.pickup || "");
    setPriceValue(Number(row.priceValue) || 0);
    setPaymentMethod(row.paymentMethod || "");
    setSaving(false);
  }, [open, row]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, saving, onClose]);

  if (!open || !row) return null;

  const handleSave = async () => {
    const quote = (quotes || []).find((q) => q.id === row.quoteId);
    if (!quote) {
      toast.error("Devis introuvable pour cette ligne.");
      return;
    }

    const itemIndex = row.itemIndex;
    if (itemIndex == null || !quote.items?.[itemIndex]) {
      toast.error("Ligne d’activité introuvable.");
      return;
    }

    const nextTicket = String(ticketNumber || "").trim();
    if (!nextTicket) {
      toast.warning("Le numéro de ticket est obligatoire.");
      return;
    }

    const duplicate = findTicketNumberConflict(quotes, nextTicket, {
      excludeQuoteId: row.quoteId,
      excludeItemIndex: itemIndex,
    });
    if (duplicate) {
      toast.warning(`Numéro déjà utilisé : ${nextTicket}`);
      return;
    }

    const duplicateInQuote = (quote.items || []).some(
      (it, idx) =>
        idx !== itemIndex && String(it.ticketNumber || "").trim().toLowerCase() === nextTicket.toLowerCase()
    );
    if (duplicateInQuote) {
      toast.warning(`Numéro en double dans le devis : ${nextTicket}`);
      return;
    }

    const transferValue = Math.round(Number(row.transferValue) || 0);
    const nextPrice = Math.max(0, toInt(priceValue, 0));
    const nextLineTotal = nextPrice + transferValue;

    setSaving(true);
    try {
      const originalItem = quote.items[itemIndex];
      const enteredAt = originalItem.ticketsEnteredAt || new Date().toISOString();
      const patchedItem = {
        ...originalItem,
        ticketNumber: nextTicket,
        date: date || "",
        pickupTime: String(pickup || "").trim(),
        paymentMethod: paymentMethod || "",
        lineTotal: nextLineTotal,
        ticketsEnteredAt: enteredAt,
      };

      if (isBoatParty) {
        patchedItem.boatPartyMen = toInt(boatPartyMen, 0);
        patchedItem.boatPartyWomen = toInt(boatPartyWomen, 0);
        patchedItem.adults = toInt(boatPartyMen, 0) + toInt(boatPartyWomen, 0);
        patchedItem.children = 0;
        patchedItem.babies = 0;
      } else {
        patchedItem.adults = toInt(adults, 0);
        patchedItem.children = toInt(children, 0);
        patchedItem.babies = toInt(babies, 0);
      }

      const nextItems = quote.items.map((it, idx) => (idx === itemIndex ? patchedItem : it));
      const nextTotal = nextItems.reduce((sum, it) => sum + (Math.round(Number(it.lineTotal) || 0)), 0);
      const { paidCash, paidStripe } = computePaidColumnsFromItems(nextItems);

      const updatedQuote = {
        ...quote,
        client: {
          ...(quote.client || {}),
          name: String(clientName || "").trim(),
          phone: String(phone || "").trim(),
          hotel: String(hotel || "").trim(),
          room: String(room || "").trim(),
        },
        items: nextItems,
        total: nextTotal,
        totalCash: nextTotal,
        totalCard: calculateCardPrice(nextTotal),
        paidCash,
        paidStripe,
        ticketsEnteredAt: quote.ticketsEnteredAt || enteredAt,
        updated_at: new Date().toISOString(),
      };

      const updatedQuotes = (quotes || []).map((q) => (q.id === quote.id ? updatedQuote : q));
      setQuotes(updatedQuotes);
      saveQuotesCache(updatedQuotes);

      if (supabase) {
        const supabaseUpdate = {
          client_name: updatedQuote.client.name || "",
          client_phone: updatedQuote.client.phone || "",
          client_hotel: updatedQuote.client.hotel || "",
          client_room: updatedQuote.client.room || "",
          total: updatedQuote.total,
          paid_cash: paidCash,
          paid_stripe: paidStripe,
          items: updatedQuote.items,
          updated_at: updatedQuote.updated_at,
        };

        let updateQuery = supabase
          .from("quotes")
          .update(supabaseUpdate)
          .eq("site_key", SITE_KEY);

        if (quote.supabase_id) {
          updateQuery = updateQuery.eq("id", quote.supabase_id);
        } else {
          updateQuery = updateQuery
            .eq("client_phone", quote.client?.phone || "")
            .eq("created_at", quote.createdAt);
        }

        const { error } = await updateQuery;
        if (error) {
          logger.error("Erreur mise à jour ticket:", error);
          toast.error("Enregistré en local, mais la sync Supabase a échoué.");
        } else {
          toast.success(`Ticket ${nextTicket} mis à jour.`);
        }
      } else {
        toast.success(`Ticket ${nextTicket} mis à jour.`);
      }

      onClose?.();
    } catch (err) {
      logger.error("Erreur sauvegarde ticket:", err);
      toast.error("Impossible d’enregistrer la ligne.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-ticket-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose?.();
      }}
    >
      <div className="max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-indigo-100/80 bg-white shadow-[0_24px_60px_-28px_rgba(79,70,229,0.55)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3.5 backdrop-blur-md md:px-5">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-600">
              <Pencil className="size-3.5" aria-hidden />
              Modifier la ligne
            </p>
            <h3 id="edit-ticket-title" className="mt-0.5 truncate text-base font-semibold text-slate-900 md:text-lg">
              {row.activityBaseName || row.activity || "Activité"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Hôtel, chambre et client s’appliquent à tout le devis.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose?.()}
            aria-label="Fermer"
            className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 md:px-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">N° ticket</span>
              <TextInput
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                className="!py-2.5"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Date</span>
              <TextInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="!py-2.5"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Client</span>
              <TextInput
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="!py-2.5"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Téléphone</span>
              <TextInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="!py-2.5"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Hôtel</span>
              <TextInput
                value={hotel}
                onChange={(e) => setHotel(e.target.value)}
                className="!py-2.5"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Chambre</span>
              <TextInput
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className="!py-2.5"
              />
            </label>
          </div>

          {isBoatParty ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Garçons</span>
                <NumberInput
                  min={0}
                  value={boatPartyMen}
                  onChange={(e) => setBoatPartyMen(e.target.value)}
                  className="!py-2.5"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Filles</span>
                <NumberInput
                  min={0}
                  value={boatPartyWomen}
                  onChange={(e) => setBoatPartyWomen(e.target.value)}
                  className="!py-2.5"
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Adultes</span>
                <NumberInput
                  min={0}
                  value={adults}
                  onChange={(e) => setAdults(e.target.value)}
                  className="!py-2.5"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Enfants</span>
                <NumberInput
                  min={0}
                  value={children}
                  onChange={(e) => setChildren(e.target.value)}
                  className="!py-2.5"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Bébés</span>
                <NumberInput
                  min={0}
                  value={babies}
                  onChange={(e) => setBabies(e.target.value)}
                  className="!py-2.5"
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Heure / prise en charge</span>
              <TextInput
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                placeholder="ex. 08:30"
                className="!py-2.5"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">
                Prix activité {transferValueHint(row.transferValue)}
              </span>
              <NumberInput
                min={0}
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                className="!py-2.5"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Paiement</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-[var(--hd-surface-input)] px-4 py-2.5 text-base text-slate-800 outline-none transition-all focus:border-[rgba(79,70,229,0.7)] focus:ring-2 focus:ring-[rgba(79,70,229,0.3)]"
            >
              <option value="">—</option>
              <option value="cash">Cash</option>
              <option value="stripe">Stripe</option>
            </select>
          </label>

          <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Le prix n’est pas recalculé automatiquement si vous changez les participants — ajustez-le si besoin.
            Le supplément transfert ({Math.round(Number(row.transferValue) || 0)}) est conservé.
          </p>
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-md md:px-5">
          <GhostBtn type="button" onClick={() => !saving && onClose?.()} disabled={saving}>
            Annuler
          </GhostBtn>
          <PrimaryBtn type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

function transferValueHint(transferValue) {
  const n = Math.round(Number(transferValue) || 0);
  return n > 0 ? `(hors transfert ${n})` : "";
}

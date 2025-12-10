import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { LS_KEYS } from "../../constants";
import { currency, saveLS } from "../../utils";
import { TextInput, PrimaryBtn, GhostBtn } from "../ui";
import { toast } from "../../utils/toast.js";
import { logger } from "../../utils/logger";

export function PaymentModal({ 
  show, 
  selectedQuote, 
  quotes, 
  setQuotes, 
  user, 
  onClose 
}) {
  const [ticketNumbers, setTicketNumbers] = useState({});
  const [paymentMethods, setPaymentMethods] = useState({});

  if (!show || !selectedQuote) return null;

  const handleSave = async () => {
    // Vérifier que tous les tickets sont renseignés
    const allFilled = selectedQuote.items?.every((_, idx) => ticketNumbers[idx]?.trim());
    if (!allFilled) {
      toast.warning("Veuillez renseigner tous les numéros de ticket.");
      return;
    }

    // Vérifier que toutes les méthodes de paiement sont sélectionnées
    const allPaymentMethodsSelected = selectedQuote.items?.every((_, idx) => {
      if (selectedQuote.items[idx].paymentMethod && selectedQuote.items[idx].paymentMethod.trim()) {
        return true;
      }
      return paymentMethods[idx] === "cash" || paymentMethods[idx] === "stripe";
    });
    if (!allPaymentMethodsSelected) {
      toast.warning("Veuillez sélectionner une méthode de paiement pour chaque activité.");
      return;
    }

    // Mettre à jour le devis avec les numéros de ticket et les méthodes de paiement
    const updatedQuote = {
      ...selectedQuote,
      items: selectedQuote.items.map((item, idx) => ({
        ...item,
        ticketNumber: ticketNumbers[idx]?.trim() || "",
        paymentMethod: item.paymentMethod || paymentMethods[idx] || "",
      })),
    };

    const updatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? updatedQuote : q));
    setQuotes(updatedQuotes);
    saveLS(LS_KEYS.quotes, updatedQuotes);

    // Mettre à jour dans Supabase si configuré
    if (supabase) {
      try {
        const supabaseUpdate = {
          items: updatedQuote.items.map((item) => ({
            activity_id: item.activityId,
            date: item.date,
            adults: item.adults || 0,
            children: item.children || 0,
            babies: item.babies || 0,
            extra_label: item.extraLabel || "",
            extra_amount: item.extraAmount || 0,
            slot: item.slot || "",
            ticket_number: item.ticketNumber || "",
            payment_method: item.paymentMethod || "",
            extra_dolphin: item.extraDolphin || false,
            speed_boat_extra: Array.isArray(item.speedBoatExtra) ? item.speedBoatExtra : (item.speedBoatExtra ? [item.speedBoatExtra] : []),
            buggy_simple: item.buggySimple || "",
            buggy_family: item.buggyFamily || "",
            yamaha250: item.yamaha250 || "",
            ktm640: item.ktm640 || "",
            ktm530: item.ktm530 || "",
            aller_simple: item.allerSimple || false,
            aller_retour: item.allerRetour || false,
          })),
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("quotes")
          .update(supabaseUpdate)
          .eq("id", selectedQuote.supabase_id);

        if (error) {
          logger.error("Erreur lors de la mise à jour Supabase:", error);
          toast.error("Erreur lors de la synchronisation avec Supabase.");
        } else {
          toast.success("Numéros de ticket et méthodes de paiement enregistrés avec succès.");
        }
      } catch (error) {
        logger.error("Erreur lors de la mise à jour Supabase:", error);
        toast.error("Erreur lors de la synchronisation avec Supabase.");
      }
    }

    onClose();
  };

  const handleClose = () => {
    setTicketNumbers({});
    setPaymentMethods({});
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white/98 backdrop-blur-md rounded-xl md:rounded-2xl border border-blue-100/60 shadow-2xl p-4 md:p-6 max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h3 className="text-base md:text-lg font-semibold">Enregistrer les numéros de ticket</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4 mb-6">
          {selectedQuote.items?.map((item, idx) => (
            <div key={idx} className="border border-blue-100/60 rounded-xl p-4 bg-blue-50/50 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-sm">{item.activityName}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR")} — {item.adults} adulte(s),{" "}
                    {item.children} enfant(s)
                  </p>
                </div>
                <p className="text-sm font-semibold">{currency(item.lineTotal, selectedQuote.currency)}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Numéro de ticket unique</p>
                  <TextInput
                    placeholder="Ex: T-12345"
                    value={ticketNumbers[idx] || ""}
                    onChange={(e) => {
                      setTicketNumbers((prev) => ({
                        ...prev,
                        [idx]: e.target.value,
                      }));
                    }}
                    disabled={user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() ? true : false}
                    readOnly={user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() ? true : false}
                    className={user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() ? "bg-gray-100 cursor-not-allowed" : ""}
                  />
                  {user?.name !== "Ewen" && item.ticketNumber && item.ticketNumber.trim() && (
                    <p className="text-xs text-green-600 mt-1">✅ Ticket verrouillé (non modifiable)</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Méthode de paiement</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paymentMethods[idx] === "cash" || item.paymentMethod === "cash"}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPaymentMethods((prev) => ({
                              ...prev,
                              [idx]: "cash",
                            }));
                          }
                        }}
                        disabled={item.paymentMethod && item.paymentMethod.trim() ? true : false}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Cash</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paymentMethods[idx] === "stripe" || item.paymentMethod === "stripe"}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPaymentMethods((prev) => ({
                              ...prev,
                              [idx]: "stripe",
                            }));
                          }
                        }}
                        disabled={item.paymentMethod && item.paymentMethod.trim() ? true : false}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Stripe</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-end mt-4 md:mt-6 pt-4 border-t">
          <GhostBtn
            onClick={handleClose}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            Annuler
          </GhostBtn>
          <PrimaryBtn
            className="w-full sm:w-auto order-1 sm:order-2"
            onClick={handleSave}
          >
            Enregistrer
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}


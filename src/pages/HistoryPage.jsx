import { useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS } from "../constants";
import { currency, saveLS } from "../utils";
import { TextInput, GhostBtn, PrimaryBtn } from "../components/ui";

export function HistoryPage({ quotes, setQuotes }) {
  const [q, setQ] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [ticketNumbers, setTicketNumbers] = useState({});
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
        {filtered.map((d) => {
          // Vérifier si tous les tickets sont renseignés
          const allTicketsFilled = d.items?.every((item) => item.ticketNumber && item.ticketNumber.trim());
          const hasTickets = d.items?.some((item) => item.ticketNumber && item.ticketNumber.trim());

          return (
            <div key={d.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-500">{new Date(d.createdAt).toLocaleString("fr-FR")}</p>
                  <p className="text-sm text-gray-700">
                    {d.client?.phone || "Tél ?"} — {d.client?.hotel || "Hôtel ?"} ({d.client?.room || "ch ?"})
                  </p>
                  {hasTickets && (
                    <p className="text-xs text-green-600 mt-1">
                      ✅ Tickets : {d.items.filter((item) => item.ticketNumber && item.ticketNumber.trim()).length}/{d.items.length}
                    </p>
                  )}
                  <div className="mt-2 space-y-1">
                    {d.items.map((li, i) => (
                      <div key={i} className="text-xs text-gray-500">
                        {li.activityName} — {new Date(li.date + "T12:00:00").toLocaleDateString("fr-FR")}
                        {li.ticketNumber && <span className="text-green-600 ml-2">🎫 {li.ticketNumber}</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold mr-3">{currency(d.total, d.currency)}</p>
                  <div className="flex gap-2 flex-wrap">
                <GhostBtn
                  onClick={() => {
                    setSelectedQuote(d);
                    // Initialiser les numéros de ticket existants
                    const existingTickets = {};
                    d.items?.forEach((item, idx) => {
                      existingTickets[idx] = item.ticketNumber || "";
                    });
                    setTicketNumbers(existingTickets);
                    setShowPaymentModal(true);
                  }}
                  className={allTicketsFilled ? "bg-green-50 text-green-700 border-green-200" : ""}
                >
                  {allTicketsFilled ? "✅ Payé" : "💰 Payer"}
                </GhostBtn>
                <GhostBtn
                  onClick={() => {
                    // Télécharger le devis
                    const quoteText = `
DEVIS ${new Date(d.createdAt).toLocaleDateString("fr-FR")}
Client: ${d.client?.name || d.client?.phone || "—"}
Hôtel: ${d.client?.hotel || "—"}
Chambre: ${d.client?.room || "—"}
Quartier: ${d.client?.neighborhood || "—"}

ACTIVITÉS:
${d.items
  .map(
    (item, idx) => `
${idx + 1}. ${item.activityName}
   Date: ${new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR")}
   Adultes: ${item.adults} | Enfants: ${item.children} | Bébés: ${item.babies}
   Sous-total: ${currency(item.lineTotal, d.currency)}
   ${item.ticketNumber ? `🎫 Ticket: ${item.ticketNumber}` : ""}
`,
  )
  .join("\n")}

TOTAL: ${currency(d.total, d.currency)}

Notes: ${d.notes || "—"}
                    `.trim();

                    const blob = new Blob([quoteText], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `devis-${d.id.slice(-8)}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                >
                  📥 Télécharger
                </GhostBtn>
                {!allTicketsFilled && (
                  <GhostBtn
                    onClick={() => {
                      // Rediriger vers la page devis pour modifier
                      alert("Pour modifier le devis, allez dans l'onglet 'Devis' et utilisez le bouton Modifier.");
                    }}
                  >
                    ✏️ Modifier
                  </GhostBtn>
                )}
                <GhostBtn
                  onClick={async () => {
                    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce devis ?")) {
                      const updatedQuotes = quotes.filter((quote) => quote.id !== d.id);
                      setQuotes(updatedQuotes);
                      saveLS(LS_KEYS.quotes, updatedQuotes);

                      // Supprimer de Supabase si configuré
                      if (supabase) {
                        try {
                          const { error: deleteError } = await supabase
                            .from("quotes")
                            .delete()
                            .eq("site_key", SITE_KEY)
                            .eq("client_phone", d.client?.phone || "")
                            .eq("created_at", d.createdAt);
                          
                          if (deleteError) {
                            console.warn("⚠️ Erreur suppression Supabase:", deleteError);
                          } else {
                            console.log("✅ Devis supprimé de Supabase!");
                          }
                        } catch (deleteErr) {
                          console.warn("⚠️ Erreur lors de la suppression Supabase:", deleteErr);
                        }
                      }
                    }
                  }}
                  className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                >
                  🗑️ Supprimer
                </GhostBtn>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Aucun devis trouvé.</p>}
      </div>

      {/* Modale de paiement */}
      {showPaymentModal && selectedQuote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Enregistrer les numéros de ticket</h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {selectedQuote.items?.map((item, idx) => (
                <div key={idx} className="border rounded-xl p-4 bg-gray-50">
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
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-end">
              <GhostBtn
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                }}
              >
                Annuler
              </GhostBtn>
              <PrimaryBtn
                onClick={async () => {
                  // Vérifier que tous les tickets sont renseignés
                  const allFilled = selectedQuote.items?.every((_, idx) => ticketNumbers[idx]?.trim());
                  if (!allFilled) {
                    alert("Veuillez renseigner tous les numéros de ticket.");
                    return;
                  }

                  // Mettre à jour le devis avec les numéros de ticket
                  const updatedQuote = {
                    ...selectedQuote,
                    items: selectedQuote.items.map((item, idx) => ({
                      ...item,
                      ticketNumber: ticketNumbers[idx]?.trim() || "",
                    })),
                  };

                  const updatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? updatedQuote : q));
                  setQuotes(updatedQuotes);
                  saveLS(LS_KEYS.quotes, updatedQuotes);

                  // Mettre à jour dans Supabase si configuré
                  if (supabase) {
                    try {
                      const supabaseUpdate = {
                        items: JSON.stringify(updatedQuote.items),
                      };
                      
                      const { error: updateError } = await supabase
                        .from("quotes")
                        .update(supabaseUpdate)
                        .eq("site_key", SITE_KEY)
                        .eq("client_phone", updatedQuote.client.phone || "")
                        .eq("created_at", updatedQuote.createdAt);
                      
                      if (updateError) {
                        console.warn("⚠️ Erreur mise à jour Supabase:", updateError);
                      } else {
                        console.log("✅ Tickets mis à jour dans Supabase!");
                      }
                    } catch (updateErr) {
                      console.warn("⚠️ Erreur lors de la mise à jour Supabase:", updateErr);
                    }
                  }

                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  alert("✅ Numéros de ticket enregistrés avec succès !");
                }}
              >
                Enregistrer les tickets
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


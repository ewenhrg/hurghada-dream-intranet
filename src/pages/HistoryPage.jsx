import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, NEIGHBORHOODS } from "../constants";
import { currency, currencyNoCents, calculateCardPrice, generateQuoteHTML, saveLS, uuid, cleanPhoneNumber } from "../utils";
import { TextInput, NumberInput, GhostBtn, PrimaryBtn, Pill } from "../components/ui";
import { useDebounce } from "../hooks/useDebounce";
import { toast } from "../utils/toast.js";

// Options d'extra pour Speed Boat uniquement
const SPEED_BOAT_EXTRAS = [
  { id: "", label: "— Aucun extra —", priceAdult: 0, priceChild: 0 },
  { id: "hula_hula", label: "HULA HULA", priceAdult: 10, priceChild: 5 },
  { id: "orange_bay", label: "ORANGE BAY", priceAdult: 10, priceChild: 5 },
  { id: "eden_beach", label: "EDEN BEACH", priceAdult: 15, priceChild: 10 },
  { id: "eden_lunch", label: "EDEN + LUNCH", priceAdult: 30, priceChild: 15 },
  { id: "ozeria", label: "OZERIA", priceAdult: 25, priceChild: 15 },
  { id: "ozeria_lunch", label: "OZERIA + LUNCH", priceAdult: 45, priceChild: 25 },
];

// Helper pour vérifier si une activité utilise les champs buggy
function isBuggyActivity(activityName) {
  if (!activityName) return false;
  const name = activityName.toLowerCase();
  return name.includes("buggy + show") || name.includes("buggy safari matin");
}

// Helper pour obtenir les prix buggy selon l'activité
function getBuggyPrices(activityName) {
  if (!activityName) return { simple: 0, family: 0 };
  const name = activityName.toLowerCase();
  if (name.includes("buggy + show")) {
    return { simple: 120, family: 160 };
  } else if (name.includes("buggy safari matin")) {
    return { simple: 110, family: 150 };
  }
  return { simple: 0, family: 0 };
}

export function HistoryPage({ quotes, setQuotes, user, activities }) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300); // Debounce de 300ms pour la recherche
  const [statusFilter, setStatusFilter] = useState("all"); // "all", "paid", "pending"
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [ticketNumbers, setTicketNumbers] = useState({});
  const [paymentMethods, setPaymentMethods] = useState({}); // { index: "cash" | "stripe" }
  
  // Référence pour le conteneur de la modale de paiement
  const paymentModalRef = useRef(null);
  
  // États pour la modale de modification
  const [editClient, setEditClient] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [editNotes, setEditNotes] = useState("");
  
  // Mémoriser le calcul des tickets remplis pour éviter de le refaire à chaque render
  const quotesWithStatus = useMemo(() => {
    return quotes.map((d) => ({
      ...d,
      allTicketsFilled: d.items?.every((item) => item.ticketNumber && item.ticketNumber.trim()) || false,
      hasTickets: d.items?.some((item) => item.ticketNumber && item.ticketNumber.trim()) || false,
    }));
  }, [quotes]);
  
  const filtered = useMemo(() => {
    let result = quotesWithStatus;
    
    // Filtre par statut (payé/en attente)
    if (statusFilter !== "all") {
      result = result.filter((d) => {
        if (statusFilter === "paid") {
          return d.allTicketsFilled;
        } else if (statusFilter === "pending") {
          return !d.allTicketsFilled;
        }
        return true;
      });
    }
    
    // Filtre par recherche téléphone (utilise la valeur debouncée)
    if (debouncedQ.trim()) {
      const needle = debouncedQ.replace(/\D+/g, "");
      result = result.filter((d) => (d.client?.phone || "").replace(/\D+/g, "").includes(needle));
    }
    
    return result;
  }, [debouncedQ, quotesWithStatus, statusFilter]);

  // Scroller en haut de la modale de paiement quand elle s'ouvre
  useEffect(() => {
    if (showPaymentModal && paymentModalRef.current) {
      paymentModalRef.current.scrollTop = 0;
    }
  }, [showPaymentModal]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex flex-col gap-2 max-w-md">
          <TextInput
            placeholder="Rechercher par numéro de téléphone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full"
          />
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <span>⚠️</span>
            <span>N'oubliez pas d'actualiser la page pour voir les dernières informations</span>
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Pill
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          >
            Tous
          </Pill>
          <Pill
            active={statusFilter === "paid"}
            onClick={() => setStatusFilter("paid")}
          >
            Payés
          </Pill>
          <Pill
            active={statusFilter === "pending"}
            onClick={() => setStatusFilter("pending")}
          >
            En attente
          </Pill>
        </div>
      </div>
      <div className="space-y-3">
        {filtered.map((d) => {
          // Utiliser les valeurs pré-calculées
          const allTicketsFilled = d.allTicketsFilled;
          const hasTickets = d.hasTickets;

          // Déterminer la couleur en fonction du statut
          const borderColor = allTicketsFilled 
            ? "border-green-400 bg-green-50/50" 
            : "border-orange-400 bg-orange-50/50";
          
          return (
            <div key={d.id} className={`rounded-2xl border-2 ${borderColor} shadow-md hover:shadow-lg transition-shadow duration-200 p-4`}>
              {/* Badge de statut */}
              <div className="flex items-center gap-2 mb-2">
                {allTicketsFilled ? (
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium border border-green-300">
                    ✅ Payé
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium border border-orange-300">
                    ⏳ En attente
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-500">
                    {new Date(d.createdAt).toLocaleString("fr-FR")}
                    {d.createdByName && <span className="ml-2 text-blue-600">• Créé par {d.createdByName}</span>}
                  </p>
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
                  <div className="text-right mr-3">
                    <p className="text-base font-semibold">Espèces: {currencyNoCents(d.totalCash || Math.round(d.total), d.currency)}</p>
                    <p className="text-sm text-gray-600">Carte: {currencyNoCents(d.totalCard || calculateCardPrice(d.total), d.currency)}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                <GhostBtn
                  onClick={() => {
                    setSelectedQuote(d);
                    // Initialiser les numéros de ticket existants
                    const existingTickets = {};
                    const existingPaymentMethods = {};
                    d.items?.forEach((item, idx) => {
                      existingTickets[idx] = item.ticketNumber || "";
                      existingPaymentMethods[idx] = item.paymentMethod || "";
                    });
                    setTicketNumbers(existingTickets);
                    setPaymentMethods(existingPaymentMethods);
                    setShowPaymentModal(true);
                  }}
                  className={allTicketsFilled ? "bg-green-50 text-green-700 border-green-200" : ""}
                >
                  {allTicketsFilled ? "✅ Payé" : "💰 Payer"}
                </GhostBtn>
                <GhostBtn
                  onClick={() => {
                    // Générer le devis en HTML et l'ouvrir dans une nouvelle fenêtre
                    const htmlContent = generateQuoteHTML(d);
                    const clientPhone = d.client?.phone || "";
                    const fileName = `Devis - ${clientPhone}`;
                    const newWindow = window.open();
                    if (newWindow) {
                      newWindow.document.write(htmlContent);
                      // Définir le titre pour le nom du fichier PDF avant de fermer le document
                      newWindow.document.title = fileName;
                      newWindow.document.close();
                      // Après un court délai, proposer l'impression
                      setTimeout(() => {
                        newWindow.print();
                      }, 500);
                    }
                  }}
                >
                  🖨️ Imprimer
                </GhostBtn>
                {!allTicketsFilled && (
                  <GhostBtn
                    onClick={() => {
                      // Ouvrir la modale de modification
                      setSelectedQuote(d);
                      setEditClient({ ...d.client });
                      setEditItems(d.items.map((item) => ({
                        activityId: item.activityId || "",
                        date: item.date || new Date().toISOString().slice(0, 10),
                        adults: item.adults || 2,
                        children: item.children || 0,
                        babies: item.babies || 0,
                        extraLabel: item.extraLabel || "",
                        extraAmount: item.extraAmount || "",
                        extraDolphin: item.extraDolphin || false,
                        speedBoatExtra: item.speedBoatExtra || "",
                        buggySimple: item.buggySimple || 0,
                        buggyFamily: item.buggyFamily || 0,
                        slot: item.slot || "",
                        ticketNumber: item.ticketNumber || "", // Préserver le ticketNumber existant
                      })));
                      setEditNotes(d.notes || "");
                      setShowEditModal(true);
                    }}
                  >
                    ✏️ Modifier
                  </GhostBtn>
                )}
                {user?.canDeleteQuote && (
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
                )}
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
          <div ref={paymentModalRef} className="bg-white rounded-2xl border border-blue-100/50 shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Enregistrer les numéros de ticket</h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  setPaymentMethods({});
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
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
                    <div className="text-right">
                      <p className="text-sm font-semibold">Espèces: {currencyNoCents(Math.round(item.lineTotal), selectedQuote.currency)}</p>
                      <p className="text-xs text-gray-600">Carte: {currencyNoCents(calculateCardPrice(item.lineTotal), selectedQuote.currency)}</p>
                    </div>
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

            <div className="flex gap-3 justify-end">
              <GhostBtn
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  setPaymentMethods({});
                }}
              >
                Annuler
              </GhostBtn>
              <PrimaryBtn
                onClick={async () => {
                  // Vérifier que tous les tickets sont renseignés
                  const allFilled = selectedQuote.items?.every((_, idx) => ticketNumbers[idx]?.trim());
                  if (!allFilled) {
                    toast.warning("Veuillez renseigner tous les numéros de ticket.");
                    return;
                  }

                  // Vérifier que toutes les méthodes de paiement sont sélectionnées
                  const allPaymentMethodsSelected = selectedQuote.items?.every((_, idx) => {
                    // Si le ticket existe déjà, garder la méthode existante, sinon vérifier que c'est renseigné
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
                        items: JSON.stringify(updatedQuote.items),
                      };
                      
                      // Utiliser supabase_id en priorité pour identifier le devis à mettre à jour
                      let updateQuery = supabase
                        .from("quotes")
                        .update(supabaseUpdate)
                        .eq("site_key", SITE_KEY);

                      if (selectedQuote.supabase_id) {
                        // Si le devis a un supabase_id, l'utiliser (le plus fiable)
                        updateQuery = updateQuery.eq("id", selectedQuote.supabase_id);
                      } else {
                        // Sinon, utiliser client_phone + created_at (pour compatibilité avec les anciens devis)
                        updateQuery = updateQuery
                          .eq("client_phone", updatedQuote.client.phone || "")
                          .eq("created_at", updatedQuote.createdAt);
                      }
                      
                      const { error: updateError } = await updateQuery;
                      
                      if (updateError) {
                        console.warn("⚠️ Erreur mise à jour Supabase:", updateError);
                      }
                    } catch (updateErr) {
                      console.warn("⚠️ Erreur lors de la mise à jour Supabase:", updateErr);
                    }
                  }

                  setShowPaymentModal(false);
                  setSelectedQuote(null);
                  setTicketNumbers({});
                  setPaymentMethods({});
                  toast.success("Numéros de ticket enregistrés avec succès !");
                }}
              >
                Enregistrer les tickets
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* Modale de modification de devis */}
      {showEditModal && selectedQuote && editClient && (
        <EditQuoteModal
          quote={selectedQuote}
          client={editClient}
          setClient={setEditClient}
          items={editItems}
          setItems={setEditItems}
          notes={editNotes}
          setNotes={setEditNotes}
          activities={activities}
          user={user}
          onClose={() => {
            setShowEditModal(false);
            setSelectedQuote(null);
            setEditClient(null);
            setEditItems([]);
            setEditNotes("");
          }}
          onSave={async (updatedQuote) => {
            const updatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? updatedQuote : q));
            setQuotes(updatedQuotes);
            saveLS(LS_KEYS.quotes, updatedQuotes);

            // Mettre à jour dans Supabase si configuré
            if (supabase) {
              try {
                const supabaseUpdate = {
                  client_name: updatedQuote.client.name || "",
                  client_phone: updatedQuote.client.phone || "",
                  client_hotel: updatedQuote.client.hotel || "",
                  client_room: updatedQuote.client.room || "",
                  client_neighborhood: updatedQuote.client.neighborhood || "",
                  notes: updatedQuote.notes || "",
                  total: updatedQuote.total,
                  currency: updatedQuote.currency,
                  items: JSON.stringify(updatedQuote.items),
                  created_by_name: updatedQuote.createdByName || "",
                };

                // Utiliser supabase_id en priorité pour identifier le devis à mettre à jour
                let updateQuery = supabase
                  .from("quotes")
                  .update(supabaseUpdate)
                  .eq("site_key", SITE_KEY);

                if (selectedQuote.supabase_id) {
                  // Si le devis a un supabase_id, l'utiliser (le plus fiable)
                  updateQuery = updateQuery.eq("id", selectedQuote.supabase_id);
                } else {
                  // Sinon, utiliser client_phone + created_at (pour compatibilité avec les anciens devis)
                  updateQuery = updateQuery
                    .eq("client_phone", selectedQuote.client?.phone || "")
                    .eq("created_at", selectedQuote.createdAt);
                }

                const { error: updateError } = await updateQuery;

                if (updateError) {
                  console.warn("⚠️ Erreur mise à jour Supabase:", updateError);
                } else {
                  console.log("✅ Devis mis à jour dans Supabase!");
                  // Mettre à jour le supabase_id dans le devis local si ce n'était pas déjà fait
                  if (!updatedQuote.supabase_id && selectedQuote.supabase_id) {
                    const finalUpdatedQuote = { ...updatedQuote, supabase_id: selectedQuote.supabase_id };
                    const finalUpdatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? finalUpdatedQuote : q));
                    setQuotes(finalUpdatedQuotes);
                    saveLS(LS_KEYS.quotes, finalUpdatedQuotes);
                  }
                }
              } catch (updateErr) {
                console.warn("⚠️ Erreur lors de la mise à jour Supabase:", updateErr);
              }
            }

            setShowEditModal(false);
            setSelectedQuote(null);
            setEditClient(null);
            setEditItems([]);
            setEditNotes("");
            toast.success("Devis modifié avec succès !");
          }}
        />
      )}
    </div>
  );
}

// Composant modale de modification de devis
function EditQuoteModal({ quote, client, setClient, items, setItems, notes, setNotes, activities, onClose, onSave, user }) {
  const blankItem = () => ({
    activityId: "",
    date: new Date().toISOString().slice(0, 10),
    adults: 2,
    children: 0,
    babies: 0,
    extraLabel: "",
    extraAmount: "",
    slot: "",
    extraDolphin: false,
    speedBoatExtra: "",
    buggySimple: "",
    buggyFamily: "",
  });

  function setItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, blankItem()]);
  }
  function removeItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Calcul des totaux (similaire à QuotesPage)
  const computed = useMemo(() => {
    return items.map((it) => {
      const act = activities.find((a) => a.id === it.activityId);
      const weekday = it.date ? new Date(it.date + "T12:00:00").getDay() : null;
      const available = act && weekday != null ? !!act.availableDays?.[weekday] : true;
      const transferInfo = act && client.neighborhood ? act.transfers?.[client.neighborhood] || null : null;

      let lineTotal = 0;
      const currencyCode = act?.currency || "EUR";

      // cas spécial Speed Boat
      if (act && act.name.toLowerCase().includes("speed boat")) {
        const ad = Number(it.adults || 0);
        const ch = Number(it.children || 0);

        // Prix de base : 145€ pour 1 ou 2 adultes
        lineTotal = 145;

        // Si plus de 2 adultes : +20€ par adulte supplémentaire (au-delà de 2)
        if (ad > 2) {
          const extraAdults = ad - 2;
          lineTotal += extraAdults * 20;
        }

        // Tous les enfants : +10€ par enfant
        lineTotal += ch * 10;

        // Extra dauphin : +20€ si la case est cochée
        if (it.extraDolphin) {
          lineTotal += 20;
        }

        // Extra Speed Boat (menu déroulant) : calcul basé sur adultes et enfants
        if (it.speedBoatExtra) {
          const selectedExtra = SPEED_BOAT_EXTRAS.find((e) => e.id === it.speedBoatExtra);
          if (selectedExtra) {
            lineTotal += ad * selectedExtra.priceAdult;
            lineTotal += ch * selectedExtra.priceChild;
          }
        }
      } else if (act && isBuggyActivity(act.name)) {
        // cas spécial BUGGY + SHOW et BUGGY SAFARI MATIN : calcul basé sur buggy simple et family
        const buggySimple = Number(it.buggySimple || 0);
        const buggyFamily = Number(it.buggyFamily || 0);
        const prices = getBuggyPrices(act.name);
        lineTotal = buggySimple * prices.simple + buggyFamily * prices.family;
      } else if (act) {
        lineTotal += Number(it.adults || 0) * Number(act.priceAdult || 0);
        lineTotal += Number(it.children || 0) * Number(act.priceChild || 0);
        lineTotal += Number(it.babies || 0) * Number(act.priceBaby || 0);
      }

      // supplément transfert PAR ADULTE (sauf pour les activités buggy où on utilise buggySimple + buggyFamily)
      if (transferInfo && transferInfo.surcharge) {
        if (act && isBuggyActivity(act.name)) {
          // Pour les activités buggy, le supplément est calculé sur le nombre total de buggys
          const totalBuggys = Number(it.buggySimple || 0) + Number(it.buggyFamily || 0);
          lineTotal += Number(transferInfo.surcharge || 0) * totalBuggys;
        } else {
          lineTotal += Number(transferInfo.surcharge || 0) * Number(it.adults || 0);
        }
      }

      // extra (pour les autres activités, pas Speed Boat)
      if (!act || !act.name.toLowerCase().includes("speed boat")) {
        if (it.extraAmount) {
          lineTotal += Number(it.extraAmount || 0);
        }
      }

      const pickupTime =
        it.slot === "morning"
          ? transferInfo?.morningTime
          : it.slot === "afternoon"
            ? transferInfo?.afternoonTime
            : it.slot === "evening"
              ? transferInfo?.eveningTime
              : "";

      return {
        raw: it,
        act,
        weekday,
        available,
        transferInfo,
        lineTotal,
        pickupTime,
        currency: currencyCode,
      };
    });
  }, [items, activities, client.neighborhood]);

  const grandCurrency = computed.find((c) => c.currency)?.currency || "EUR";
  const grandTotal = computed.reduce((s, c) => s + (c.lineTotal || 0), 0);
  const grandTotalCash = Math.round(grandTotal); // Prix espèces (arrondi sans centimes)
  const grandTotalCard = calculateCardPrice(grandTotal); // Prix carte (espèces + 3% arrondi à l'euro supérieur)

  function handleSave() {
    // Filtrer les items vides (sans activité sélectionnée)
    const validComputed = computed.filter((c) => c.act && c.act.id);

    // Vérifier qu'il y a au moins un item valide
    if (validComputed.length === 0) {
      toast.warning("Veuillez sélectionner au moins une activité.");
      return;
    }

    // Calculer le total uniquement avec les items valides
    const validGrandTotal = validComputed.reduce((s, c) => s + (c.lineTotal || 0), 0);
    const validGrandCurrency = validComputed.find((c) => c.currency)?.currency || "EUR";

    // Nettoyer le numéro de téléphone avant de sauvegarder
    const cleanedClient = {
      ...client,
      phone: cleanPhoneNumber(client.phone || ""),
    };

    const updatedQuote = {
      ...quote,
      client: cleanedClient,
      notes: notes.trim(),
      createdByName: quote.createdByName || "", // Garder le créateur original
      items: validComputed.map((c) => ({
        activityId: c.act.id,
        activityName: c.act.name || "",
        date: c.raw.date,
        adults: Number(c.raw.adults || 0),
        children: Number(c.raw.children || 0),
        babies: Number(c.raw.babies || 0),
        extraLabel: c.raw.extraLabel || "",
        extraAmount: Number(c.raw.extraAmount || 0),
        extraDolphin: c.raw.extraDolphin || false,
        speedBoatExtra: c.raw.speedBoatExtra || "",
        buggySimple: Number(c.raw.buggySimple || 0),
        buggyFamily: Number(c.raw.buggyFamily || 0),
        neighborhood: client.neighborhood,
        slot: c.raw.slot,
        pickupTime: c.pickupTime || "",
        lineTotal: c.lineTotal,
        transferSurchargePerAdult: c.transferInfo?.surcharge || 0,
        // Préserver le ticketNumber existant - ne peut pas être modifié si déjà rempli
        ticketNumber: (c.raw.ticketNumber && c.raw.ticketNumber.trim()) 
          ? c.raw.ticketNumber 
          : (quote.items?.find((item) => item.activityId === c.act.id && item.date === c.raw.date)?.ticketNumber || ""),
      })),
      total: validGrandTotal,
      totalCash: Math.round(validGrandTotal),
      totalCard: calculateCardPrice(validGrandTotal),
      currency: validGrandCurrency,
    };

    onSave(updatedQuote);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-blue-100/50 shadow-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Modifier le devis</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-5">
          {/* Infos client */}
          <div className="grid md:grid-cols-5 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Client</p>
              <TextInput value={client.name || ""} onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Téléphone</p>
              <TextInput 
                value={client.phone || ""} 
                onChange={(e) => {
                  // Nettoyer automatiquement le numéro de téléphone (supprimer espaces, parenthèses, etc.)
                  const cleaned = cleanPhoneNumber(e.target.value);
                  setClient((c) => ({ ...c, phone: cleaned }));
                }} 
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Hôtel</p>
              <TextInput value={client.hotel || ""} onChange={(e) => setClient((c) => ({ ...c, hotel: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Chambre</p>
              <TextInput value={client.room || ""} onChange={(e) => setClient((c) => ({ ...c, room: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Quartier</p>
              <select
                value={client.neighborhood || ""}
                onChange={(e) => setClient((c) => ({ ...c, neighborhood: e.target.value }))}
                className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
              >
                <option value="">— Choisir —</option>
                {NEIGHBORHOODS.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Activités */}
          <div className="space-y-4">
            {computed.map((c, idx) => (
              <div key={idx} className="bg-white/90 border border-blue-100/60 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">Activité #{idx + 1}</p>
                  <GhostBtn type="button" onClick={() => removeItem(idx)}>
                    Supprimer
                  </GhostBtn>
                </div>
                <div className="grid md:grid-cols-5 gap-3 items-end">
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">Activité</p>
                    <select
                      value={c.raw.activityId || ""}
                      onChange={(e) => setItem(idx, { activityId: e.target.value })}
                      className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">— Choisir —</option>
                      {activities.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Date</p>
                    <TextInput type="date" value={c.raw.date} onChange={(e) => setItem(idx, { date: e.target.value })} />
                    {c.act && !c.available && (
                      <p className="text-[10px] text-amber-700 mt-1">⚠️ activité pas dispo ce jour-là</p>
                    )}
                  </div>
                  {c.act && isBuggyActivity(c.act.name) ? (
                    <>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Buggy Simple ({getBuggyPrices(c.act.name).simple}€)</p>
                        <NumberInput value={c.raw.buggySimple ?? ""} onChange={(e) => setItem(idx, { buggySimple: e.target.value === "" ? "" : e.target.value })} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Buggy Family ({getBuggyPrices(c.act.name).family}€)</p>
                        <NumberInput value={c.raw.buggyFamily ?? ""} onChange={(e) => setItem(idx, { buggyFamily: e.target.value === "" ? "" : e.target.value })} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Adultes</p>
                        <NumberInput value={c.raw.adults || 0} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">
                          Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""}
                        </p>
                        <NumberInput value={c.raw.children || 0} onChange={(e) => setItem(idx, { children: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
                {/* Champs adultes/enfants en dessous pour activités buggy (informations uniquement) */}
                {c.act && isBuggyActivity(c.act.name) && (
                  <div className="grid md:grid-cols-2 gap-3 mt-3">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Adultes (informations uniquement)</p>
                      <NumberInput value={c.raw.adults ?? ""} onChange={(e) => setItem(idx, { adults: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">
                        Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""} (informations uniquement)
                      </p>
                      <NumberInput value={c.raw.children ?? ""} onChange={(e) => setItem(idx, { children: e.target.value === "" ? "" : e.target.value })} />
                    </div>
                  </div>
                )}
                <div className="grid md:grid-cols-4 gap-3">
                  {!c.act || !isBuggyActivity(c.act.name) ? (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">
                        Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""}
                      </p>
                      <NumberInput value={c.raw.babies || 0} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                    </div>
                  ) : null}
                  {c.transferInfo && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Créneau</p>
                      <select
                        value={c.raw.slot || ""}
                        onChange={(e) => setItem(idx, { slot: e.target.value })}
                        className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {c.transferInfo.morningEnabled && <option value="morning">Matin ({c.transferInfo.morningTime})</option>}
                        {c.transferInfo.afternoonEnabled && <option value="afternoon">Après-midi ({c.transferInfo.afternoonTime})</option>}
                        {c.transferInfo.eveningEnabled && <option value="evening">Soir ({c.transferInfo.eveningTime})</option>}
                      </select>
                    </div>
                  )}
                  {c.act && c.act.name.toLowerCase().includes("speed boat") ? (
                    <div className="md:col-span-2">
                      <p className="text-xs text-gray-500 mb-1">Extra</p>
                      <select
                        value={c.raw.speedBoatExtra || ""}
                        onChange={(e) => setItem(idx, { speedBoatExtra: e.target.value })}
                        className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
                      >
                        {SPEED_BOAT_EXTRAS.map((extra) => (
                          <option key={extra.id} value={extra.id}>
                            {extra.label} {extra.priceAdult > 0 && `(${extra.priceAdult}€/adt + ${extra.priceChild}€ enfant)`}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Extra (label)</p>
                        <TextInput value={c.raw.extraLabel || ""} onChange={(e) => setItem(idx, { extraLabel: e.target.value })} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Extra (montant)</p>
                        <NumberInput value={c.raw.extraAmount || ""} onChange={(e) => setItem(idx, { extraAmount: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
                {/* Extra dauphin (uniquement pour Speed Boat) */}
                {c.act && c.act.name.toLowerCase().includes("speed boat") && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id={`edit-extraDolphin-${idx}`}
                      checked={c.raw.extraDolphin || false}
                      onChange={(e) => setItem(idx, { extraDolphin: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor={`edit-extraDolphin-${idx}`} className="text-sm text-gray-700 cursor-pointer">
                      Extra dauphin 20€
                    </label>
                  </div>
                )}
                {/* Afficher le numéro de ticket si présent (non modifiable) */}
                {(c.raw.ticketNumber || quote.items?.find((item) => item.activityId === c.act?.id && item.date === c.raw.date)?.ticketNumber) && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs text-green-700 font-medium">🎫 Ticket: {(c.raw.ticketNumber || quote.items?.find((item) => item.activityId === c.act?.id && item.date === c.raw.date)?.ticketNumber)}</p>
                    <p className="text-[10px] text-green-600 mt-1">Non modifiable</p>
                  </div>
                )}
                {c.lineTotal > 0 && (
                  <div className="text-right text-sm font-semibold text-gray-700">
                    <p>Espèces: {currencyNoCents(Math.round(c.lineTotal), c.currency)}</p>
                    <p className="text-xs text-gray-600">Carte: {currencyNoCents(calculateCardPrice(c.lineTotal), c.currency)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <GhostBtn type="button" onClick={addItem}>
              + Ajouter une autre activité
            </GhostBtn>
            <div className="text-right">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-xl font-bold">Espèces: {currencyNoCents(grandTotalCash, grandCurrency)}</p>
              <p className="text-lg font-semibold text-gray-700">Carte: {currencyNoCents(grandTotalCard, grandCurrency)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Notes</p>
            <TextInput
              placeholder="Infos supplémentaires : langue du guide, pick-up, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6 pt-4 border-t">
          <GhostBtn onClick={onClose}>Annuler</GhostBtn>
          <PrimaryBtn onClick={handleSave}>Enregistrer les modifications</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}


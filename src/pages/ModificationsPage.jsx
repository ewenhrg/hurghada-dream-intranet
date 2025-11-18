import { useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS } from "../constants";
import { currencyNoCents, saveLS, cleanPhoneNumber, calculateCardPrice } from "../utils";
import { GhostBtn, PrimaryBtn, TextInput, NumberInput } from "../components/ui";
import { toast } from "../utils/toast.js";
import { useDebounce } from "../hooks/useDebounce";

export function ModificationsPage({ quotes, setQuotes, activities, user }) {
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState(null);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [newActivityId, setNewActivityId] = useState("");
  const [newAdults, setNewAdults] = useState("");
  const [newChildren, setNewChildren] = useState("");
  const [newBabies, setNewBabies] = useState("");
  const [modifyType, setModifyType] = useState(""); // "modify" or "cancel"
  const [searchPhone, setSearchPhone] = useState("");
  const debouncedSearchPhone = useDebounce(searchPhone, 300);

  // Filtrer uniquement les devis payés (tous les tickets renseignés)
  const paidQuotes = useMemo(() => {
    return quotes.filter((quote) => {
      return quote.items?.every((item) => item.ticketNumber && item.ticketNumber.trim());
    });
  }, [quotes]);

  // Filtrer par numéro de téléphone - ne rien afficher par défaut
  const filteredQuotes = useMemo(() => {
    if (!debouncedSearchPhone.trim()) {
      return [];
    }
    const needle = debouncedSearchPhone.replace(/\D+/g, "");
    return paidQuotes.filter((quote) => {
      const quotePhone = (quote.client?.phone || "").replace(/\D+/g, "");
      return quotePhone.includes(needle);
    });
  }, [paidQuotes, debouncedSearchPhone]);

  function handleModifyActivity(quote, itemIndex) {
    const item = quote.items[itemIndex];
    setSelectedQuote(quote);
    setSelectedItemIndex(itemIndex);
    setNewActivityId("");
    setNewAdults(item?.adults !== undefined && item?.adults !== null ? item.adults : 2);
    setNewChildren(item?.children !== undefined && item?.children !== null ? item.children : 0);
    setNewBabies(item?.babies !== undefined && item?.babies !== null ? item.babies : 0);
    setModifyType("modify");
    setShowModifyModal(true);
  }

  function handleCancelActivity(quote, itemIndex) {
    setSelectedQuote(quote);
    setSelectedItemIndex(itemIndex);
    setModifyType("cancel");
    setShowModifyModal(true);
  }

  async function handleConfirmModification() {
    if (!selectedQuote || selectedItemIndex === null) return;

    const updatedItems = [...selectedQuote.items];
    const oldItem = updatedItems[selectedItemIndex];

    if (modifyType === "cancel") {
      // Annuler l'activité (la marquer comme annulée mais la garder visible)
      const cancelledItem = {
        ...oldItem,
        isCancelled: true,
        cancelledDate: new Date().toISOString(),
        cancelledBy: user?.name || "",
      };
      
      // Ajouter l'historique de modification
      if (!cancelledItem.modifications) {
        cancelledItem.modifications = [];
      }
      cancelledItem.modifications.push({
        date: new Date().toISOString(),
        type: "cancelled",
        activityName: oldItem.activityName,
        modifiedBy: user?.name || "",
      });
      
      updatedItems[selectedItemIndex] = cancelledItem;
    } else if (modifyType === "modify" && newActivityId) {
      // Modifier l'activité (la remplacer)
      const newActivity = activities.find((a) => a.id === newActivityId);
      if (!newActivity) {
        toast.error("Activité non trouvée");
        return;
      }

      // Calculer le nouveau total en fonction de la nouvelle activité et du nouveau nombre de personnes
      const adults = Number(newAdults) || 0;
      const children = Number(newChildren) || 0;
      const babies = Number(newBabies) || 0;
      
      let newLineTotal = 0;
      
      // Calcul de base selon les prix de l'activité
      if (newActivity.priceAdult !== undefined) {
        newLineTotal += adults * Number(newActivity.priceAdult || 0);
        newLineTotal += children * Number(newActivity.priceChild || 0);
        newLineTotal += babies * Number(newActivity.priceBaby || 0);
      }
      
      // Ajouter le supplément transfert si nécessaire (par adulte)
      const neighborhood = selectedQuote.client?.neighborhood || "";
      const transferInfo = newActivity.transfers?.[neighborhood];
      if (transferInfo && transferInfo.surcharge) {
        newLineTotal += Number(transferInfo.surcharge || 0) * adults;
      }
      
      // Créer le nouvel item avec les nouvelles données
      const newItem = {
        ...oldItem,
        activityId: newActivity.id,
        activityName: newActivity.name,
        adults: adults,
        children: children,
        babies: babies,
        lineTotal: newLineTotal,
        // Préserver les informations de transfert
        transferSurchargePerAdult: transferInfo?.surcharge || 0,
        // Garder les autres informations (date, ticketNumber, etc.)
      };

      // Ajouter l'historique de modification
      if (!newItem.modifications) {
        newItem.modifications = [];
      }
      newItem.modifications.push({
        date: new Date().toISOString(),
        type: "modified",
        oldActivity: oldItem.activityName,
        newActivity: newActivity.name,
        modifiedBy: user?.name || "",
      });

      updatedItems[selectedItemIndex] = newItem;
    } else {
      toast.warning("Veuillez sélectionner une nouvelle activité");
      return;
    }

    // Recalculer le total du devis (ne pas inclure les activités annulées)
    let newTotal = 0;
    updatedItems.forEach((item) => {
      if (!item.isCancelled) {
        newTotal += item.lineTotal || 0;
      }
    });

    const updatedQuote = {
      ...selectedQuote,
      items: updatedItems,
      total: newTotal,
      totalCash: Math.round(newTotal),
      totalCard: calculateCardPrice(newTotal),
      isModified: true,
      modifications: [
        ...(selectedQuote.modifications || []),
        {
          date: new Date().toISOString(),
          type: modifyType === "cancel" ? "cancelled" : "modified",
          itemIndex: selectedItemIndex,
          activityName: oldItem.activityName,
          modifiedBy: user?.name || "",
        },
      ],
    };

    // Mettre à jour la liste des devis
    const updatedQuotes = quotes.map((q) => (q.id === selectedQuote.id ? updatedQuote : q));
    setQuotes(updatedQuotes);
    saveLS(LS_KEYS.quotes, updatedQuotes);

    // Mettre à jour dans Supabase si configuré
    if (supabase) {
      try {
        const supabaseUpdate = {
          items: JSON.stringify(updatedQuote.items),
          total: updatedQuote.total,
        };

        const { error: updateError } = await supabase
          .from("quotes")
          .update(supabaseUpdate)
          .eq("site_key", SITE_KEY)
          .eq("id", selectedQuote.supabase_id || selectedQuote.id);

        if (updateError) {
          console.warn("⚠️ Erreur mise à jour Supabase:", updateError);
          toast.warning("Erreur lors de la mise à jour dans Supabase");
        } else {
          toast.success("Modification enregistrée avec succès !");
        }
      } catch (err) {
        console.warn("⚠️ Erreur lors de la mise à jour Supabase:", err);
        toast.warning("Erreur lors de la mise à jour dans Supabase");
      }
    }

    setShowModifyModal(false);
    setSelectedQuote(null);
    setSelectedItemIndex(null);
    setNewActivityId("");
    setNewAdults("");
    setNewChildren("");
    setNewBabies("");
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-2">Modifications & Annulations</h2>
        <p className="text-xs text-gray-600 mb-4">
          Gérez les modifications et annulations pour les devis payés uniquement
        </p>
      </div>

      {/* Barre de recherche par téléphone */}
      <div className="bg-white/90 rounded-2xl border border-blue-100/60 p-4 shadow-sm">
        <div>
          <p className="text-xs text-gray-500 mb-1">Rechercher un devis par numéro de téléphone</p>
          <TextInput
            placeholder="Ex: 0123456789"
            value={searchPhone}
            onChange={(e) => {
              const cleaned = cleanPhoneNumber(e.target.value);
              setSearchPhone(cleaned);
            }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredQuotes.length === 0 ? (
          <div className="hd-card hd-border-gradient text-center">
            <p className="text-sm text-[rgba(71,85,105,0.75)]">
              {debouncedSearchPhone.trim() ? "Aucun devis trouvé pour ce numéro" : "Recherchez un devis par numéro de téléphone pour commencer"}
            </p>
          </div>
        ) : (
          filteredQuotes.map((quote) => (
            <div
              key={quote.id}
              className={`hd-card hd-border-gradient transition-shadow duration-200 p-4 border-2 ${
                quote.isModified ? "border-amber-200/70" : "border-blue-200/60"
              }`}
            >
              {quote.isModified && (
                <div className="mb-2">
                  <span className="tag-warning">
                    🔄 Modifié
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-500">
                    {new Date(quote.createdAt).toLocaleString("fr-FR")} — {quote.client?.phone || "Tél ?"}
                  </p>
                  <p className="text-sm text-gray-700">
                    {quote.client?.name || "Client ?"} — {quote.client?.hotel || "Hôtel ?"}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold">
                      Total: {currencyNoCents(quote.totalCash || Math.round(quote.total), quote.currency)}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({quote.items?.length || 0} activité{quote.items?.length > 1 ? "s" : ""})
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {quote.items?.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border transition-all duration-200 ${
                      item.modifications?.length
                        ? "border-[rgba(147,51,234,0.45)] bg-[rgba(147,51,234,0.08)]"
                        : "border-[rgba(148,163,184,0.28)] bg-[rgba(248,250,252,0.85)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {item.activityName || "Activité ?"}
                        </p>
                        {item.isCancelled && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">
                            Annulé
                          </span>
                        )}
                        {!item.isCancelled && item.modifications && item.modifications.length > 0 && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                            Modifié
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-[#4338ca]">
                          {currencyNoCents(item.lineTotal, quote.currency)}
                        </span>
                        {item.paymentMethod && (
                          <p className="text-[10px] text-[rgba(71,85,105,0.65)]">
                            {item.paymentMethod === "cash" ? "Espèces" : "Carte"}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className={`text-xs ${item.isCancelled ? "line-through text-gray-400" : "text-gray-500"}`}>
                      {item.date ? new Date(item.date + "T12:00:00").toLocaleDateString("fr-FR") : ""} — Ticket:{" "}
                      {item.ticketNumber || "—"}
                    </p>
                    <p className={`text-xs ${item.isCancelled ? "line-through text-gray-400" : "text-gray-500"}`}>
                      {currencyNoCents(Math.round(item.lineTotal || 0), quote.currency)}
                    </p>
                    {item.modifications?.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-semibold text-[#6d28d9]">Modifications :</p>
                        {item.modifications.map((mod, mIdx) => (
                          <div
                            key={mIdx}
                            className="text-xs rounded-lg px-2 py-1 bg-[rgba(147,51,234,0.12)] text-[#7c3aed] border border-[rgba(147,51,234,0.35)]"
                          >
                            {mod.type === "cancelled" ? (
                              <>
                                🚫 Annulé le {mod.date ? new Date(mod.date).toLocaleDateString("fr-FR") : ""} par {mod.modifiedBy || "Inconnu"}
                              </>
                            ) : mod.type === "modified" ? (
                              <>
                                ✏️ {mod.oldActivity || "Ancienne activité"} → {mod.newActivity || "Nouvelle activité"} le {mod.date ? new Date(mod.date).toLocaleDateString("fr-FR") : ""} par {mod.modifiedBy || "Inconnu"}
                              </>
                            ) : (
                              JSON.stringify(mod)
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-4">
                      {!item.isCancelled && (
                        <>
                          <GhostBtn size="sm" variant="primary" onClick={() => handleModifyActivity(quote, idx)}>
                            ✏️ Modifier
                          </GhostBtn>
                          <GhostBtn size="sm" variant="danger" onClick={() => handleCancelActivity(quote, idx)}>
                            🚫 Annuler
                          </GhostBtn>
                        </>
                      )}
                      {item.isCancelled && (
                        <span className="tag-danger inline-flex items-center gap-1 text-xs">
                          ✅ Annulation enregistrée
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de modification/annulation */}
      {showModifyModal && selectedQuote && selectedItemIndex !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-blue-100/50 shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">
              {modifyType === "cancel" ? "Annuler l'activité" : "Modifier l'activité"}
            </h3>

            {modifyType === "cancel" ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-700">
                  Êtes-vous sûr de vouloir annuler l'activité : <strong>{selectedQuote.items[selectedItemIndex]?.activityName}</strong> ?
                </p>
                <p className="text-xs text-amber-600">
                  ⚠️ L'activité sera barrée mais restera visible dans le devis. Le total sera ajusté.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-700">
                  Remplacer l'activité : <strong>{selectedQuote.items[selectedItemIndex]?.activityName}</strong>
                </p>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Nouvelle activité</p>
                  <select
                    value={newActivityId}
                    onChange={(e) => setNewActivityId(e.target.value)}
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
                {/* Champs pour modifier le nombre de personnes */}
                <div className="grid grid-cols-3 gap-3 bg-cyan-50/50 p-4 rounded-xl border-2 border-cyan-200">
                  <div>
                    <p className="text-xs text-gray-700 font-semibold mb-2">👥 Adultes</p>
                    <NumberInput 
                      value={newAdults} 
                      onChange={(e) => setNewAdults(e.target.value)} 
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-700 font-semibold mb-2">👶 Enfants</p>
                    <NumberInput 
                      value={newChildren} 
                      onChange={(e) => setNewChildren(e.target.value)} 
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-700 font-semibold mb-2">🍼 Bébés</p>
                    <NumberInput 
                      value={newBabies} 
                      onChange={(e) => setNewBabies(e.target.value)} 
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end mt-6 pt-4 border-t">
              <GhostBtn
                onClick={() => {
                  setShowModifyModal(false);
                  setSelectedQuote(null);
                  setSelectedItemIndex(null);
                  setNewActivityId("");
                  setNewAdults("");
                  setNewChildren("");
                  setNewBabies("");
                }}
              >
                Annuler
              </GhostBtn>
              <PrimaryBtn onClick={handleConfirmModification} variant={modifyType === "cancel" ? "danger" : "primary"}>
                {modifyType === "cancel" ? "Confirmer l'annulation" : "Confirmer la modification"}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


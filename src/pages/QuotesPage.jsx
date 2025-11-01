import { useState, useMemo, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, NEIGHBORHOODS } from "../constants";
import { uuid, currency, currencyNoCents, calculateCardPrice, generateQuoteHTML, saveLS, loadLS } from "../utils";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";

export function QuotesPage({ activities, quotes, setQuotes, user }) {
  const blankItem = () => ({
    activityId: "",
    date: new Date().toISOString().slice(0, 10),
    adults: 2,
    children: 0,
    babies: 0,
    extraLabel: "",
    extraAmount: "",
    slot: "",
  });

  // Charger le formulaire sauvegardé depuis localStorage
  const savedForm = loadLS(LS_KEYS.quoteForm, null);
  const defaultClient = savedForm?.client || {
    name: "",
    phone: "",
    hotel: "",
    room: "",
    neighborhood: "",
  };
  const defaultItems = savedForm?.items && savedForm.items.length > 0 ? savedForm.items : [blankItem()];
  const defaultNotes = savedForm?.notes || "";

  const [client, setClient] = useState(defaultClient);
  const [items, setItems] = useState(defaultItems);
  const [notes, setNotes] = useState(defaultNotes);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [ticketNumbers, setTicketNumbers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sauvegarder le formulaire dans localStorage à chaque modification
  useEffect(() => {
    saveLS(LS_KEYS.quoteForm, {
      client,
      items,
      notes,
    });
  }, [client, items, notes]);

  function setItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, blankItem()]);
  }
  function removeItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

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
      } else if (act) {
        lineTotal += Number(it.adults || 0) * Number(act.priceAdult || 0);
        lineTotal += Number(it.children || 0) * Number(act.priceChild || 0);
        lineTotal += Number(it.babies || 0) * Number(act.priceBaby || 0);
      }

      // supplément transfert PAR ADULTE
      if (transferInfo && transferInfo.surcharge) {
        lineTotal += Number(transferInfo.surcharge || 0) * Number(it.adults || 0);
      }

      // extra
      if (it.extraAmount) {
        lineTotal += Number(it.extraAmount || 0);
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

  async function handleCreateQuote(e) {
    e.preventDefault();
    e.stopPropagation();

    // Empêcher la double soumission
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);

    // Filtrer les items vides (sans activité sélectionnée)
    const validComputed = computed.filter((c) => c.act && c.act.id);
    
    // Vérifier qu'il y a au moins un item valide
    if (validComputed.length === 0) {
      alert("⚠️ Veuillez sélectionner au moins une activité pour créer le devis.");
      setIsSubmitting(false);
      return;
    }

    const notAvailable = validComputed.filter((c) => c.weekday != null && !c.available);
    if (notAvailable.length) {
      alert(
        `⚠️ ${notAvailable.length} activité(s) sont hors-dispo ce jour-là. Le devis est quand même créé (date exceptionnelle).`,
      );
    }

    // Calculer le total uniquement avec les items valides
    const validGrandTotal = validComputed.reduce((s, c) => s + (c.lineTotal || 0), 0);
    const validGrandCurrency = validComputed.find((c) => c.currency)?.currency || "EUR";

    const q = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      client,
      notes: notes.trim(),
      createdByName: user?.name || "",
      items: validComputed.map((c) => ({
        activityId: c.act.id,
        activityName: c.act.name || "",
        date: c.raw.date,
        adults: Number(c.raw.adults || 0),
        children: Number(c.raw.children || 0),
        babies: Number(c.raw.babies || 0),
        extraLabel: c.raw.extraLabel || "",
        extraAmount: Number(c.raw.extraAmount || 0),
        neighborhood: client.neighborhood,
        slot: c.raw.slot,
        pickupTime: c.pickupTime || "",
        lineTotal: c.lineTotal,
        transferSurchargePerAdult: c.transferInfo?.surcharge || 0,
      })),
      total: validGrandTotal,
      totalCash: Math.round(validGrandTotal),
      totalCard: calculateCardPrice(validGrandTotal),
      currency: validGrandCurrency,
    };

    setQuotes((prev) => {
      const updated = [q, ...prev];
      saveLS(LS_KEYS.quotes, updated);
      return updated;
    });

    // Envoyer à Supabase si configuré
    if (supabase) {
      try {
        const supabaseData = {
          site_key: SITE_KEY,
          client_name: q.client.name || "",
          client_phone: q.client.phone || "",
          client_hotel: q.client.hotel || "",
          client_room: q.client.room || "",
          client_neighborhood: q.client.neighborhood || "",
          notes: q.notes || "",
          total: q.total,
          currency: q.currency,
          items: JSON.stringify(q.items),
          created_by_name: q.createdByName || "",
          created_at: q.createdAt,
        };

        console.log("🔄 Envoi du devis à Supabase:", supabaseData);
        const { data, error } = await supabase.from("quotes").insert(supabaseData);

        if (error) {
          console.error("❌ ERREUR Supabase (création devis):", error);
          console.error("Détails:", JSON.stringify(error, null, 2));
          
          // Toujours afficher l'erreur pour le debug
          alert(
            "❌ Erreur Supabase (création devis):\n\n" +
            "Message: " + (error.message || "Erreur inconnue") + "\n" +
            "Code: " + (error.code || "N/A") + "\n" +
            "Détails: " + (error.details || "N/A") + "\n" +
            "Hint: " + (error.hint || "N/A") + "\n\n" +
            "Vérifiez la console pour plus de détails.\n\n" +
            "Le devis est quand même enregistré en local."
          );
        } else {
          console.log("✅ Devis créé avec succès dans Supabase!");
          console.log("Réponse:", data);
        }
      } catch (err) {
        console.error("❌ EXCEPTION lors de l'envoi du devis à Supabase:", err);
        alert(
          "❌ Exception lors de l'envoi à Supabase:\n\n" +
          err.message + "\n\n" +
          "Vérifiez la console pour plus de détails.\n\n" +
          "Le devis est quand même enregistré en local."
        );
      }
    } else {
      console.warn("⚠️ Supabase non configuré - le devis n'est enregistré qu'en local");
    }

    // Réinitialiser le formulaire après création réussie
    setClient({
      name: "",
      phone: "",
      hotel: "",
      room: "",
      neighborhood: "",
    });
    setItems([blankItem()]);
    setNotes("");
    
    // Supprimer le formulaire sauvegardé
    localStorage.removeItem(LS_KEYS.quoteForm);

    setIsSubmitting(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <form 
        onSubmit={handleCreateQuote} 
        onKeyDown={(e) => {
          // Désactiver la touche Entrée pour soumettre le formulaire
          if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
            e.preventDefault();
          }
        }}
        className="space-y-5"
      >
        {/* Infos client */}
        <div className="grid md:grid-cols-5 gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Client</p>
            <TextInput value={client.name} onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Téléphone</p>
            <TextInput value={client.phone} onChange={(e) => setClient((c) => ({ ...c, phone: e.target.value }))} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Hôtel</p>
            <TextInput value={client.hotel} onChange={(e) => setClient((c) => ({ ...c, hotel: e.target.value }))} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Chambre</p>
            <TextInput value={client.room} onChange={(e) => setClient((c) => ({ ...c, room: e.target.value }))} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Quartier (client)</p>
            <select
              value={client.neighborhood}
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

        {/* Lignes */}
        <div className="space-y-4">
          {computed.map((c, idx) => (
            <div key={idx} className="bg-white/90 border border-blue-100/60 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Activité #{idx + 1}</p>
                {user?.canDeleteQuote && (
                  <GhostBtn type="button" onClick={() => removeItem(idx)}>
                    Supprimer
                  </GhostBtn>
                )}
              </div>
              <div className="grid md:grid-cols-5 gap-3 items-end">
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-500 mb-1">Activité</p>
                  <select
                    value={c.raw.activityId}
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
                    <p className="text-[10px] text-amber-700 mt-1">
                      ⚠️ activité pas dispo ce jour-là (on peut quand même créer)
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Quartier</p>
                  <div className="rounded-xl border border-dashed border-blue-200/50 bg-blue-50/50 px-3 py-2 text-sm text-gray-600">
                    {client.neighborhood
                      ? NEIGHBORHOODS.find((n) => n.key === client.neighborhood)?.label
                      : "— Choisir avec le client"}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Créneau</p>
                  <select
                    value={c.raw.slot}
                    onChange={(e) => setItem(idx, { slot: e.target.value })}
                    className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
                    disabled={!c.transferInfo || (!c.transferInfo.morningEnabled && !c.transferInfo.afternoonEnabled && !c.transferInfo.eveningEnabled)}
                  >
                    <option value="">— Choisir —</option>
                    {c.transferInfo?.morningEnabled && (
                      <option value="morning">Matin {c.transferInfo.morningTime ? `(${c.transferInfo.morningTime})` : ""}</option>
                    )}
                    {c.transferInfo?.afternoonEnabled && (
                      <option value="afternoon">
                        Après-midi {c.transferInfo.afternoonTime ? `(${c.transferInfo.afternoonTime})` : ""}
                      </option>
                    )}
                    {c.transferInfo?.eveningEnabled && (
                      <option value="evening">
                        Soir {c.transferInfo.eveningTime ? `(${c.transferInfo.eveningTime})` : ""}
                      </option>
                    )}
                  </select>
                  {c.transferInfo && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Supplément transfert: {currency(c.transferInfo.surcharge || 0, c.currency)} / adulte
                    </p>
                  )}
                </div>
              </div>

              {/* extra */}
              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-500 mb-1">Extra (ex: photos, bateau privé…)</p>
                  <TextInput
                    placeholder="Libellé extra"
                    value={c.raw.extraLabel}
                    onChange={(e) => setItem(idx, { extraLabel: e.target.value })}
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Montant Extra</p>
                  <NumberInput
                    value={c.raw.extraAmount}
                    onChange={(e) => setItem(idx, { extraAmount: e.target.value })}
                  />
                </div>
              </div>

              {/* passagers */}
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Adultes</p>
                  <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">
                    Enfants{c.act?.ageChild ? <span className="text-gray-400 ml-1">({c.act.ageChild})</span> : ""}
                  </p>
                  <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">
                    Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""}
                  </p>
                  <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500">Sous-total</p>
                <div className="text-right">
                  <p className="text-base font-semibold text-gray-900">
                    Espèces: {currencyNoCents(Math.round(c.lineTotal), c.currency)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Carte: {currencyNoCents(calculateCardPrice(c.lineTotal), c.currency)}
                  </p>
                </div>
              </div>
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

        <PrimaryBtn 
          type="submit" 
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Création en cours..." : "Créer le devis"}
        </PrimaryBtn>
      </form>

      {/* Devis récents */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Devis récents</h4>
        <div className="space-y-3">
          {quotes.map((q) => {
            // Vérifier si tous les tickets sont renseignés
            const allTicketsFilled = q.items?.every((item) => item.ticketNumber && item.ticketNumber.trim());
            const hasTickets = q.items?.some((item) => item.ticketNumber && item.ticketNumber.trim());

            return (
              <div key={q.id} className="bg-white/95 rounded-2xl border border-blue-100/60 shadow-md hover:shadow-lg transition-shadow duration-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">
                      {new Date(q.createdAt).toLocaleString("fr-FR")} — {q.client.phone || "Tél ?"}
                      {q.createdByName && <span className="ml-2 text-blue-600">• Créé par {q.createdByName}</span>}
                    </p>
                    <p className="text-sm text-gray-700">
                      {q.client.hotel || "Hôtel ?"} — {q.client.neighborhood || "Quartier ?"}
                    </p>
                    {hasTickets && (
                      <p className="text-xs text-green-600 mt-1">
                        ✅ Tickets : {q.items.filter((item) => item.ticketNumber && item.ticketNumber.trim()).length}/{q.items.length}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right mr-3">
                      <p className="text-base font-semibold">Espèces: {currencyNoCents(q.totalCash || Math.round(q.total), q.currency)}</p>
                      <p className="text-sm text-gray-600">Carte: {currencyNoCents(q.totalCard || calculateCardPrice(q.total), q.currency)}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                  <GhostBtn
                    onClick={() => {
                      setSelectedQuote(q);
                      // Initialiser les numéros de ticket existants
                      const existingTickets = {};
                      q.items?.forEach((item, idx) => {
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
                      // Générer le devis en HTML et l'ouvrir dans une nouvelle fenêtre
                      const htmlContent = generateQuoteHTML(q);
                      const newWindow = window.open();
                      if (newWindow) {
                        newWindow.document.write(htmlContent);
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
                        // Ouvrir le formulaire de modification
                        setClient(q.client);
                        setItems(
                          q.items.map((item) => ({
                            activityId: item.activityId || "",
                            date: item.date || new Date().toISOString().slice(0, 10),
                            adults: item.adults || 2,
                            children: item.children || 0,
                            babies: item.babies || 0,
                            extraLabel: item.extraLabel || "",
                            extraAmount: item.extraAmount || "",
                            slot: item.slot || "",
                          })),
                        );
                        setNotes(q.notes || "");
                        // Supprimer l'ancien devis
                        const updatedQuotes = quotes.filter((quote) => quote.id !== q.id);
                        setQuotes(updatedQuotes);
                        saveLS(LS_KEYS.quotes, updatedQuotes);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      ✏️ Modifier
                    </GhostBtn>
                  )}
                  {user?.canDeleteQuote && (
                    <GhostBtn
                      onClick={async () => {
                        if (window.confirm("Êtes-vous sûr de vouloir supprimer ce devis ?")) {
                          const updatedQuotes = quotes.filter((quote) => quote.id !== q.id);
                          setQuotes(updatedQuotes);
                          saveLS(LS_KEYS.quotes, updatedQuotes);

                          // Supprimer de Supabase si configuré
                          if (supabase) {
                            try {
                              const { error: deleteError } = await supabase
                                .from("quotes")
                                .delete()
                                .eq("site_key", SITE_KEY)
                                .eq("client_phone", q.client?.phone || "")
                                .eq("created_at", q.createdAt);
                              
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
          {quotes.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Aucun devis encore.</p>}
        </div>
      </div>

      {/* Modale de paiement */}
      {showPaymentModal && selectedQuote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-blue-100/50 shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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


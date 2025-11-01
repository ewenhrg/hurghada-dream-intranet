import { useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, NEIGHBORHOODS } from "../constants";
import { currency, saveLS, uuid } from "../utils";
import { TextInput, NumberInput, GhostBtn, PrimaryBtn } from "../components/ui";

export function HistoryPage({ quotes, setQuotes, user, activities }) {
  const [q, setQ] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [ticketNumbers, setTicketNumbers] = useState({});
  
  // États pour la modale de modification
  const [editClient, setEditClient] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [editNotes, setEditNotes] = useState("");
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
            <div key={d.id} className="bg-white/95 rounded-2xl border border-blue-100/60 shadow-md hover:shadow-lg transition-shadow duration-200 p-4">
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
${d.createdByName ? `Créé par: ${d.createdByName}` : ""}
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
                    const phoneNumber = d.client?.phone || "sans-tel";
                    const sanitizedPhone = phoneNumber.replace(/[^0-9+]/g, ""); // Nettoyer le numéro
                    a.download = `Devis ${sanitizedPhone}.txt`;
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
                        slot: item.slot || "",
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

                const { error: updateError } = await supabase
                  .from("quotes")
                  .update(supabaseUpdate)
                  .eq("site_key", SITE_KEY)
                  .eq("client_phone", selectedQuote.client?.phone || "")
                  .eq("created_at", selectedQuote.createdAt);

                if (updateError) {
                  console.warn("⚠️ Erreur mise à jour Supabase:", updateError);
                } else {
                  console.log("✅ Devis mis à jour dans Supabase!");
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
            alert("✅ Devis modifié avec succès !");
          }}
        />
      )}
    </div>
  );
}

// Composant modale de modification de devis
function EditQuoteModal({ quote, client, setClient, items, setItems, notes, setNotes, activities, onClose, onSave }) {
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
        const totalPersons = ad + ch;
        lineTotal = 145;
        if (totalPersons > 2) {
          const extraPersons = totalPersons - 2;
          const extraAdults = Math.max(ad - 2, 0);
          const extraKids = extraPersons - extraAdults;
          lineTotal += extraAdults * 20 + extraKids * 10;
        }
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

  function handleSave() {
    // Filtrer les items vides (sans activité sélectionnée)
    const validComputed = computed.filter((c) => c.act && c.act.id);

    // Vérifier qu'il y a au moins un item valide
    if (validComputed.length === 0) {
      alert("⚠️ Veuillez sélectionner au moins une activité.");
      return;
    }

    // Calculer le total uniquement avec les items valides
    const validGrandTotal = validComputed.reduce((s, c) => s + (c.lineTotal || 0), 0);
    const validGrandCurrency = validComputed.find((c) => c.currency)?.currency || "EUR";

    const updatedQuote = {
      ...quote,
      client,
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
        neighborhood: client.neighborhood,
        slot: c.raw.slot,
        pickupTime: c.pickupTime || "",
        lineTotal: c.lineTotal,
        transferSurchargePerAdult: c.transferInfo?.surcharge || 0,
        ticketNumber: c.raw.ticketNumber || quote.items?.find((item) => item.activityId === c.act.id && item.date === c.raw.date)?.ticketNumber || "",
      })),
      total: validGrandTotal,
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
              <TextInput value={client.phone || ""} onChange={(e) => setClient((c) => ({ ...c, phone: e.target.value }))} />
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
                </div>
                <div className="grid md:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      Bébés{c.act?.ageBaby ? <span className="text-gray-400 ml-1">({c.act.ageBaby})</span> : ""}
                    </p>
                    <NumberInput value={c.raw.babies || 0} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                  </div>
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
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Extra (label)</p>
                    <TextInput value={c.raw.extraLabel || ""} onChange={(e) => setItem(idx, { extraLabel: e.target.value })} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Extra (montant)</p>
                    <NumberInput value={c.raw.extraAmount || ""} onChange={(e) => setItem(idx, { extraAmount: e.target.value })} />
                  </div>
                </div>
                {c.lineTotal > 0 && (
                  <div className="text-right text-sm font-semibold text-gray-700">
                    Sous-total : {currency(c.lineTotal, c.currency)}
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
              <p className="text-xl font-bold">{currency(grandTotal, grandCurrency)}</p>
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


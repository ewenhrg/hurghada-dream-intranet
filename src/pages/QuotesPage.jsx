import { useState, useMemo } from "react";
import { LS_KEYS, NEIGHBORHOODS } from "../constants";
import { uuid, currency, saveLS } from "../utils";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";

export function QuotesPage({ activities, quotes, setQuotes }) {
  const blankItem = () => ({
    activityId: "",
    date: new Date().toISOString().slice(0, 10),
    adults: 2,
    children: 0,
    babies: 0,
    extraLabel: "",
    extraAmount: "",
    dauphin: false,
    slot: "",
  });

  const [client, setClient] = useState({
    name: "",
    phone: "",
    hotel: "",
    room: "",
    neighborhood: "",
  });
  const [items, setItems] = useState([blankItem()]);
  const [notes, setNotes] = useState("");

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
        const totalPersons = ad + ch;

        // base 145 pour 2
        lineTotal = 145;

        if (totalPersons > 2) {
          const extraPersons = totalPersons - 2;
          // on suppose que les adultes en plus sont +20
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

      // option dauphin +20
      if (it.dauphin) {
        lineTotal += 20;
      }

      const pickupTime =
        it.slot === "morning"
          ? transferInfo?.morningTime
          : it.slot === "afternoon"
            ? transferInfo?.afternoonTime
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

  function handleCreateQuote(e) {
    e.preventDefault();

    const notAvailable = computed.filter((c) => c.act && c.weekday != null && !c.available);
    if (notAvailable.length) {
      alert(
        `⚠️ ${notAvailable.length} activité(s) sont hors-dispo ce jour-là. Le devis est quand même créé (date exceptionnelle).`,
      );
    }

    const q = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      client,
      notes: notes.trim(),
      items: computed.map((c) => ({
        activityId: c.act?.id || "",
        activityName: c.act?.name || "",
        date: c.raw.date,
        adults: Number(c.raw.adults || 0),
        children: Number(c.raw.children || 0),
        babies: Number(c.raw.babies || 0),
        extraLabel: c.raw.extraLabel || "",
        extraAmount: Number(c.raw.extraAmount || 0),
        dauphin: !!c.raw.dauphin,
        neighborhood: client.neighborhood,
        slot: c.raw.slot,
        pickupTime: c.pickupTime || "",
        lineTotal: c.lineTotal,
        transferSurchargePerAdult: c.transferInfo?.surcharge || 0,
      })),
      total: grandTotal,
      currency: grandCurrency,
    };

    setQuotes((prev) => [q, ...prev]);
    saveLS(LS_KEYS.quotes, [q, ...quotes]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <form onSubmit={handleCreateQuote} className="space-y-5">
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
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
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
            <div key={idx} className="bg-white/80 border border-gray-100 rounded-2xl p-4 space-y-3">
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
                    value={c.raw.activityId}
                    onChange={(e) => setItem(idx, { activityId: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
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
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
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
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                    disabled={!c.transferInfo || (!c.transferInfo.morningEnabled && !c.transferInfo.afternoonEnabled)}
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
                  </select>
                  {c.transferInfo && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Supplément transfert: {currency(c.transferInfo.surcharge || 0, c.currency)} / adulte
                    </p>
                  )}
                </div>
              </div>

              {/* extra + dauphin */}
              <div className="grid md:grid-cols-4 gap-3">
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
                <label className="flex items-center gap-2 text-sm mt-5 md:mt-6">
                  <input
                    type="checkbox"
                    checked={c.raw.dauphin}
                    onChange={(e) => setItem(idx, { dauphin: e.target.checked })}
                  />
                  Dauphin (+20€)
                </label>
              </div>

              {/* passagers */}
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Adultes</p>
                  <NumberInput value={c.raw.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Enfants</p>
                  <NumberInput value={c.raw.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Bébés</p>
                  <NumberInput value={c.raw.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500">Sous-total</p>
                <p className="text-base font-semibold text-gray-900">{currency(c.lineTotal, c.currency)}</p>
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

        <PrimaryBtn type="submit" className="w-full">
          Créer le devis
        </PrimaryBtn>
      </form>

      {/* Devis récents */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Devis récents</h4>
        <div className="space-y-3">
          {quotes.map((q) => (
            <div key={q.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-500">
                    {new Date(q.createdAt).toLocaleString("fr-FR")} — {q.client.phone || "Tél ?"}
                  </p>
                  <p className="text-sm text-gray-700">
                    {q.client.hotel || "Hôtel ?"} — {q.client.neighborhood || "Quartier ?"}
                  </p>
                </div>
                <p className="text-base font-semibold">{currency(q.total, q.currency)}</p>
              </div>
            </div>
          ))}
          {quotes.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Aucun devis encore.</p>}
        </div>
      </div>
    </div>
  );
}


import { useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, CATEGORIES, WEEKDAYS } from "../constants";
import { uuid, currency, emptyTransfers, saveLS } from "../utils";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { DaysSelector } from "../components/DaysSelector";
import { TransfersEditor } from "../components/TransfersEditor";

export function ActivitiesPage({ activities, setActivities, remoteEnabled }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "desert",
    priceAdult: "",
    priceChild: "",
    priceBaby: "",
    currency: "EUR",
    availableDays: [false, false, false, false, false, false, false],
    notes: "",
    transfers: emptyTransfers(),
  });

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;

    const newA = {
      id: uuid(),
      name: form.name.trim(),
      category: form.category,
      priceAdult: Number(form.priceAdult || 0),
      priceChild: Number(form.priceChild || 0),
      priceBaby: Number(form.priceBaby || 0),
      currency: form.currency || "EUR",
      availableDays: form.availableDays,
      notes: form.notes,
      transfers: form.transfers,
      site_key: SITE_KEY,
    };

    const next = [newA, ...activities];
    setActivities(next);
    saveLS(LS_KEYS.activities, next);

    // Envoyer à Supabase si configuré (essayer toujours si supabase existe)
    if (supabase) {
      try {
        // Préparer les données pour Supabase avec seulement les colonnes de base
        // Note: available_days et transfers ne sont pas envoyés si les colonnes n'existent pas encore
        const supabaseData = {
          site_key: SITE_KEY,
          name: newA.name,
          category: newA.category,
          price_adult: newA.priceAdult,
          price_child: newA.priceChild,
          price_baby: newA.priceBaby,
          currency: newA.currency,
          notes: newA.notes || "",
          // available_days et transfers seront ajoutés plus tard quand les colonnes seront créées dans Supabase
        };

        const { error } = await supabase.from("activities").insert(supabaseData);
        if (error) {
          // Si l'erreur concerne une colonne manquante, on informe l'utilisateur
          if (error.message && error.message.includes("column")) {
            console.warn("Colonne manquante dans Supabase:", error.message);
            // On continue silencieusement - l'activité est sauvegardée localement
            console.log("⚠️ L'activité est sauvegardée localement mais certaines colonnes manquent dans Supabase");
          } else if (error.message && error.message.includes("Supabase non configuré")) {
            console.log("Supabase non configuré, activité sauvegardée localement uniquement");
          } else {
            console.error("Erreur Supabase (création):", error);
            // Afficher l'alerte seulement pour les erreurs critiques
            if (!error.message.includes("column")) {
              alert(
                "Erreur Supabase (création) : " +
                  error.message +
                  "\nL'activité est quand même enregistrée en local.",
              );
            }
          }
        } else {
          console.log("✅ Activité créée avec succès dans Supabase");
        }
      } catch (err) {
        console.error("Erreur lors de l'envoi à Supabase:", err);
        // Ne pas afficher d'alerte pour les erreurs de schéma
        if (!err.message || !err.message.includes("column")) {
          console.warn("Erreur non critique, activité sauvegardée localement");
        }
      }
    }

    setForm({
      name: "",
      category: "desert",
      priceAdult: "",
      priceChild: "",
      priceBaby: "",
      currency: "EUR",
      availableDays: [false, false, false, false, false, false, false],
      notes: "",
      transfers: emptyTransfers(),
    });
    setShowForm(false);
  }

  function handleDelete(id) {
    if (!window.confirm("Supprimer cette activité ?")) return;
    const next = activities.filter((a) => a.id !== id);
    setActivities(next);
    saveLS(LS_KEYS.activities, next);
  }

  const grouped = useMemo(() => {
    const base = {};
    CATEGORIES.forEach((c) => (base[c.key] = []));
    activities.forEach((a) => {
      const key = CATEGORIES.find((c) => c.key === a.category) ? a.category : "desert";
      base[key].push(a);
    });
    return base;
  }, [activities]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          Ajoutez une activité, ses prix, ses jours, ses transferts (quartier, matin / après-midi).
        </p>
        <PrimaryBtn onClick={() => setShowForm((s) => !s)}>{showForm ? "Fermer" : "Ajouter une activité"}</PrimaryBtn>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 bg-gray-50 rounded-2xl p-4 border border-gray-100">
          <div className="grid md:grid-cols-2 gap-3">
            <TextInput
              placeholder="Nom de l'activité"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <NumberInput
              placeholder="Prix adulte"
              value={form.priceAdult}
              onChange={(e) => setForm((f) => ({ ...f, priceAdult: e.target.value }))}
            />
            <NumberInput
              placeholder="Prix enfant"
              value={form.priceChild}
              onChange={(e) => setForm((f) => ({ ...f, priceChild: e.target.value }))}
            />
            <NumberInput
              placeholder="Prix bébé"
              value={form.priceBaby}
              onChange={(e) => setForm((f) => ({ ...f, priceBaby: e.target.value }))}
            />
            <TextInput
              placeholder="Devise"
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Jours disponibles</p>
            <DaysSelector value={form.availableDays} onChange={(v) => setForm((f) => ({ ...f, availableDays: v }))} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">
              Transferts par quartier (activer Matin / Après-midi et indiquer les heures et suppléments)
            </p>
            <TransfersEditor value={form.transfers} onChange={(v) => setForm((f) => ({ ...f, transfers: v }))} />
          </div>
          <TextInput
            placeholder="Notes (facultatif)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <div className="flex justify-end">
            <PrimaryBtn type="submit">Enregistrer</PrimaryBtn>
          </div>
        </form>
      )}

      {CATEGORIES.map((cat) => (
        <div key={cat.key} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">{cat.label}</h3>
          <div className="rounded-xl border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Activité</th>
                  <th className="text-left px-3 py-2">Adulte</th>
                  <th className="text-left px-3 py-2">Enfant</th>
                  <th className="text-left px-3 py-2">Bébé</th>
                  <th className="text-left px-3 py-2">Jours</th>
                  <th className="text-left px-3 py-2">Notes</th>
                  <th className="text-right px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {(grouped[cat.key] || []).map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2">{currency(a.priceAdult, a.currency)}</td>
                    <td className="px-3 py-2">{currency(a.priceChild, a.currency)}</td>
                    <td className="px-3 py-2">{currency(a.priceBaby, a.currency)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {WEEKDAYS.map((d, idx) =>
                          a.availableDays?.[idx] ? (
                            <span
                              key={d.key}
                              className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium"
                            >
                              {d.label}
                            </span>
                          ) : null,
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{a.notes || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <GhostBtn onClick={() => handleDelete(a.id)}>Supprimer</GhostBtn>
                    </td>
                  </tr>
                ))}
                {(!grouped[cat.key] || grouped[cat.key].length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-gray-400 text-sm">
                      Aucune activité dans cette catégorie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}


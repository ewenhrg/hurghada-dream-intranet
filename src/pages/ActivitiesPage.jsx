import { useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY, LS_KEYS, CATEGORIES, WEEKDAYS } from "../constants";
import { uuid, currency, emptyTransfers, saveLS } from "../utils";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { DaysSelector } from "../components/DaysSelector";
import { TransfersEditor } from "../components/TransfersEditor";

export function ActivitiesPage({ activities, setActivities, remoteEnabled, user }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [form, setForm] = useState({
    name: "",
    category: "desert",
    priceAdult: "",
    priceChild: "",
    priceBaby: "",
    ageChild: "",
    ageBaby: "",
    currency: "EUR",
    availableDays: [false, false, false, false, false, false, false],
    notes: "",
    transfers: emptyTransfers(),
  });

  function handleEdit(activity) {
    setForm({
      name: activity.name || "",
      category: activity.category || "desert",
      priceAdult: activity.priceAdult || "",
      priceChild: activity.priceChild || "",
      priceBaby: activity.priceBaby || "",
      ageChild: activity.ageChild || "",
      ageBaby: activity.ageBaby || "",
      currency: activity.currency || "EUR",
      availableDays: activity.availableDays || [false, false, false, false, false, false, false],
      notes: activity.notes || "",
      transfers: activity.transfers || emptyTransfers(),
    });
    setEditingId(activity.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;

    const isEditing = editingId !== null;
    const activityData = {
      id: isEditing ? editingId : uuid(),
      name: form.name.trim(),
      category: form.category,
      priceAdult: Number(form.priceAdult || 0),
      priceChild: Number(form.priceChild || 0),
      priceBaby: Number(form.priceBaby || 0),
      ageChild: form.ageChild || "",
      ageBaby: form.ageBaby || "",
      currency: form.currency || "EUR",
      availableDays: form.availableDays,
      notes: form.notes,
      transfers: form.transfers,
      site_key: SITE_KEY,
    };

    let next;
    if (isEditing) {
      // Modification
      next = activities.map((a) => (a.id === editingId ? activityData : a));
    } else {
      // Création
      next = [activityData, ...activities];
    }
    setActivities(next);
    saveLS(LS_KEYS.activities, next);

    // Envoyer à Supabase si configuré (essayer toujours si supabase existe)
    if (supabase) {
      try {
        // Préparer les données pour Supabase
        let supabaseData = {
          site_key: SITE_KEY,
          name: activityData.name,
        };

        // Ajouter les colonnes optionnelles si elles existent
        if (activityData.category) supabaseData.category = activityData.category;
        if (activityData.priceAdult !== undefined) supabaseData.price_adult = activityData.priceAdult;
        if (activityData.priceChild !== undefined) supabaseData.price_child = activityData.priceChild;
        if (activityData.priceBaby !== undefined) supabaseData.price_baby = activityData.priceBaby;
        if (activityData.ageChild) supabaseData.age_child = activityData.ageChild;
        if (activityData.ageBaby) supabaseData.age_baby = activityData.ageBaby;
        if (activityData.currency) supabaseData.currency = activityData.currency;
        if (activityData.notes) supabaseData.notes = activityData.notes;
        if (activityData.availableDays) supabaseData.available_days = activityData.availableDays;
        if (activityData.transfers) supabaseData.transfers = JSON.stringify(activityData.transfers);

        console.log("🔄 Envoi à Supabase:", supabaseData);
        const { data, error } = await supabase.from("activities").insert(supabaseData);
        
        if (error) {
          console.error("❌ ERREUR Supabase (création):", error);
          console.error("Détails:", JSON.stringify(error, null, 2));
          
          // Si l'erreur concerne des colonnes manquantes, on informe l'utilisateur
          if (error.message && error.message.includes("column")) {
            console.warn("⚠️ Colonnes manquantes dans Supabase. Vérifiez la structure de la table.");
            alert(
              "⚠️ Erreur de structure Supabase :\n" +
                error.message +
                "\n\nCode: " + (error.code || "N/A") +
                "\n\nL'activité est sauvegardée localement.\n\n" +
                "Vérifiez que la table 'activities' contient au moins les colonnes :\n" +
                "- site_key\n" +
                "- name\n\n" +
                "Les autres colonnes peuvent être ajoutées progressivement."
            );
          } else if (error.message && error.message.includes("row-level security") || error.code === "42501") {
            // Erreur de politique RLS (Row Level Security)
            console.error("❌ Erreur RLS (Row Level Security) - Les politiques Supabase bloquent l'insertion");
            alert(
              "⚠️ Erreur de sécurité Supabase (RLS) :\n" +
                error.message +
                "\n\nCode: " + (error.code || "N/A") +
                "\n\nL'activité est sauvegardée localement.\n\n" +
                "SOLUTION : Dans Supabase, allez dans Authentication > Policies\n" +
                "et créez une politique pour permettre l'INSERT sur la table 'activities' :\n\n" +
                "Policy name: Allow insert activities\n" +
                "Allowed operation: INSERT\n" +
                "Policy definition: true\n\n" +
                "Ou désactivez temporairement RLS sur la table 'activities' pour le développement."
            );
          } else {
            alert(
              "Erreur Supabase (création) :\n" +
                error.message +
                "\n\nCode: " + (error.code || "N/A") +
                "\n\nL'activité est quand même enregistrée en local.\n\nVérifiez la console pour plus de détails."
            );
          }
        } else {
          const action = isEditing ? "modifiée" : "créée";
          console.log(`✅ Activité ${action} avec succès dans Supabase!`);
          console.log("Données retournées:", data);
          // Afficher un message de succès
          alert(`✅ Activité ${action} avec succès dans Supabase!`);
          
          // Si modification, mettre à jour aussi dans Supabase (si possible)
          if (isEditing && supabase) {
            try {
              // Note: Pour l'UPDATE, il faudrait avoir l'ID Supabase réel (pas le UUID local)
              // Pour l'instant, on essaie juste avec site_key et name pour trouver la ligne
              const { error: updateError } = await supabase
                .from("activities")
                .update({ name: activityData.name })
                .eq("site_key", SITE_KEY)
                .eq("name", activityData.name);
              
              if (updateError) {
                console.warn("Erreur lors de la mise à jour Supabase:", updateError);
              } else {
                console.log("✅ Activité mise à jour dans Supabase");
              }
            } catch (updateErr) {
              console.warn("Erreur lors de la mise à jour Supabase:", updateErr);
            }
          }
        }
      } catch (err) {
        console.error("❌ EXCEPTION lors de l'envoi à Supabase:", err);
        alert(
          "Exception lors de l'envoi à Supabase :\n" +
            (err.message || String(err)) +
            "\n\nL'activité est quand même enregistrée en local.\n\nVérifiez la console pour plus de détails."
        );
      }
    } else {
      console.warn("⚠️ Supabase n'est pas disponible (stub)");
      alert("⚠️ Supabase n'est pas configuré. L'activité est sauvegardée uniquement en local.");
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
    setEditingId(null);
    setShowForm(false);
  }

  function handleDelete(id) {
    if (!window.confirm("Supprimer cette activité ?")) return;
    const next = activities.filter((a) => a.id !== id);
    setActivities(next);
    saveLS(LS_KEYS.activities, next);
  }

  // Filtrer les activités par recherche et par jour
  const filteredActivities = useMemo(() => {
    let filtered = activities;

    // Filtrer par recherche (nom ou notes)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((a) => {
        const nameMatch = a.name?.toLowerCase().includes(query);
        const notesMatch = a.notes?.toLowerCase().includes(query);
        return nameMatch || notesMatch;
      });
    }

    // Filtrer par jour sélectionné
    if (selectedDay !== "") {
      const dayIndex = parseInt(selectedDay);
      filtered = filtered.filter((a) => {
        return a.availableDays?.[dayIndex] === true;
      });
    }

    return filtered;
  }, [activities, searchQuery, selectedDay]);

  const grouped = useMemo(() => {
    const base = {};
    CATEGORIES.forEach((c) => (base[c.key] = []));
    filteredActivities.forEach((a) => {
      const key = CATEGORIES.find((c) => c.key === a.category) ? a.category : "desert";
      base[key].push(a);
    });
    return base;
  }, [filteredActivities]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          Ajoutez une activité, ses prix, ses jours, ses transferts (quartier, matin / après-midi).
        </p>
        {user?.canAddActivity && (
          <PrimaryBtn
            onClick={() => {
              if (showForm) {
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
                setEditingId(null);
              }
              setShowForm((s) => !s);
            }}
          >
            {showForm ? "Annuler" : "Ajouter une activité"}
          </PrimaryBtn>
        )}
      </div>

      {/* Filtres et recherche */}
      <div className="grid md:grid-cols-2 gap-3 bg-white/90 rounded-2xl border border-blue-100/60 p-4 shadow-md">
        <div>
          <p className="text-xs text-gray-500 mb-1">Rechercher une activité</p>
          <TextInput
            placeholder="Rechercher par nom ou notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Filtrer par jour</p>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm"
          >
            <option value="">Tous les jours</option>
            {WEEKDAYS.map((day) => (
              <option key={day.key} value={day.key}>
                {day.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 bg-blue-50/50 rounded-2xl p-4 border border-blue-100/60 shadow-md">
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
            <div>
              <NumberInput
                placeholder="Prix adulte"
                value={form.priceAdult}
                onChange={(e) => setForm((f) => ({ ...f, priceAdult: e.target.value }))}
              />
            </div>
            <div>
              <NumberInput
                placeholder="Prix enfant"
                value={form.priceChild}
                onChange={(e) => setForm((f) => ({ ...f, priceChild: e.target.value }))}
              />
              <TextInput
                placeholder="Âge enfant (ex: 5-12 ans)"
                value={form.ageChild}
                onChange={(e) => setForm((f) => ({ ...f, ageChild: e.target.value }))}
                className="mt-2"
              />
            </div>
            <div>
              <NumberInput
                placeholder="Prix bébé"
                value={form.priceBaby}
                onChange={(e) => setForm((f) => ({ ...f, priceBaby: e.target.value }))}
              />
              <TextInput
                placeholder="Âge bébé (ex: 0-4 ans)"
                value={form.ageBaby}
                onChange={(e) => setForm((f) => ({ ...f, ageBaby: e.target.value }))}
                className="mt-2"
              />
            </div>
            <div>
              <TextInput
                placeholder="Devise"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              />
            </div>
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
            <PrimaryBtn type="submit">{editingId ? "Modifier l'activité" : "Enregistrer"}</PrimaryBtn>
          </div>
        </form>
      )}

      {CATEGORIES.map((cat) => (
        <div key={cat.key} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">{cat.label}</h3>
          <div className="rounded-xl border border-blue-100/60 bg-white/90 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-blue-50/70 text-gray-700 text-xs">
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
                      <div className="flex gap-2 justify-end">
                        {user?.canEditActivity && (
                          <GhostBtn onClick={() => handleEdit(a)}>Modifier</GhostBtn>
                        )}
                        {user?.canDeleteActivity && (
                          <GhostBtn onClick={() => handleDelete(a.id)}>Supprimer</GhostBtn>
                        )}
                      </div>
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


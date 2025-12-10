import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { TextInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";

export function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    canDeleteQuote: false,
    canAddActivity: false,
    canEditActivity: false,
    canDeleteActivity: false,
    canResetData: false,
    canAccessActivities: true,
    canAccessHistory: true,
    canAccessTickets: true,
    canAccessModifications: false,
    canAccessSituation: false,
    canAccessUsers: false,
  });

  // Charger les utilisateurs depuis Supabase
  async function loadUsers() {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
      if (error) {
        logger.error("Erreur lors du chargement des utilisateurs:", error);
        toast.error("Erreur lors du chargement des utilisateurs: " + (error.message || "Erreur inconnue"));
      } else {
        setUsers(data || []);
      }
    } catch (err) {
      logger.error("Exception lors du chargement des utilisateurs:", err);
      toast.error("Exception lors du chargement des utilisateurs: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Charger les utilisateurs au montage
  useEffect(() => {
    loadUsers();
  }, []);

  // Réinitialiser le formulaire
  function resetForm() {
    setForm({
      name: "",
      code: "",
      canDeleteQuote: false,
      canAddActivity: false,
      canEditActivity: false,
      canDeleteActivity: false,
      canResetData: false,
      canAccessActivities: true,
      canAccessHistory: true,
      canAccessTickets: true,
      canAccessModifications: false,
      canAccessSituation: false,
      canAccessUsers: false,
    });
    setEditingUser(null);
    setShowForm(false);
  }

  // Modifier un utilisateur
  function handleEdit(u) {
    setForm({
      name: u.name || "",
      code: u.code || "",
      canDeleteQuote: u.can_delete_quote || false,
      canAddActivity: u.can_add_activity || false,
      canEditActivity: u.can_edit_activity || false,
      canDeleteActivity: u.can_delete_activity || false,
      canResetData: u.can_reset_data || false,
      canAccessActivities: u.can_access_activities !== false, // true par défaut
      canAccessHistory: u.can_access_history !== false, // true par défaut
      canAccessTickets: u.can_access_tickets !== false, // true par défaut
      canAccessModifications: u.can_access_modifications || false,
      canAccessSituation: u.can_access_situation || false,
      canAccessUsers: u.can_access_users || false,
    });
    setEditingUser(u);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Sauvegarder (créer ou modifier) un utilisateur
  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    // Validation
    if (!form.name.trim()) {
      toast.warning("Veuillez entrer un nom.");
      setLoading(false);
      return;
    }
    if (!form.code.trim() || !/^\d{6}$/.test(form.code)) {
      toast.warning("Le code doit contenir exactement 6 chiffres.");
      setLoading(false);
      return;
    }

    try {
      const userData = {
        name: form.name.trim(),
        code: form.code.trim(),
        can_delete_quote: form.canDeleteQuote,
        can_add_activity: form.canAddActivity,
        can_edit_activity: form.canEditActivity,
        can_delete_activity: form.canDeleteActivity,
        can_reset_data: form.canResetData,
        can_access_activities: form.canAccessActivities,
        can_access_history: form.canAccessHistory,
        can_access_tickets: form.canAccessTickets,
        can_access_modifications: form.canAccessModifications,
        can_access_situation: form.canAccessSituation,
        can_access_users: form.canAccessUsers,
      };

      if (editingUser) {
        // Modifier un utilisateur existant
        const { error } = await supabase.from("users").update(userData).eq("id", editingUser.id).select().single();

        if (error) {
          logger.error("Erreur lors de la modification de l'utilisateur:", error);
          toast.error("Erreur lors de la modification de l'utilisateur: " + (error.message || "Erreur inconnue"));
        } else {
          logger.log("✅ Utilisateur modifié avec succès!");
          await loadUsers();
          resetForm();
          toast.success("Utilisateur modifié avec succès !");
        }
      } else {
        // Créer un nouvel utilisateur
        const { error } = await supabase.from("users").insert(userData).select().single();

        if (error) {
          logger.error("Erreur lors de la création de l'utilisateur:", error);
          if (error.code === "23505") {
            toast.error("Ce code est déjà utilisé par un autre utilisateur.");
          } else {
            toast.error("Erreur lors de la création de l'utilisateur: " + (error.message || "Erreur inconnue"));
          }
        } else {
          logger.log("✅ Utilisateur créé avec succès!");
          await loadUsers();
          resetForm();
          toast.success("Utilisateur créé avec succès !");
        }
      }
    } catch (err) {
      logger.error("Exception lors de la sauvegarde de l'utilisateur:", err);
      toast.error("Exception lors de la sauvegarde: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Supprimer un utilisateur
  async function handleDelete(userId, userName) {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur "${userName}" ?\n\nCette action est irréversible et supprimera définitivement l'utilisateur et toutes ses données.`)) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("users").delete().eq("id", userId);

      if (error) {
        logger.error("Erreur lors de la suppression de l'utilisateur:", error);
        toast.error("Erreur lors de la suppression: " + (error.message || "Erreur inconnue"));
      } else {
        logger.log("✅ Utilisateur supprimé avec succès!");
        await loadUsers();
        toast.success("Utilisateur supprimé avec succès !");
      }
    } catch (err) {
      logger.error("Exception lors de la suppression:", err);
      toast.error("Exception lors de la suppression: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Gestion des utilisateurs</h3>
          <p className="text-sm text-gray-600">Créez et gérez les utilisateurs avec leurs codes d'accès et permissions</p>
        </div>
        <PrimaryBtn onClick={() => setShowForm(!showForm)}>{showForm ? "Annuler" : "Nouvel utilisateur"}</PrimaryBtn>
      </div>

      {/* Formulaire de création/modification */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white/95 backdrop-blur-sm rounded-2xl border border-blue-100/60 p-6 space-y-4 shadow-lg">
          <h4 className="text-base font-semibold text-gray-800">{editingUser ? "Modifier l'utilisateur" : "Créer un nouvel utilisateur"}</h4>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Nom</label>
              <TextInput
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Rayan"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Code (6 chiffres)</label>
              <TextInput
                type="text"
                value={form.code}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setForm((f) => ({ ...f, code: value }));
                }}
                placeholder="Ex: 180203"
                maxLength={6}
                required
              />
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <p className="text-xs font-semibold text-gray-700 mb-3">Permissions</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canDeleteQuote}
                  onChange={(e) => setForm((f) => ({ ...f, canDeleteQuote: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut supprimer des devis dans la page Historique</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canAddActivity}
                  onChange={(e) => setForm((f) => ({ ...f, canAddActivity: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut ajouter des activités</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canEditActivity}
                  onChange={(e) => setForm((f) => ({ ...f, canEditActivity: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut modifier des activités</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canDeleteActivity}
                  onChange={(e) => setForm((f) => ({ ...f, canDeleteActivity: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut supprimer des activités</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canResetData}
                  onChange={(e) => setForm((f) => ({ ...f, canResetData: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut réinitialiser les données (accès admin)</span>
              </label>
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <p className="text-xs font-semibold text-gray-700 mb-3">Accès aux pages</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canAccessActivities}
                  onChange={(e) => setForm((f) => ({ ...f, canAccessActivities: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut accéder à la page Activités</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canAccessHistory}
                  onChange={(e) => setForm((f) => ({ ...f, canAccessHistory: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut accéder à la page Historique</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canAccessTickets}
                  onChange={(e) => setForm((f) => ({ ...f, canAccessTickets: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut accéder à la page Tickets</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canAccessModifications}
                  onChange={(e) => setForm((f) => ({ ...f, canAccessModifications: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut accéder à la page Modifications</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canAccessSituation}
                  onChange={(e) => setForm((f) => ({ ...f, canAccessSituation: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut accéder à la page Situation</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.canAccessUsers}
                  onChange={(e) => setForm((f) => ({ ...f, canAccessUsers: e.target.checked }))}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Peut accéder à la page Utilisateurs</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <GhostBtn type="button" onClick={resetForm} variant="neutral">
              Annuler
            </GhostBtn>
            <PrimaryBtn type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : editingUser ? "Modifier" : "Créer"}
            </PrimaryBtn>
          </div>
        </form>
      )}

      {/* Liste des utilisateurs */}
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-blue-100/60 shadow-lg overflow-hidden">
        <div className="p-4 border-b bg-blue-50/70">
          <h4 className="text-sm font-semibold text-gray-800">Liste des utilisateurs ({users.length})</h4>
        </div>
        {loading && users.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Chargement...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Aucun utilisateur trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-50/70 text-gray-700 text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Nom</th>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Permissions</th>
                  <th className="px-4 py-3 text-left">Créé le</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">{u.code}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.can_delete_quote && (
                          <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium">Supprimer devis</span>
                        )}
                        {u.can_add_activity && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium">Ajouter activité</span>
                        )}
                        {u.can_edit_activity && (
                          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium">Modifier activité</span>
                        )}
                        {u.can_delete_activity && (
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-medium">Supprimer activité</span>
                        )}
                        {u.can_reset_data && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">Admin</span>
                        )}
                        {u.can_access_activities !== false && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-medium">Page Activités</span>
                        )}
                        {u.can_access_history !== false && (
                          <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-medium">Page Historique</span>
                        )}
                        {u.can_access_tickets !== false && (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-medium">Page Tickets</span>
                        )}
                        {u.can_access_modifications === true && (
                          <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-medium">Page Modifications</span>
                        )}
                        {u.can_access_situation === true && (
                          <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-medium">Page Situation</span>
                        )}
                        {u.can_access_users === true && (
                          <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-[10px] font-medium">Page Utilisateurs</span>
                        )}
                        {!u.can_delete_quote &&
                          !u.can_add_activity &&
                          !u.can_edit_activity &&
                          !u.can_delete_activity &&
                          !u.can_reset_data &&
                          u.can_access_activities === false &&
                          u.can_access_history === false &&
                          u.can_access_tickets === false &&
                          u.can_access_modifications !== true &&
                          u.can_access_situation !== true &&
                          u.can_access_users !== true && <span className="text-[10px] text-gray-400">Aucune permission</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(u.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <GhostBtn onClick={() => handleEdit(u)} size="sm">
                          ✏️ Modifier
                        </GhostBtn>
                        <GhostBtn
                          onClick={() => handleDelete(u.id, u.name)}
                          variant="danger"
                          size="sm"
                        >
                          🗑️ Supprimer
                        </GhostBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


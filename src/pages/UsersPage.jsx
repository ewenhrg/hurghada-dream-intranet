import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { TextInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import {
  PERMISSION_GROUPS,
  PERMISSION_FORM_TO_DB,
  getDefaultPermissionForm,
  dbUserToFormUser,
  formToDbUser,
} from "../constants/permissions";

export function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(() => ({
    name: "",
    code: "",
    ...getDefaultPermissionForm(),
  }));

  async function loadUsers() {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });
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

  useEffect(() => {
    loadUsers();
  }, []);

  function resetForm() {
    setForm({
      name: "",
      code: "",
      ...getDefaultPermissionForm(),
    });
    setEditingUser(null);
    setShowForm(false);
  }

  function handleEdit(u) {
    setForm(dbUserToFormUser(u));
    setEditingUser(u);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

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
      const userData = formToDbUser(form);

      if (editingUser) {
        const { error } = await supabase
          .from("users")
          .update(userData)
          .eq("id", editingUser.id)
          .select()
          .single();

        if (error) {
          logger.error("Erreur lors de la modification de l'utilisateur:", error);
          toast.error("Erreur lors de la modification: " + (error.message || "Erreur inconnue"));
        } else {
          logger.log("✅ Utilisateur modifié avec succès!", userData);
          await loadUsers();
          resetForm();
          toast.success(
            "Utilisateur modifié avec succès.\nL'utilisateur devra se reconnecter pour que les nouvelles permissions soient prises en compte."
          );
        }
      } else {
        const { error } = await supabase
          .from("users")
          .insert(userData)
          .select()
          .single();

        if (error) {
          logger.error("Erreur lors de la création de l'utilisateur:", error);
          if (error.code === "23505") {
            toast.error("Ce code est déjà utilisé par un autre utilisateur.");
          } else {
            toast.error("Erreur lors de la création: " + (error.message || "Erreur inconnue"));
          }
        } else {
          logger.log("✅ Utilisateur créé avec succès!", userData);
          await loadUsers();
          resetForm();
          toast.success("Utilisateur créé avec succès.");
        }
      }
    } catch (err) {
      logger.error("Exception lors de la sauvegarde de l'utilisateur:", err);
      toast.error("Exception lors de la sauvegarde: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(userId, userName) {
    if (
      !window.confirm(
        `Êtes-vous sûr de vouloir supprimer l'utilisateur "${userName}" ?\n\nCette action est irréversible.`
      )
    ) {
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
        toast.success("Utilisateur supprimé avec succès.");
      }
    } catch (err) {
      logger.error("Exception lors de la suppression:", err);
      toast.error("Exception lors de la suppression: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  /** Retourne les libellés des permissions actives pour un utilisateur DB */
  function getActivePermissionLabels(dbUser) {
    const labels = [];
    PERMISSION_GROUPS.forEach((group) => {
      group.permissions.forEach((p) => {
        const dbKey = PERMISSION_FORM_TO_DB[p.formKey];
        const value = dbKey ? dbUser[dbKey] : undefined;
        const isActive =
          value === true || (p.defaultValue === true && value !== false);
        if (isActive) {
          labels.push(p.label);
        }
      });
    });
    return labels;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Gestion des utilisateurs</h3>
          <p className="text-sm text-gray-600">
            Créez et gérez les utilisateurs avec leurs codes d'accès et permissions. Les permissions sont bien séparées par catégorie.
          </p>
        </div>
        <PrimaryBtn onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "Nouvel utilisateur"}
        </PrimaryBtn>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white/95 backdrop-blur-sm rounded-2xl border border-blue-100/60 p-6 space-y-6 shadow-lg"
        >
          <h4 className="text-base font-semibold text-gray-800">
            {editingUser ? "Modifier l'utilisateur" : "Créer un nouvel utilisateur"}
          </h4>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom</label>
              <TextInput
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Rayan"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code (6 chiffres)</label>
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

          {PERMISSION_GROUPS.map((group) => (
            <div key={group.id} className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-sm font-semibold text-gray-800 mb-1">{group.label}</p>
              {group.description && (
                <p className="text-xs text-gray-500 mb-3">{group.description}</p>
              )}
              <div className="space-y-2">
                {group.permissions.map((p) => (
                  <label key={p.formKey} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form[p.formKey] === true}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [p.formKey]: e.target.checked }))
                      }
                      className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <GhostBtn type="button" onClick={resetForm} variant="neutral">
              Annuler
            </GhostBtn>
            <PrimaryBtn type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : editingUser ? "Modifier" : "Créer"}
            </PrimaryBtn>
          </div>
        </form>
      )}

      <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-blue-100/60 shadow-lg overflow-hidden">
        <div className="p-4 border-b bg-blue-50/70">
          <h4 className="text-sm font-semibold text-gray-800">
            Liste des utilisateurs ({users.length})
          </h4>
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
                {users.map((u) => {
                  const activeLabels = getActivePermissionLabels(u);
                  return (
                    <tr key={u.id} className="border-t hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{u.code}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {activeLabels.length > 0 ? (
                            activeLabels.map((label) => (
                              <span
                                key={label}
                                className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium"
                              >
                                {label}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-gray-400">Aucune permission</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString("fr-FR")
                          : "—"}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

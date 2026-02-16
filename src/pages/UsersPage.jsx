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

  const groupStyles = {
    page_access: "bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-200/80",
    actions: "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200/80",
    admin: "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/80",
  };
  const groupTitleStyles = {
    page_access: "text-indigo-800",
    actions: "text-emerald-800",
    admin: "text-amber-800",
  };
  const badgeColors = [
    "bg-indigo-100 text-indigo-700",
    "bg-violet-100 text-violet-700",
    "bg-emerald-100 text-emerald-700",
    "bg-teal-100 text-teal-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-sky-100 text-sky-700",
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl px-5 py-5 bg-gradient-to-r from-violet-500/15 via-indigo-500/15 to-blue-500/15 border-2 border-violet-200/60">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 text-white text-xl">
            👥
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-800">Gestion des utilisateurs</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              Codes d'accès et permissions par catégorie.
            </p>
          </div>
        </div>
        <PrimaryBtn
          onClick={() => setShowForm(!showForm)}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 border-0 shadow-lg shadow-violet-500/25"
        >
          {showForm ? "Annuler" : "➕ Nouvel utilisateur"}
        </PrimaryBtn>
      </header>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white/95 backdrop-blur-sm rounded-2xl border-2 border-violet-100 p-6 space-y-6 shadow-xl shadow-violet-500/10"
        >
          <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <span className="text-violet-500">✏️</span>
            {editingUser ? "Modifier l'utilisateur" : "Créer un nouvel utilisateur"}
          </h4>

          <div className="grid md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nom</label>
              <TextInput
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Rayan"
                required
                className="border-violet-200 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Code (6 chiffres)</label>
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
                className="border-violet-200 focus:ring-violet-500 font-mono"
              />
            </div>
          </div>

          {PERMISSION_GROUPS.map((group) => (
            <div
              key={group.id}
              className={`rounded-xl border-2 p-4 ${groupStyles[group.id] || "bg-gray-50 border-gray-200"}`}
            >
              <p className={`text-sm font-bold mb-1 ${groupTitleStyles[group.id] || "text-gray-800"}`}>
                {group.label}
              </p>
              {group.description && (
                <p className="text-xs text-gray-600 mb-3">{group.description}</p>
              )}
              <div className="space-y-2">
                {group.permissions.map((p) => (
                  <label key={p.formKey} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={form[p.formKey] === true}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [p.formKey]: e.target.checked }))
                      }
                      className="rounded border-2 border-violet-300 text-violet-600 focus:ring-violet-500 focus:ring-2"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-3 justify-end pt-4 border-t-2 border-gray-200">
            <GhostBtn type="button" onClick={resetForm} variant="neutral">
              Annuler
            </GhostBtn>
            <PrimaryBtn
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 border-0 shadow-md"
            >
              {loading ? "Enregistrement..." : editingUser ? "Modifier" : "Créer"}
            </PrimaryBtn>
          </div>
        </form>
      )}

      <div className="rounded-2xl border-2 border-violet-100 shadow-xl shadow-violet-500/10 overflow-hidden bg-white/95">
        <div className="p-4 bg-gradient-to-r from-violet-500/20 via-indigo-500/20 to-blue-500/20 border-b-2 border-violet-100">
          <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <span className="text-violet-600">📋</span>
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
              <thead>
                <tr className="bg-gradient-to-r from-violet-100/80 to-indigo-100/80 text-gray-800 text-xs font-semibold">
                  <th className="px-4 py-3 text-left">Nom</th>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Permissions</th>
                  <th className="px-4 py-3 text-left">Créé le</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const activeLabels = getActivePermissionLabels(u);
                  return (
                    <tr
                      key={u.id}
                      className={`border-t border-violet-100/60 transition-colors ${
                        idx % 2 === 0 ? "bg-white hover:bg-violet-50/50" : "bg-violet-50/30 hover:bg-violet-50/70"
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-gray-800">{u.name}</td>
                      <td className="px-4 py-3 font-mono text-violet-700 font-medium">{u.code}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {activeLabels.length > 0 ? (
                            activeLabels.map((label, i) => (
                              <span
                                key={label}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  badgeColors[i % badgeColors.length]
                                }`}
                              >
                                {label}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">Aucune permission</span>
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
                          <GhostBtn onClick={() => handleEdit(u)} size="sm" className="text-indigo-600 hover:bg-indigo-50">
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

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { TextInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import { LS_KEYS } from "../constants";
import { loadLS, saveLS } from "../utils";
import {
  PERMISSION_GROUPS,
  PERMISSION_FORM_TO_DB,
  getDefaultPermissionForm,
  dbUserToFormUser,
  formToDbUser,
} from "../constants/permissions";

const LOCAL_ONLY_KEY = "_localOnly";

/** Fusionne le cache local avec Supabase quand la base renvoie moins de lignes (perte / suppression massive). */
function mergeUsersWhenRemoteShrunk(fromSupabase, cached) {
  const remote = fromSupabase || [];
  const prev = Array.isArray(cached) ? cached : [];
  if (prev.length === 0 || remote.length >= prev.length) {
    return { merged: remote, localOnlyAdded: 0, usedMerge: false };
  }
  const remoteCodes = new Set(remote.map((u) => u?.code).filter(Boolean));
  const merged = [...remote];
  let localOnlyAdded = 0;
  const seen = new Set(remoteCodes);
  for (const row of prev) {
    if (!row?.code || seen.has(row.code)) continue;
    const { [LOCAL_ONLY_KEY]: _drop, ...rest } = row;
    merged.push({ ...rest, [LOCAL_ONLY_KEY]: true });
    seen.add(row.code);
    localOnlyAdded += 1;
  }
  return { merged, localOnlyAdded, usedMerge: localOnlyAdded > 0 };
}

function stripLocalOnlyFlagForStorage(list) {
  return (list || []).map((u) => {
    if (!u?.[LOCAL_ONLY_KEY]) return u;
    const { [LOCAL_ONLY_KEY]: _, ...rest } = u;
    return rest;
  });
}

export function UsersPage() {
  const [users, setUsers] = useState(() => loadLS(LS_KEYS.users, []));
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(() => ({
    name: "",
    code: "",
    ...getDefaultPermissionForm(),
  }));

  const localOnlyUsers = useMemo(() => (users || []).filter((u) => u?.[LOCAL_ONLY_KEY]), [users]);

  const remoteUsersCount = useMemo(() => (users || []).filter((u) => !u?.[LOCAL_ONLY_KEY]).length, [users]);

  const loadUsers = useCallback(async () => {
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
        const fromSupabase = data || [];
        const current = loadLS(LS_KEYS.users, []);
        const { merged, localOnlyAdded, usedMerge } = mergeUsersWhenRemoteShrunk(fromSupabase, current);

        if (usedMerge && fromSupabase.length < current.length) {
          logger.warn(
            `🛡️ Utilisateurs: Supabase en renvoie ${fromSupabase.length}, le cache en avait ${current.length}. Fusion avec les entrées locales (codes absents de la base).`
          );
          toast.warning(
            `La base ne contient que ${fromSupabase.length} utilisateur(s) alors que le cache en avait ${current.length}. ` +
              (localOnlyAdded > 0
                ? `${localOnlyAdded} compte(s) récupéré(s) depuis le cache — utilisez « Réinsérer dans Supabase » pour les restaurer.`
                : "Vérifiez les données dans Supabase.")
          );
          setUsers(merged);
          saveLS(LS_KEYS.users, stripLocalOnlyFlagForStorage(merged));
        } else {
          setUsers(fromSupabase);
          saveLS(LS_KEYS.users, fromSupabase);
        }
      }
    } catch (err) {
      logger.error("Exception lors du chargement des utilisateurs:", err);
      toast.error("Exception lors du chargement des utilisateurs: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExportUsersBackup = useCallback(() => {
    const raw = loadLS(LS_KEYS.users, users);
    const payload = stripLocalOnlyFlagForStorage(raw);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hd_users_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Export téléchargé. Conservez ce fichier en lieu sûr.");
  }, [users]);

  const handleForceUseSupabaseOnly = useCallback(async () => {
    if (
      !window.confirm(
        "Cela remplace la liste affichée par le contenu actuel de Supabase uniquement. " +
          "Les comptes présents seulement dans le cache seront retirés de l’affichage (pas de suppression en base si déjà absents). Continuer ?"
      )
    ) {
      return;
    }
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
      if (error) {
        toast.error(error.message || "Erreur");
        return;
      }
      const rows = data || [];
      setUsers(rows);
      saveLS(LS_KEYS.users, rows);
      toast.success("Liste alignée sur Supabase.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRestoreMissingToSupabase = useCallback(async () => {
    if (localOnlyUsers.length === 0) {
      toast.warning("Aucun compte « cache seul » à réinsérer.");
      return;
    }
    if (
      !window.confirm(
        `Réinsérer ${localOnlyUsers.length} utilisateur(s) dans Supabase à partir du cache ? ` +
          "Les codes déjà présents en base seront ignorés (erreur doublon)."
      )
    ) {
      return;
    }
    if (!supabase) return;
    setRestoring(true);
    try {
      let ok = 0;
      let fail = 0;
      for (const row of localOnlyUsers) {
        const form = dbUserToFormUser(row);
        const payload = formToDbUser(form);
        const { error } = await supabase.from("users").insert(payload);
        if (error) {
          logger.error("Réimport utilisateur:", row.code, error);
          fail += 1;
        } else {
          ok += 1;
        }
      }
      if (ok > 0) toast.success(`${ok} utilisateur(s) réinséré(s) dans Supabase.`);
      if (fail > 0) toast.warning(`${fail} échec(s) (doublon ou erreur) — vérifiez la console.`);
      await loadUsers();
    } catch (err) {
      logger.error(err);
      toast.error(err?.message || "Erreur lors de la réinsertion.");
    } finally {
      setRestoring(false);
    }
  }, [localOnlyUsers, loadUsers]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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
        if (editingUser[LOCAL_ONLY_KEY]) {
          const { error } = await supabase.from("users").insert(userData).select().single();
          if (error) {
            logger.error("Erreur lors de la réinsertion de l'utilisateur (cache):", error);
            toast.error("Erreur: " + (error.message || "Erreur inconnue"));
          } else {
            logger.log("✅ Utilisateur réinséré depuis le cache!", userData);
            await loadUsers();
            resetForm();
            toast.success("Utilisateur enregistré dans Supabase.");
          }
        } else {
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

  async function handleDelete(u) {
    const isLocalOnly = Boolean(u?.[LOCAL_ONLY_KEY]);
    const userName = u?.name || "Utilisateur";

    if (isLocalOnly) {
      if (
        !window.confirm(
          `Retirer « ${userName} » du cache uniquement ? (Ce compte n’est pas dans Supabase.)`
        )
      ) {
        return;
      }
      const code = u.code;
      const next = users.filter((row) => !(row[LOCAL_ONLY_KEY] && row.code === code));
      setUsers(next);
      saveLS(LS_KEYS.users, stripLocalOnlyFlagForStorage(next));
      toast.success("Entrée retirée du cache.");
      return;
    }

    if (remoteUsersCount <= 1) {
      if (
        !window.confirm(
          `ATTENTION : c’est le dernier utilisateur présent dans la base. ` +
            `La suppression bloquera toute connexion sauf si vous en recréez un autre. ` +
            `Confirmer la suppression de « ${userName} » ?`
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        `Êtes-vous sûr de vouloir supprimer l'utilisateur "${userName}" ?\n\nCette action est irréversible.`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("users").delete().eq("id", u.id);

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

      {localOnlyUsers.length > 0 && (
        <div
          className="rounded-xl border-2 border-amber-300/80 bg-amber-50 px-4 py-4 text-sm text-amber-950 shadow-sm space-y-3"
          role="status"
        >
          <p className="font-semibold">Comptes récupérés depuis le cache (absents de Supabase)</p>
          <p className="text-amber-900/90 leading-relaxed">
            {localOnlyUsers.length} utilisateur(s) affiché(s) uniquement depuis le stockage du navigateur. Utilisez le bouton
            ci-dessous pour les réinsérer dans la base, ou exportez un fichier JSON avant toute manipulation.
          </p>
          <div className="flex flex-wrap gap-2">
            <PrimaryBtn
              type="button"
              disabled={restoring || loading}
              onClick={handleRestoreMissingToSupabase}
              className="bg-amber-600 hover:bg-amber-700 border-0 text-white"
            >
              {restoring ? "Réinsertion…" : "↻ Réinsérer dans Supabase"}
            </PrimaryBtn>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <GhostBtn type="button" onClick={handleExportUsersBackup} variant="neutral" className="text-xs">
          💾 Exporter la liste (cache)
        </GhostBtn>
        <GhostBtn type="button" onClick={handleForceUseSupabaseOnly} variant="neutral" className="text-xs">
          Afficher uniquement Supabase (ignore le cache)
        </GhostBtn>
      </div>

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
                      key={u[LOCAL_ONLY_KEY] ? `loc-${u.code}` : u.id}
                      className={`border-t border-violet-100/60 transition-colors ${
                        idx % 2 === 0 ? "bg-white hover:bg-violet-50/50" : "bg-violet-50/30 hover:bg-violet-50/70"
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          {u.name}
                          {u[LOCAL_ONLY_KEY] && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200/80">
                              Cache seulement
                            </span>
                          )}
                        </span>
                      </td>
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
                            onClick={() => handleDelete(u)}
                            variant="danger"
                            size="sm"
                          >
                            {u[LOCAL_ONLY_KEY] ? "Retirer du cache" : "🗑️ Supprimer"}
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

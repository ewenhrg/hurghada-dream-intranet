/**
 * Source unique des permissions utilisateur
 * Utilisée par UsersPage, LoginPage et userPermissions pour garantir la cohérence
 */

/** Nom de la clé en base (snake_case) → clé dans le formulaire / session (camelCase) */
export const PERMISSION_DB_TO_FORM = {
  can_delete_quote: "canDeleteQuote",
  can_add_activity: "canAddActivity",
  can_edit_activity: "canEditActivity",
  can_delete_activity: "canDeleteActivity",
  can_reset_data: "canResetData",
  can_access_activities: "canAccessActivities",
  can_access_history: "canAccessHistory",
  can_access_tickets: "canAccessTickets",
  can_access_modifications: "canAccessModifications",
  can_access_situation: "canAccessSituation",
  can_access_users: "canAccessUsers",
};

/** Clé formulaire → clé base */
export const PERMISSION_FORM_TO_DB = Object.fromEntries(
  Object.entries(PERMISSION_DB_TO_FORM).map(([k, v]) => [v, k])
);

/**
 * Groupes de permissions pour l’interface
 * Chaque groupe a: id, label, permissions (array de { formKey, label, description?, defaultValue })
 */
export const PERMISSION_GROUPS = [
  {
    id: "page_access",
    label: "Accès aux pages",
    description: "Pages visibles dans le menu. Si une page est décochée, l’utilisateur ne la verra pas.",
    permissions: [
      { formKey: "canAccessActivities", label: "Page Activités", defaultValue: true },
      { formKey: "canAccessHistory", label: "Page Historique", defaultValue: true },
      { formKey: "canAccessTickets", label: "Page Tickets", defaultValue: true },
      { formKey: "canAccessModifications", label: "Page Modifications", defaultValue: false },
      { formKey: "canAccessSituation", label: "Page Situation", defaultValue: false },
      { formKey: "canAccessUsers", label: "Page Utilisateurs", defaultValue: false },
    ],
  },
  {
    id: "actions",
    label: "Actions autorisées",
    description: "Droits pour modifier ou supprimer des données (devis, activités).",
    permissions: [
      { formKey: "canDeleteQuote", label: "Supprimer des devis (Historique)", defaultValue: false },
      { formKey: "canAddActivity", label: "Ajouter des activités", defaultValue: false },
      { formKey: "canEditActivity", label: "Modifier des activités", defaultValue: false },
      { formKey: "canDeleteActivity", label: "Supprimer des activités", defaultValue: false },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    description: "Accès à la gestion des utilisateurs et aux actions sensibles.",
    permissions: [
      { formKey: "canResetData", label: "Réinitialiser les données (accès admin)", defaultValue: false },
    ],
  },
];

/** Valeurs par défaut du formulaire (toutes les clés) */
export function getDefaultPermissionForm() {
  const form = {};
  PERMISSION_GROUPS.forEach((group) => {
    group.permissions.forEach((p) => {
      form[p.formKey] = p.defaultValue;
    });
  });
  return form;
}

/**
 * Convertit une ligne utilisateur Supabase (snake_case) en objet formulaire (camelCase)
 */
export function dbUserToFormUser(dbUser) {
  if (!dbUser) return null;
  const form = {
    name: dbUser.name || "",
    code: dbUser.code || "",
    ...getDefaultPermissionForm(),
  };
  Object.entries(PERMISSION_DB_TO_FORM).forEach(([dbKey, formKey]) => {
    const value = dbUser[dbKey];
    if (dbKey.startsWith("can_access_")) {
      form[formKey] = value !== false;
    } else {
      form[formKey] = Boolean(value);
    }
  });
  return form;
}

/**
 * Convertit le formulaire en objet pour Supabase (snake_case)
 */
export function formToDbUser(form) {
  const db = {
    name: form.name?.trim() || "",
    code: form.code?.trim() || "",
  };
  Object.entries(PERMISSION_FORM_TO_DB).forEach(([formKey, dbKey]) => {
    if (form[formKey] !== undefined) {
      db[dbKey] = Boolean(form[formKey]);
    }
  });
  return db;
}

/**
 * Construit l’objet utilisateur pour la session (camelCase) à partir des données Supabase
 * Utilisé après login pour stocker en sessionStorage
 */
export function dbUserToSessionUser(dbUser) {
  if (!dbUser) return null;
  const session = {
    id: dbUser.id,
    name: dbUser.name,
    code: dbUser.code,
    ...getDefaultPermissionForm(),
  };
  session.canAccessActivities = dbUser.can_access_activities !== false;
  session.canAccessHistory = dbUser.can_access_history !== false;
  session.canAccessTickets = dbUser.can_access_tickets !== false;
  session.canAccessModifications = Boolean(dbUser.can_access_modifications);
  session.canAccessSituation = Boolean(dbUser.can_access_situation);
  session.canAccessUsers = Boolean(dbUser.can_access_users);
  session.canDeleteQuote = Boolean(dbUser.can_delete_quote);
  session.canAddActivity = Boolean(dbUser.can_add_activity);
  session.canEditActivity = Boolean(dbUser.can_edit_activity);
  session.canDeleteActivity = Boolean(dbUser.can_delete_activity);
  session.canResetData = Boolean(dbUser.can_reset_data);
  return session;
}

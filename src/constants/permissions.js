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
  can_access_devis: "canAccessDevis",
  can_access_activities: "canAccessActivities",
  can_access_planning: "canAccessPlanning",
  can_access_catalog_admin: "canAccessCatalogAdmin",
  can_access_history: "canAccessHistory",
  can_access_tickets: "canAccessTickets",
  can_access_data_entry: "canAccessDataEntry",
  can_access_receipt: "canAccessReceipt",
  can_access_b2b: "canAccessB2b",
  can_access_events: "canAccessEvents",
  can_access_public_devis: "canAccessPublicDevis",
  can_access_hotel_history: "canAccessHotelHistory",
  can_access_modifications: "canAccessModifications",
  can_access_void_tickets: "canAccessVoidTickets",
  can_access_modif_demandes: "canAccessModifDemandes",
  can_access_situation: "canAccessSituation",
  can_access_stop_sale: "canAccessStopSale",
  can_access_users: "canAccessUsers",
  can_access_hotels: "canAccessHotels",
  can_access_interns: "canAccessInterns",
  can_access_stay_broadcast: "canAccessStayBroadcast",
  can_access_flyer: "canAccessFlyer",
  can_access_documents: "canAccessDocuments",
  can_access_ewen_dashboard: "canAccessEwenDashboard",
  can_access_activity_prices: "canAccessActivityPrices",
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
    description:
      "Cochez chaque page du menu. Si une case est décochée, l’utilisateur ne la voit pas et ne peut pas y accéder. Il devra se reconnecter après enregistrement.",
    permissions: [
      { formKey: "canAccessDevis", label: "Devis", defaultValue: true },
      { formKey: "canAccessActivities", label: "Activités", defaultValue: true },
      { formKey: "canAccessPlanning", label: "Planning", defaultValue: true },
      { formKey: "canAccessCatalogAdmin", label: "Catalogue admin", defaultValue: false },
      { formKey: "canAccessHistory", label: "Historique", defaultValue: true },
      {
        formKey: "canAccessTickets",
        label: "Situation (tickets)",
        description: "Liste des tickets / situation commerciale",
        defaultValue: true,
      },
      { formKey: "canAccessDataEntry", label: "Data entry", defaultValue: false },
      { formKey: "canAccessReceipt", label: "Receipt", defaultValue: false },
      { formKey: "canAccessB2b", label: "Accès B2B + Devis B2B", defaultValue: false },
      { formKey: "canAccessEvents", label: "Événementiel", defaultValue: false },
      { formKey: "canAccessPublicDevis", label: "Devis web / demandes publiques", defaultValue: false },
      { formKey: "canAccessHotelHistory", label: "Hotel history", defaultValue: false },
      { formKey: "canAccessModifications", label: "Modifications tickets", defaultValue: false },
      { formKey: "canAccessVoidTickets", label: "N° annulés", defaultValue: false },
      { formKey: "canAccessModifDemandes", label: "Demandes modif", defaultValue: false },
      {
        formKey: "canAccessSituation",
        label: "Transferts",
        description: "Situation du jour / transferts",
        defaultValue: false,
      },
      { formKey: "canAccessStopSale", label: "Stop & Push", defaultValue: false },
      { formKey: "canAccessUsers", label: "Utilisateurs", defaultValue: false },
      {
        formKey: "canAccessHotels",
        label: "Hôtels + catalogue + tarifs",
        defaultValue: false,
      },
      { formKey: "canAccessInterns", label: "Appartement / stagiaires", defaultValue: false },
      { formKey: "canAccessStayBroadcast", label: "Message séjour", defaultValue: false },
      { formKey: "canAccessFlyer", label: "Flyer appli", defaultValue: false },
      { formKey: "canAccessDocuments", label: "Documents", defaultValue: true },
      { formKey: "canAccessEwenDashboard", label: "Tableau de bord Ewen", defaultValue: false },
      {
        formKey: "canAccessActivityPrices",
        label: "Maj prix (dans Activités)",
        defaultValue: false,
      },
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
    description: "Actions sensibles (en plus de la page Utilisateurs).",
    permissions: [
      { formKey: "canResetData", label: "Réinitialiser les données", defaultValue: false },
    ],
  },
];

/** Pages à opt-out : true sauf si explicitement false en base */
const ACCESS_DEFAULT_TRUE = new Set([
  "canAccessDevis",
  "canAccessActivities",
  "canAccessPlanning",
  "canAccessHistory",
  "canAccessTickets",
  "canAccessDocuments",
]);

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

/** Normalise un prénom intranet (casse / accents). */
export function normalizeIntranetUserName(name) {
  return String(name ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Accès « équipe cœur » (écritures Auth users/activités, etc.)
 * Ne force plus toutes les pages : les cases cochées en base font foi.
 */
export function hasFullIntranetAccess(user) {
  const n = normalizeIntranetUserName(user?.name);
  return n === "ewen" || n === "lea" || n === "sophia" || n === "karim";
}

function readAccessFlag(user, formKey) {
  if (!user) return false;
  const value = user[formKey];
  if (ACCESS_DEFAULT_TRUE.has(formKey)) {
    return value !== false;
  }
  return value === true;
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
    if (!(dbKey in dbUser)) {
      // Colonne absente du SELECT / schéma : garder le défaut formulaire
      return;
    }
    const value = dbUser[dbKey];
    if (ACCESS_DEFAULT_TRUE.has(formKey)) {
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

/** Accès page Hôtels (menu + contenu). */
export function canAccessHotelsPage(user) {
  return readAccessFlag(user, "canAccessHotels");
}

/** Accès page Historique hôtel. */
export function canAccessHotelHistoryPage(user) {
  return readAccessFlag(user, "canAccessHotelHistory");
}

/** Modifier / supprimer une ligne ticket (page Tickets) — Ewen, Karim et Léa. */
export function canManageTicketLines(user) {
  const n = normalizeIntranetUserName(user?.name);
  return n === "ewen" || n === "karim" || n === "lea";
}

/** Modifier les n° de ticket auto-attribués au paiement — Ewen et Karim uniquement. */
export function canEditAutoAssignedTicketNumbers(user) {
  const n = normalizeIntranetUserName(user?.name);
  return n === "ewen" || n === "karim";
}

/** Annuler définitivement un numéro — droit page N° annulés. */
export function canVoidTicketNumbers(user) {
  return readAccessFlag(user, "canAccessVoidTickets");
}

/** Page Stagiaires. */
export function canAccessInternsPage(user) {
  return readAccessFlag(user, "canAccessInterns");
}

/** Message push séjour. */
export function canSendStayBroadcast(user) {
  return readAccessFlag(user, "canAccessStayBroadcast");
}

/** Flyer appli. */
export function canManageClientFlyer(user) {
  return readAccessFlag(user, "canAccessFlyer");
}

/** Supprimer une demande / devis hôtel (historique) — Ewen et Karim uniquement. */
export function canDeleteHotelRequest(user) {
  const n = normalizeIntranetUserName(user?.name);
  return n === "ewen" || n === "karim";
}

/** Suivi encaissements cash / Stripe — Ewen et Karim uniquement. */
export function canViewTicketCollections(user) {
  const n = normalizeIntranetUserName(user?.name);
  return n === "ewen" || n === "karim";
}

/** Page Receipt. */
export function canAccessReceiptPage(user) {
  return readAccessFlag(user, "canAccessReceipt");
}

/** Page Événementiel. */
export function canAccessEventsPage(user) {
  return readAccessFlag(user, "canAccessEvents");
}

/** Page Data entry. */
export function canAccessDataEntryPage(user) {
  return readAccessFlag(user, "canAccessDataEntry");
}

export function canAccessDevisPage(user) {
  return readAccessFlag(user, "canAccessDevis");
}

export function canAccessPlanningPage(user) {
  return readAccessFlag(user, "canAccessPlanning");
}

export function canAccessCatalogAdminPage(user) {
  return readAccessFlag(user, "canAccessCatalogAdmin") || user?.canEditActivity === true;
}

export function canAccessB2bPages(user) {
  return readAccessFlag(user, "canAccessB2b");
}

export function canAccessPublicDevisPage(user) {
  return readAccessFlag(user, "canAccessPublicDevis");
}

export function canAccessModifDemandesPage(user) {
  return readAccessFlag(user, "canAccessModifDemandes");
}

export function canAccessStopSalePage(user) {
  return readAccessFlag(user, "canAccessStopSale");
}

export function canAccessDocumentsPage(user) {
  return readAccessFlag(user, "canAccessDocuments");
}

export function canAccessEwenDashboardPage(user) {
  return readAccessFlag(user, "canAccessEwenDashboard");
}

export function canAccessTicketsPage(user) {
  return readAccessFlag(user, "canAccessTickets");
}

export function canAccessTransfersPage(user) {
  return readAccessFlag(user, "canAccessSituation");
}

export function canAccessUsersPage(user) {
  return readAccessFlag(user, "canAccessUsers") || user?.canResetData === true || hasFullIntranetAccess(user);
}

/**
 * Construit l’objet utilisateur pour la session (camelCase) à partir des données Supabase
 */
export function dbUserToSessionUser(dbUser) {
  if (!dbUser) return null;
  const session = {
    id: dbUser.id,
    name: dbUser.name,
    code: dbUser.code,
    intranet_auth_email:
      dbUser.intranet_auth_email != null && String(dbUser.intranet_auth_email).trim() !== ""
        ? String(dbUser.intranet_auth_email).trim()
        : null,
    ...getDefaultPermissionForm(),
  };

  Object.entries(PERMISSION_DB_TO_FORM).forEach(([dbKey, formKey]) => {
    if (!(dbKey in dbUser)) return;
    const value = dbUser[dbKey];
    if (ACCESS_DEFAULT_TRUE.has(formKey)) {
      session[formKey] = value !== false;
    } else {
      session[formKey] = Boolean(value);
    }
  });

  return session;
}

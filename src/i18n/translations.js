import { publicUiEn, publicUiFr } from "./publicUi";

// Traductions français/anglais
export const translations = {
  fr: {
    // Navigation
    "nav.devis": "Devis manuels",
    "nav.activities": "Activités",
    "nav.planning": "Planning",
    "nav.catalogAdmin": "Catalogue public",
    "nav.history": "Tous les devis",
    "nav.tickets": "Situation",
    "nav.publicDevis": "Demandes de devis",
    "nav.hotelHistory": "Historique hôtel",
    "nav.modifications": "Modifications",
    "nav.situation": "Transferts",
    "nav.users": "Utilisateurs",
    "nav.documents": "Liens utiles",
    "nav.ewenDashboard": "Tableau de bord",

    // Header
    "header.title": "Hurghada Dream — Bureaux",
    "header.subtitle": "Mini site interne (devis, activités, historique)",
    "header.connected": "Connecté",
    
    // Boutons généraux
    "btn.create": "Créer",
    "btn.edit": "Modifier",
    "btn.save": "Enregistrer",
    "btn.delete": "Supprimer",
    "btn.cancel": "Annuler",
    "btn.confirm": "Confirmer",
    "btn.loading": "Enregistrement...",
    "btn.add": "Ajouter",
    "btn.reset": "Réinitialiser",
    
    // Pages
    "page.devis.title": "Créer & gérer les devis (multi-activités)",
    "page.devis.subtitle": "Supplément transfert = (par adulte/enfant) × (nombre d'adultes + enfants). Bébés gratuits. Alerte si jour hors-dispo, mais le devis peut être créé.",
    "page.activities.title": "Gestion des activités",
    "page.activities.subtitle": "Ajoutez, modifiez les prix, jours, transferts par quartier.",
    "page.planning.title": "Planning des activités",
    "page.planning.subtitle": "Vue semaine : quelles activités sont ouvertes chaque jour (selon les jours cochés).",
    "page.catalogAdmin.title": "Contenu catalogue (public)",
    "page.catalogAdmin.subtitle": "Texte affiché sur la fiche activité et URLs des photos (HTTPS). Réservé aux comptes autorisés à modifier les activités.",
    "page.history.title": "Tous les devis",
    "page.history.subtitle": "Recherchez un devis par numéro de téléphone.",
    "page.tickets.title": "Situation",
    "page.tickets.subtitle": "Vue compacte — toutes les colonnes visibles. Copie directe vers Excel.",
    "page.publicDevis.title": "Demandes de devis",
    "page.publicDevis.subtitle": "Demandes envoyées depuis le catalogue public (pas les devis intranet).",
    "page.hotelHistory.title": "Historique hôtel",
    "page.hotelHistory.subtitle": "Demandes reçues via le formulaire public (coordonnées, hôtels, budget).",
    "page.modifications.title": "Modifications",
    "page.modifications.subtitle": "Saisissez un numéro de ticket pour modifier ou annuler. La liste du bas montre l’historique.",
    "page.users.title": "Gestion des utilisateurs",
    "page.users.subtitle": "Créez et gérez les utilisateurs avec leurs codes d'accès et permissions.",
    "page.documents.title": "Liens utiles",
    "page.documents.subtitle": "Liens, fichiers et notes partagés.",
    "page.ewenDashboard.title": "Tableau de bord (Ewen)",
    "page.ewenDashboard.subtitle": "Indicateurs internes et présence en temps réel.",

    // QuotesPage
    "quotes.client": "Client",
    "quotes.phone": "Téléphone",
    "quotes.hotel": "Hôtel",
    "quotes.room": "Chambre",
    "quotes.neighborhood": "Quartier (client)",
    "quotes.choose": "— Choisir —",
    "quotes.activity": "Activité",
    "quotes.date": "Date",
    "quotes.adults": "Adultes",
    "quotes.children": "Enfants",
    "quotes.babies": "Bébés",
    "quotes.extra": "Extra (ex: photos, bateau privé…)",
    "quotes.extraAmount": "Montant Extra",
    "quotes.subtotal": "Sous-total",
    "quotes.total": "Total",
    "quotes.cash": "Espèces",
    "quotes.card": "Carte",
    "quotes.notes": "Notes",
    "quotes.notesPlaceholder": "Infos supplémentaires : langue du guide, pick-up, etc.",
    "quotes.addActivity": "Ajouter une autre activité",
    "quotes.createQuote": "Créer le devis",
    
    // Messages
    "msg.success.create": "Devis créé avec succès ! Formulaire réinitialisé.",
    "msg.warning.maxPeople": "Attention : Maximum {count} personnes",
    
    // Activités spéciales
    "activity.oneWay": "Aller simple",
    "activity.roundTrip": "Aller retour",
  },
  
  en: {
    // Navigation
    "nav.devis": "Manual quotes",
    "nav.activities": "Activities",
    "nav.planning": "Schedule",
    "nav.catalogAdmin": "Public catalogue",
    "nav.history": "All quotes",
    "nav.tickets": "Situation",
    "nav.publicDevis": "Quote requests",
    "nav.hotelHistory": "Hotel history",
    "nav.modifications": "Modifications",
    "nav.situation": "Transfers",
    "nav.users": "Users",
    "nav.documents": "Useful links",
    "nav.ewenDashboard": "Dashboard",

    // Header
    "header.title": "Hurghada Dream — Offices",
    "header.subtitle": "Internal mini site (quotes, activities, history)",
    "header.connected": "Connected",
    
    // Boutons généraux
    "btn.create": "Create",
    "btn.edit": "Edit",
    "btn.save": "Save",
    "btn.delete": "Delete",
    "btn.cancel": "Cancel",
    "btn.confirm": "Confirm",
    "btn.loading": "Saving...",
    "btn.add": "Add",
    "btn.reset": "Reset",
    
    // Pages
    "page.devis.title": "Create & manage quotes (multi-activities)",
    "page.devis.subtitle": "Transfer surcharge = (per adult/child) × (number of adults + children). Babies free. Alert if day unavailable, but quote can be created.",
    "page.activities.title": "Activities management",
    "page.activities.subtitle": "Add, edit prices, days, transfers by neighborhood.",
    "page.planning.title": "Activities schedule",
    "page.planning.subtitle": "Week view: which activities are open each day (from checked weekdays).",
    "page.catalogAdmin.title": "Public catalogue content",
    "page.catalogAdmin.subtitle": "Text shown on the public activity page and photo URLs (HTTPS). For accounts allowed to edit activities only.",
    "page.history.title": "All quotes",
    "page.history.subtitle": "Search for a quote by phone number.",
    "page.tickets.title": "Situation",
    "page.tickets.subtitle": "Compact view — all columns visible. Direct copy to Excel.",
    "page.publicDevis.title": "Quote requests",
    "page.publicDevis.subtitle": "Requests sent from the public catalogue (not intranet quotes).",
    "page.hotelHistory.title": "Hotel history",
    "page.hotelHistory.subtitle": "Requests from the public form (contact details, hotels, budget).",
    "page.modifications.title": "Modifications",
    "page.modifications.subtitle": "Enter a ticket number to edit or cancel. The list below shows the history.",
    "page.users.title": "Users management",
    "page.users.subtitle": "Create and manage users with their access codes and permissions.",
    "page.documents.title": "Useful links",
    "page.documents.subtitle": "Shared links, files and notes.",
    "page.ewenDashboard.title": "Dashboard (Ewen)",
    "page.ewenDashboard.subtitle": "Internal indicators and live presence.",

    // QuotesPage
    "quotes.client": "Client",
    "quotes.phone": "Phone",
    "quotes.hotel": "Hotel",
    "quotes.room": "Room",
    "quotes.neighborhood": "Neighborhood (client)",
    "quotes.choose": "— Choose —",
    "quotes.activity": "Activity",
    "quotes.date": "Date",
    "quotes.adults": "Adults",
    "quotes.children": "Children",
    "quotes.babies": "Babies",
    "quotes.extra": "Extra (e.g.: photos, private boat…)",
    "quotes.extraAmount": "Extra Amount",
    "quotes.subtotal": "Subtotal",
    "quotes.total": "Total",
    "quotes.cash": "Cash",
    "quotes.card": "Card",
    "quotes.notes": "Notes",
    "quotes.notesPlaceholder": "Additional info: guide language, pick-up, etc.",
    "quotes.addActivity": "Add another activity",
    "quotes.createQuote": "Create quote",
    
    // Messages
    "msg.success.create": "Quote created successfully! Form reset.",
    "msg.warning.maxPeople": "Warning: Maximum {count} people",
    
    // Activités spéciales
    "activity.oneWay": "One way",
    "activity.roundTrip": "Round trip",

    // Site public
    "public.menu": "Menu",
    "public.menuOpen": "Open menu",
    "public.navAria": "Pages",
    "public.agencies": "Agencies",
    "public.legalAria": "Legal",
    "public.home": "Home",
    "public.nav.modification": "Change / cancel",
    "public.nav.excursions": "Excursions",
    "public.nav.hotels": "Hotels",
    "public.nav.stay": "My stay",
    "public.nav.events": "Events",
    "public.nav.contacts": "Contacts",
    "public.nav.about": "About us",
    "public.nav.refund": "Refunds",
    "public.nav.privacy": "Privacy",
    "public.nav.b2b": "Agency area",
    "public.nav.b2bLogin": "B2B login",
    "public.nav.b2bRequest": "Request B2B access",
    "public.footer.rights": "© {year} Hurghada Dream. All rights reserved.",
    "public.home.helloMorning": "Good morning",
    "public.home.helloEvening": "Good evening",
    "public.home.welcome": "welcome",
    "public.home.heroTitleEnd": "to the Red Sea.",
    "public.home.heroTitleBefore": "Hurghada's",
    "public.home.heroTitleAccent": "#1",
    "public.home.heroTitleAfter": "activities agency",
    "public.home.heroSub":
      "Exceptional hotels, private excursions and your stay orchestrated by the local reference.",
    "public.home.eyebrow": "7,972 verified reviews",
    "public.home.rating": "4.9",
    "public.home.weather": "Weather",
    "public.home.hotelsSelected": "{count} selected hotels",
    "public.home.hotelsSelectedFallback": "Selected hotels",
    "public.home.frenchTeam": "French-speaking team 7 days a week",
    "public.home.tileExcursions": "Excursions",
    "public.home.tileExcursionsSub": "Sea, desert, Luxor",
    "public.home.tileHotels": "Hotels",
    "public.home.tileHotelsSub": "All inclusive, seaside",
    "public.home.stayCodeLabel": "Reservation number",
    "public.home.stayCodeError": "Example: HU-10042",
    "public.home.stayCodeView": "View",
    "public.home.navigation": "Navigation",
  },
};

// Injecter les clés publiques FR (miroir) — définies ci-dessous pour rester groupées.
Object.assign(translations.fr, {
  "public.menu": "Menu",
  "public.menuOpen": "Ouvrir le menu",
  "public.navAria": "Pages",
  "public.agencies": "Agences",
  "public.legalAria": "Mentions légales",
  "public.home": "Accueil",
  "public.nav.modification": "Modification / annulation",
  "public.nav.excursions": "Excursions",
  "public.nav.hotels": "Hôtels",
  "public.nav.stay": "Mon séjour",
  "public.nav.events": "Événements",
  "public.nav.contacts": "Contacts",
  "public.nav.about": "Qui sommes-nous",
  "public.nav.refund": "Remboursement",
  "public.nav.privacy": "Confidentialité",
  "public.nav.b2b": "Espace agences",
  "public.nav.b2bLogin": "Connexion B2B",
  "public.nav.b2bRequest": "Demander un accès B2B",
  "public.footer.rights": "© {year} Hurghada Dream. Tous droits réservés.",
  "public.home.helloMorning": "Bonjour",
  "public.home.helloEvening": "Bonsoir",
  "public.home.welcome": "bienvenue",
  "public.home.heroTitleEnd": "en mer Rouge.",
  "public.home.heroTitleBefore": "Agence",
  "public.home.heroTitleAccent": "n°1",
  "public.home.heroTitleAfter": "des activités à Hurghada",
  "public.home.heroSub":
    "Hôtels d’exception, excursions privées et votre séjour orchestré par la référence locale.",
  "public.home.eyebrow": "7 972 avis vérifiés",
  "public.home.rating": "4,9",
  "public.home.weather": "Météo",
  "public.home.hotelsSelected": "{count} hôtels sélectionnés",
  "public.home.hotelsSelectedFallback": "Hôtels sélectionnés",
  "public.home.frenchTeam": "Équipe française 7j/7",
  "public.home.tileExcursions": "Excursions",
  "public.home.tileExcursionsSub": "Mer, désert, Louxor",
  "public.home.tileHotels": "Hôtels",
  "public.home.tileHotelsSub": "All inclusive, en bord de mer",
  "public.home.stayCodeLabel": "Numéro de réservation",
  "public.home.stayCodeError": "Exemple : HU-10042",
  "public.home.stayCodeView": "Voir",
  "public.home.navigation": "Navigation",
  ...publicUiFr,
});

Object.assign(translations.en, {
  ...publicUiEn,
});

/** Locale BCP 47 pour dates / montants côté site client. */
export function publicLocale(language = "fr") {
  return language === "en" ? "en-GB" : "fr-FR";
}

// Fonction helper pour traduire avec support des variables
export function t(key, language = "fr", variables = {}) {
  const translation = translations[language]?.[key] || translations.fr[key] || key;
  
  // Remplacer les variables {variable}
  return translation.replace(/\{(\w+)\}/g, (match, varName) => {
    return variables[varName] !== undefined ? String(variables[varName]) : match;
  });
}


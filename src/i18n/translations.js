// Traductions français/anglais
export const translations = {
  fr: {
    // Navigation
    "nav.devis": "Devis",
    "nav.activities": "Activités",
    "nav.history": "Historique",
    "nav.tickets": "Tickets",
    "nav.modifications": "Modifications",
    "nav.situation": "Situation",
    "nav.users": "Utilisateurs",
    
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
    "page.devis.subtitle": "Supplément transfert = (par adulte) × (nombre d'adultes). Alerte si jour hors-dispo, mais le devis peut être créé.",
    "page.activities.title": "Gestion des activités",
    "page.activities.subtitle": "Ajoutez, modifiez les prix, jours, transferts par quartier.",
    "page.history.title": "Historique des devis",
    "page.history.subtitle": "Recherchez un devis par numéro de téléphone.",
    "page.tickets.title": "Liste des tickets",
    "page.tickets.subtitle": "Tableau automatique de tous les tickets renseignés (devis avec tous les tickets complétés)",
    "page.modifications.title": "Modifications & Annulations",
    "page.modifications.subtitle": "Gérez les modifications et annulations pour les devis payés uniquement.",
    "page.users.title": "Gestion des utilisateurs",
    "page.users.subtitle": "Créez et gérez les utilisateurs avec leurs codes d'accès et permissions.",
    
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
    "nav.devis": "Quotes",
    "nav.activities": "Activities",
    "nav.history": "History",
    "nav.tickets": "Tickets",
    "nav.modifications": "Modifications",
    "nav.situation": "Situation",
    "nav.users": "Users",
    
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
    "page.devis.subtitle": "Transfer surcharge = (per adult) × (number of adults). Alert if day unavailable, but quote can be created.",
    "page.activities.title": "Activities management",
    "page.activities.subtitle": "Add, edit prices, days, transfers by neighborhood.",
    "page.history.title": "Quotes history",
    "page.history.subtitle": "Search for a quote by phone number.",
    "page.tickets.title": "Tickets list",
    "page.tickets.subtitle": "Automatic table of all tickets filled (quotes with all tickets completed)",
    "page.modifications.title": "Modifications & Cancellations",
    "page.modifications.subtitle": "Manage modifications and cancellations for paid quotes only.",
    "page.users.title": "Users management",
    "page.users.subtitle": "Create and manage users with their access codes and permissions.",
    
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
  },
};

// Fonction helper pour traduire avec support des variables
export function t(key, language = "fr", variables = {}) {
  const translation = translations[language]?.[key] || translations.fr[key] || key;
  
  // Remplacer les variables {variable}
  return translation.replace(/\{(\w+)\}/g, (match, varName) => {
    return variables[varName] !== undefined ? String(variables[varName]) : match;
  });
}


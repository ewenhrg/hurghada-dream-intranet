import { lazyWithRetry } from "../utils/lazyWithRetry";

/** Page Transferts : situation du lendemain et envoi groupé des heures. */
export const SITUATION_PAGE_STANDBY = false;

export const ActivitiesPage = lazyWithRetry(() =>
  import("../pages/ActivitiesPage").then((module) => ({ default: module.ActivitiesPage }))
);
export const PlanningPage = lazyWithRetry(() =>
  import("../pages/PlanningPage").then((module) => ({ default: module.PlanningPage }))
);
export const ActivityCatalogAdminPage = lazyWithRetry(() =>
  import("../pages/ActivityCatalogAdminPage").then((module) => ({ default: module.ActivityCatalogAdminPage }))
);
export const QuotesPage = lazyWithRetry(() =>
  import("../pages/QuotesPage").then((module) => ({ default: module.QuotesPage }))
);
export const HistoryPage = lazyWithRetry(() =>
  import("../pages/HistoryPage").then((module) => ({ default: module.HistoryPage }))
);
export const TicketsPage = lazyWithRetry(() =>
  import("../pages/TicketsPage").then((module) => ({ default: module.TicketsPage }))
);
export const ReceiptPage = lazyWithRetry(() =>
  import("../pages/ReceiptPage").then((module) => ({ default: module.ReceiptPage }))
);
export const UsersPage = lazyWithRetry(() =>
  import("../pages/UsersPage").then((module) => ({ default: module.UsersPage }))
);
export const HotelsPage = lazyWithRetry(() =>
  import("../pages/HotelsPage").then((module) => ({ default: module.HotelsPage }))
);
export const ModificationsPage = lazyWithRetry(() =>
  import("../pages/TicketModificationPage").then((module) => ({ default: module.TicketModificationPage }))
);
export const SituationPage = lazyWithRetry(() =>
  import("../pages/TransferDayPage").then((module) => ({ default: module.TransferDayPage }))
);
export const StopSalePage = lazyWithRetry(() =>
  import("../pages/StopSalePage").then((module) => ({ default: module.StopSalePage }))
);
export const DocumentsPage = lazyWithRetry(() =>
  import("../pages/DocumentsPage").then((module) => ({ default: module.DocumentsPage }))
);
export const InternsPage = lazyWithRetry(() =>
  import("../pages/InternsPage").then((module) => ({ default: module.InternsPage }))
);
export const StayBroadcastPage = lazyWithRetry(() =>
  import("../pages/StayBroadcastPage").then((module) => ({ default: module.StayBroadcastPage }))
);
export const ClientFlyerPage = lazyWithRetry(() =>
  import("../pages/ClientFlyerPage").then((module) => ({ default: module.ClientFlyerPage }))
);
export {
  RequestPage,
  PublicTarifsPage,
  PublicClientDevisPage,
  PublicStayPage,
  PublicCatalogueActivityPage,
  PublicHotelRequestPage,
  PublicHotelsCataloguePage,
  PublicHotelDetailPage,
} from "./lazyPublicPages";
export const EwenDashboardPage = lazyWithRetry(() =>
  import("../pages/EwenDashboardPage").then((module) => ({ default: module.EwenDashboardPage }))
);
export const PublicDevisPage = lazyWithRetry(() =>
  import("../pages/PublicDevisPage").then((m) => ({ default: m.PublicDevisPage }))
);
export const EventsInboxPage = lazyWithRetry(() =>
  import("../pages/EventsInboxPage").then((m) => ({ default: m.EventsInboxPage }))
);
export const ModificationRequestsPage = lazyWithRetry(() =>
  import("../pages/ModificationRequestsPage").then((m) => ({ default: m.ModificationRequestsPage }))
);
export const VoidTicketNumbersPage = lazyWithRetry(() =>
  import("../pages/VoidTicketNumbersPage").then((m) => ({ default: m.VoidTicketNumbersPage }))
);
export const B2BAccessPage = lazyWithRetry(() =>
  import("../pages/B2BAccessPage").then((m) => ({ default: m.B2BAccessPage }))
);
export const B2BQuotesPage = lazyWithRetry(() =>
  import("../pages/B2BQuotesPage").then((m) => ({ default: m.B2BQuotesPage }))
);
export const PublicHotelsAdminPage = lazyWithRetry(() =>
  import("../pages/PublicHotelsAdminPage").then((m) => ({ default: m.PublicHotelsAdminPage }))
);
export const HotelHistoryPage = lazyWithRetry(() =>
  import("../pages/HotelHistoryPage").then((m) => ({ default: m.HotelHistoryPage }))
);

export const HotelTarifsPage = lazyWithRetry(() =>
  import("../pages/HotelTarifsPage").then((m) => ({ default: m.HotelTarifsPage }))
);

const PREFETCH_BY_TAB = {
  devis: () => import("../pages/QuotesPage"),
  activities: () => import("../pages/ActivitiesPage"),
  planning: () => import("../pages/PlanningPage"),
  "catalog-admin": () => import("../pages/ActivityCatalogAdminPage"),
  history: () => import("../pages/HistoryPage"),
  tickets: () => import("../pages/TicketsPage"),
  "data-entry": () => import("../pages/TicketsPage"),
  receipt: () => import("../pages/ReceiptPage"),
  users: () => import("../pages/UsersPage"),
  hotels: () => import("../pages/HotelsPage"),
  modifications: () => import("../pages/TicketModificationPage"),
  situation: () => import("../pages/TransferDayPage"),
  stopsale: () => import("../pages/StopSalePage"),
  documents: () => import("../pages/DocumentsPage"),
  appartements: () => import("../pages/InternsPage"),
  "message-sejour": () => import("../pages/StayBroadcastPage"),
  "flyer-appli": () => import("../pages/ClientFlyerPage"),
  "ewen-dashboard": () => import("../pages/EwenDashboardPage"),
  "public-devis": () => import("../pages/PublicDevisPage"),
  events: () => import("../pages/EventsInboxPage"),
  "modif-demandes": () => import("../pages/ModificationRequestsPage"),
  "void-tickets": () => import("../pages/VoidTicketNumbersPage"),
  "b2b-access": () => import("../pages/B2BAccessPage"),
  "b2b-quotes": () => import("../pages/B2BQuotesPage"),
  "hotels-catalog": () => import("../pages/PublicHotelsAdminPage"),
  "historique-hotel": () => import("../pages/HotelHistoryPage"),
  "hotel-tarifs": () => import("../pages/HotelTarifsPage"),
};

const prefetchedTabs = new Set();

/** Charge le fichier de la page au survol, pour que le clic s’affiche tout de suite. */
export function prefetchIntranetTab(tab) {
  const load = PREFETCH_BY_TAB[tab];
  if (!load || prefetchedTabs.has(tab)) return;
  prefetchedTabs.add(tab);
  load().catch(() => {
    prefetchedTabs.delete(tab);
  });
}

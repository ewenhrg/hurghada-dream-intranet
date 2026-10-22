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

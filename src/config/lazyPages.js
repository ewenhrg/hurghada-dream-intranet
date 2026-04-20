import { lazyWithRetry } from "../utils/lazyWithRetry";

/** Page Situation en standby : remettre à false pour réafficher dans le menu et le contenu */
export const SITUATION_PAGE_STANDBY = true;

export const ActivitiesPage = lazyWithRetry(() =>
  import("../pages/ActivitiesPage").then((module) => ({ default: module.ActivitiesPage }))
);
export const ActivityUpdatePage = lazyWithRetry(() =>
  import("../pages/ActivityUpdatePage").then((module) => ({ default: module.ActivityUpdatePage }))
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
export const UsersPage = lazyWithRetry(() =>
  import("../pages/UsersPage").then((module) => ({ default: module.UsersPage }))
);
export const HotelsPage = lazyWithRetry(() =>
  import("../pages/HotelsPage").then((module) => ({ default: module.HotelsPage }))
);
export const TicketPage = lazyWithRetry(() =>
  import("../pages/TicketPage").then((module) => ({ default: module.TicketPage }))
);
// Page Modifications désactivée temporairement
// export const ModificationsPage = lazyWithRetry(() =>
//   import("../pages/ModificationsPage").then((module) => ({ default: module.ModificationsPage }))
// );
export const SituationPage = lazyWithRetry(() =>
  import("../pages/SituationPage").then((module) => ({ default: module.SituationPage }))
);
export const StopSalePage = lazyWithRetry(() =>
  import("../pages/StopSalePage").then((module) => ({ default: module.StopSalePage }))
);
export const DocumentsPage = lazyWithRetry(() =>
  import("../pages/DocumentsPage").then((module) => ({ default: module.DocumentsPage }))
);
export const RequestPage = lazyWithRetry(() =>
  import("../pages/RequestPage").then((module) => ({ default: module.RequestPage }))
);
export const PublicTarifsPage = lazyWithRetry(() =>
  import("../pages/PublicTarifsPage").then((m) => ({ default: m.PublicTarifsPage }))
);
export const PublicClientDevisPage = lazyWithRetry(() =>
  import("../pages/PublicClientDevisPage").then((m) => ({ default: m.PublicClientDevisPage }))
);
export const PublicCatalogueActivityPage = lazyWithRetry(() =>
  import("../pages/PublicCatalogueActivityPage").then((m) => ({ default: m.PublicCatalogueActivityPage }))
);
export const EwenDashboardPage = lazyWithRetry(() =>
  import("../pages/EwenDashboardPage").then((module) => ({ default: module.EwenDashboardPage }))
);
export const PublicDevisPage = lazyWithRetry(() =>
  import("../pages/PublicDevisPage").then((m) => ({ default: m.PublicDevisPage }))
);

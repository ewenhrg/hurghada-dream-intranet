import { lazyWithRetry } from "../utils/lazyWithRetry";

export const RequestPage = lazyWithRetry(() =>
  import("../pages/RequestPage").then((module) => ({ default: module.RequestPage }))
);
export const PublicTarifsPage = lazyWithRetry(() =>
  import("../pages/PublicTarifsPage").then((m) => ({ default: m.PublicTarifsPage }))
);
export const PublicClientDevisPage = lazyWithRetry(() =>
  import("../pages/PublicClientDevisPage").then((m) => ({ default: m.PublicClientDevisPage }))
);
export const PublicStayPage = lazyWithRetry(() =>
  import("../pages/PublicStayPage").then((m) => ({ default: m.PublicStayPage }))
);
export const PublicHomePage = lazyWithRetry(() =>
  import("../pages/PublicHomePage").then((m) => ({ default: m.PublicHomePage }))
);
export const PublicContactsPage = lazyWithRetry(() =>
  import("../pages/PublicContactsPage").then((m) => ({ default: m.PublicContactsPage }))
);
export const PublicCatalogueActivityPage = lazyWithRetry(() =>
  import("../pages/PublicCatalogueActivityPage").then((m) => ({ default: m.PublicCatalogueActivityPage }))
);
export const PublicHotelRequestPage = lazyWithRetry(() =>
  import("../pages/PublicHotelRequestPage").then((m) => ({ default: m.PublicHotelRequestPage }))
);
export const PublicHotelsCataloguePage = lazyWithRetry(() =>
  import("../pages/PublicHotelsCataloguePage").then((m) => ({ default: m.PublicHotelsCataloguePage }))
);
export const PublicHotelDetailPage = lazyWithRetry(() =>
  import("../pages/PublicHotelDetailPage").then((m) => ({ default: m.PublicHotelDetailPage }))
);

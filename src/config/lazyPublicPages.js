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
export const PublicPolicyPage = lazyWithRetry(() =>
  import("../pages/PublicPolicyPage").then((m) => ({ default: m.PublicPolicyPage }))
);
export const PublicPrivacyPage = lazyWithRetry(() =>
  import("../pages/PublicPrivacyPage").then((m) => ({ default: m.PublicPrivacyPage }))
);
export const PublicAboutPage = lazyWithRetry(() =>
  import("../pages/PublicAboutPage").then((m) => ({ default: m.PublicAboutPage }))
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
export const PublicB2BPage = lazyWithRetry(() =>
  import("../pages/PublicB2BPage").then((m) => ({ default: m.PublicB2BPage }))
);
export const PublicHotelDetailPage = lazyWithRetry(() =>
  import("../pages/PublicHotelDetailPage").then((m) => ({ default: m.PublicHotelDetailPage }))
);

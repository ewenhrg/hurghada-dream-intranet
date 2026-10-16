import { Suspense } from "react";
import { useLocation } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { fetchInstagramReels } from "./components/public/InstagramReelsRail";
import GuestPageLoader from "./components/public/GuestPageLoader";

fetchInstagramReels();
import { isPublicHomePath } from "./config/clientApp";
import {
  RequestPage,
  PublicTarifsPage,
  PublicClientDevisPage,
  PublicStayPage,
  PublicHomePage,
  PublicContactsPage,
  PublicPolicyPage,
  PublicPrivacyPage,
  PublicAboutPage,
  PublicCatalogueActivityPage,
  PublicHotelRequestPage,
  PublicHotelsCataloguePage,
  PublicHotelDetailPage,
  PublicB2BPage,
} from "./config/lazyPublicPages";

function PublicClientPage() {
  const { pathname } = useLocation();

  if (isPublicHomePath(pathname)) {
    return <PublicHomePage />;
  }
  if (pathname === "/contacts" || pathname === "/contacts/") {
    return <PublicContactsPage />;
  }
  if (pathname === "/politique" || pathname === "/politique/") {
    return <PublicPolicyPage />;
  }
  if (pathname === "/confidentialite" || pathname === "/confidentialite/") {
    return <PublicPrivacyPage />;
  }
  if (pathname === "/qui-sommes-nous" || pathname === "/qui-sommes-nous/") {
    return <PublicAboutPage />;
  }
  if (
    pathname === "/sejour" ||
    pathname === "/sejour/" ||
    pathname === "/mon-sejour" ||
    pathname === "/mon-sejour/"
  ) {
    return <PublicStayPage />;
  }
  if (pathname === "/b2b" || pathname === "/b2b/") {
    return <PublicB2BPage />;
  }
  if (pathname === "/tarifs" || pathname === "/tarifs/") {
    return <PublicTarifsPage />;
  }
  const catalogueActivityMatch = pathname.match(/^\/catalogue\/activity\/([^/]+)\/?$/);
  if (catalogueActivityMatch) {
    return (
      <PublicCatalogueActivityPage activityId={decodeURIComponent(catalogueActivityMatch[1])} />
    );
  }
  if (pathname === "/catalogue" || pathname === "/catalogue/") {
    return <PublicClientDevisPage />;
  }
  const hotelDetailMatch = pathname.match(/^\/hotels\/([^/]+)\/?$/);
  if (hotelDetailMatch) {
    return <PublicHotelDetailPage hotelId={decodeURIComponent(hotelDetailMatch[1])} />;
  }
  if (pathname === "/hotels" || pathname === "/hotels/") {
    return <PublicHotelsCataloguePage />;
  }
  if (pathname === "/demande-hotel" || pathname === "/demande-hotel/") {
    return <PublicHotelRequestPage />;
  }
  if (pathname.startsWith("/request")) {
    return <RequestPage />;
  }
  return null;
}

export function PublicClientRoutes() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<GuestPageLoader />}>
        <PublicClientPage />
      </Suspense>
    </ErrorBoundary>
  );
}

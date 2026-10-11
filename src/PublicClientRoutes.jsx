import { Suspense } from "react";
import { useLocation } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import GuestPageLoader from "./components/public/GuestPageLoader";
import { isPublicHomePath } from "./config/clientApp";
import {
  RequestPage,
  PublicTarifsPage,
  PublicClientDevisPage,
  PublicStayPage,
  PublicHomePage,
  PublicContactsPage,
  PublicCatalogueActivityPage,
  PublicHotelRequestPage,
  PublicHotelsCataloguePage,
  PublicHotelDetailPage,
} from "./config/lazyPublicPages";

function PublicClientPage() {
  const { pathname } = useLocation();

  if (isPublicHomePath(pathname)) {
    return <PublicHomePage />;
  }
  if (pathname === "/contacts" || pathname === "/contacts/") {
    return <PublicContactsPage />;
  }
  if (
    pathname === "/sejour" ||
    pathname === "/sejour/" ||
    pathname === "/mon-sejour" ||
    pathname === "/mon-sejour/"
  ) {
    return <PublicStayPage />;
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
  return (
    <ErrorBoundary>
      <Suspense fallback={<GuestPageLoader />}>
        <PublicClientPage />
      </Suspense>
    </ErrorBoundary>
  );
}

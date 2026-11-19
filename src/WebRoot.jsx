import { Suspense, lazy, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { isPublicClientPath } from "./config/clientApp";
import { clearChunkReloadGuard } from "./utils/lazyWithRetry";

const IntranetApp = lazy(() => import("./App.jsx"));
const PublicSite = lazy(() =>
  import("./PublicClientRoutes.jsx").then((module) => ({ default: module.PublicClientRoutes }))
);

/**
 * Site web : une page publique démarre sans le code de l’intranet (~350 Ko de JS en moins,
 * premier affichage bien plus rapide sur connexion lente). Dès que l’intranet a été ouvert
 * dans l’onglet, App reste monté pour toutes les routes (comportement historique :
 * session et état de l’intranet conservés en passant par une page publique).
 */
export function WebRoot() {
  const { pathname } = useLocation();
  const isPublic = isPublicClientPath(pathname);
  const [intranetOpened, setIntranetOpened] = useState(!isPublic);

  useEffect(() => {
    if (!isPublic) setIntranetOpened(true);
  }, [isPublic]);

  // Chargement réussi : le rechargement unique « chunk périmé » redevient possible plus tard.
  useEffect(() => {
    const timer = window.setTimeout(clearChunkReloadGuard, 4000);
    return () => window.clearTimeout(timer);
  }, []);

  return <Suspense fallback={null}>{intranetOpened || !isPublic ? <IntranetApp /> : <PublicSite />}</Suspense>;
}

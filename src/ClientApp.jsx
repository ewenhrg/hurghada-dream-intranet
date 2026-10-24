import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { isPublicClientPath, PUBLIC_HOME_PATH, publicBackPath } from "./config/clientApp";
import { ClientFlyerPopup } from "./components/public/ClientFlyerPopup";
import { PublicClientRoutes } from "./PublicClientRoutes";
import {
  askStayNotificationsOnLaunch,
  listenStayNotificationOpens,
  startStayChangeWatch,
} from "./utils/stayLocalNotifications";

/** Coquille boutique : accueil, séjour, catalogue, hôtels. Aucun écran intranet. */
export function ClientApp() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let cancelled = false;
    let listener;
    App.addListener("backButton", () => {
      const next = publicBackPath(window.location.pathname);
      if (next) {
        navigate(next);
        return;
      }
      App.minimizeApp();
    }).then((handle) => {
      if (cancelled) {
        handle.remove();
        return;
      }
      listener = handle;
    });
    askStayNotificationsOnLaunch();
    startStayChangeWatch();
    const stopNotifications = listenStayNotificationOpens(navigate);
    return () => {
      cancelled = true;
      listener?.remove();
      stopNotifications();
    };
  }, [navigate]);

  if (!isPublicClientPath(pathname)) {
    return <Navigate to={PUBLIC_HOME_PATH} replace />;
  }
  return (
    <>
      <PublicClientRoutes />
      <ClientFlyerPopup />
    </>
  );
}

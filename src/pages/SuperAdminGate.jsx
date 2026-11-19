import { Suspense, useCallback, useEffect, useState } from "react";
import PageLoader from "../components/PageLoader";
import ErrorBoundary from "../components/ErrorBoundary";
import { SuperAdminLoginPage } from "./SuperAdminLoginPage";
import { SuperAdminPage } from "./SuperAdminPage";
import {
  restoreSuperAdminSession,
  signOutSuperAdmin,
} from "../utils/superAdminAuth";

/**
 * Garde d’entrée /superadmin : Auth e-mail + mot de passe uniquement (pas le PIN intranet).
 */
export function SuperAdminGate({ activities, setActivities }) {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [opsUser, setOpsUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await restoreSuperAdminSession();
      if (cancelled) return;
      if (restored.ok) {
        setOpsUser(restored.user);
        setAuthed(true);
      }
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLoginSuccess = useCallback((result) => {
    setOpsUser(result.user);
    setAuthed(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await signOutSuperAdmin();
    setAuthed(false);
    setOpsUser(null);
  }, []);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <PageLoader />
      </div>
    );
  }

  if (!authed || !opsUser) {
    return <SuperAdminLoginPage onSuccess={handleLoginSuccess} />;
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <SuperAdminPage
          user={opsUser}
          activities={activities}
          setActivities={setActivities}
          onLogout={handleLogout}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

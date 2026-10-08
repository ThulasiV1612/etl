import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ensureValidAccessToken, handleAuthSessionExpired } from "./portalFetch";
import { parseSafeNextPath } from "./parseSafeNextPath";
import { AUTH_RETURN_NEXT_KEY, SESSION_BEARER_KEY } from "./sessionKeys";
import { useIdleLogout } from "./useIdleLogout";

function IdleSessionGuard() {
  useIdleLogout();
  return null;
}

function AuthBootstrap() {
  const location = useLocation();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await ensureValidAccessToken();
      if (!cancelled && !ok && sessionStorage.getItem(SESSION_BEARER_KEY)) {
        handleAuthSessionExpired();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.key]);
  return null;
}

/** Wraps routes that require a valid session (JWT in sessionStorage). */
export function RequireAuth() {
  const location = useLocation();
  const token = sessionStorage.getItem(SESSION_BEARER_KEY);
  if (!token) {
    const returnPath = `${location.pathname}${location.search}`;
    const safeNext = parseSafeNextPath(returnPath);
    if (safeNext) {
      sessionStorage.setItem(AUTH_RETURN_NEXT_KEY, safeNext);
      return (
        <Navigate
          to={`/signin?next=${encodeURIComponent(safeNext)}`}
          replace
          state={{ from: safeNext }}
        />
      );
    }
    return <Navigate to="/signin" replace />;
  }
  return (
    <>
      <AuthBootstrap />
      <IdleSessionGuard />
      <Outlet />
    </>
  );
}

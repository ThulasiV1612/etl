/** Inactivity limit before automatic sign-out. */
import { toast } from "../components/Toast/toastStore";

export const IDLE_LOGOUT_MS = 30 * 60 * 1000;

export const SESSION_LAST_ACTIVITY_KEY = "lastActivityAt";

/** Set before redirecting to sign-in after idle logout; triggers session timeout toast. */
export const SESSION_IDLE_TIMEOUT_NOTICE_KEY = "idleSessionTimeoutNotice";

let idleTimeoutToastShownThisLoad = false;

export function markIdleSessionTimeoutNotice(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_IDLE_TIMEOUT_NOTICE_KEY, "1");
}

/** Show session-timeout toast once per full page load (survives StrictMode remounts). */
export function showIdleSessionTimeoutToastIfNeeded(
  fromNavigation = false,
): boolean {
  if (idleTimeoutToastShownThisLoad) return false;

  const fromStorage =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(SESSION_IDLE_TIMEOUT_NOTICE_KEY) === "1";

  if (!fromStorage && !fromNavigation) return false;

  idleTimeoutToastShownThisLoad = true;
  if (fromStorage && typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(SESSION_IDLE_TIMEOUT_NOTICE_KEY);
  }

  toast.warning(
    "Session timed out",
    "You were signed out after 30 minutes of inactivity. Sign in again to continue.",
    8000,
  );

  return true;
}

export function resetIdleSessionTimeoutToastGuard(): void {
  idleTimeoutToastShownThisLoad = false;
}

export function touchSessionActivity(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(Date.now()));
}

export function getLastSessionActivityMs(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_LAST_ACTIVITY_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function clearLastSessionActivity(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
}

export function msUntilIdleLogout(now = Date.now()): number {
  const last = getLastSessionActivityMs();
  if (last == null) {
    touchSessionActivity();
    return IDLE_LOGOUT_MS;
  }
  const remaining = IDLE_LOGOUT_MS - (now - last);
  return remaining > 0 ? remaining : 0;
}

/** True when no user/API activity for {@link IDLE_LOGOUT_MS}. */
export function isSessionIdle(now = Date.now()): boolean {
  return msUntilIdleLogout(now) <= 0;
}

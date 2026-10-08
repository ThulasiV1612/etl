/** sessionStorage key for short-lived access JWT from sign-in */
export const SESSION_BEARER_KEY = "bearerToken";

/** sessionStorage key for long-lived refresh token (stored hashed server-side). */
export const SESSION_REFRESH_KEY = "refreshToken";

/** sessionStorage key for JSON stringified `userDetails` array from sign-in API */
export const SESSION_USER_DETAILS_KEY = "userDetails";

/** `investing` | `syndicating` — survives refresh; cleared on logout. */
export const SESSION_PORTAL_MODE_KEY = "portalMode";

/** Open portal activity session id (login → logout tracking). */
export const SESSION_ACTIVITY_SESSION_ID_KEY = "activitySessionId";

/** Post-login redirect from eSign / invite email links (survives if `?next=` is dropped). */
export const AUTH_RETURN_NEXT_KEY = "authReturnNext";

/**
 * Platform admins often have no `organizationId` on session user. Workspace settings still need a
 * `companies.id` for GET/PUT — this stores the last resolved target (no UI picker).
 */
export const SESSION_WORKSPACE_COMPANY_ID_KEY = "workspaceCompanyId";

/** Clears sign-in token and cached user details. Call from client-only code (e.g. logout). */
export function clearPortalSessionStorage(): void {
  sessionStorage.removeItem(SESSION_BEARER_KEY)
  sessionStorage.removeItem(SESSION_REFRESH_KEY)
  sessionStorage.removeItem(SESSION_USER_DETAILS_KEY)
  sessionStorage.removeItem(SESSION_WORKSPACE_COMPANY_ID_KEY)
  sessionStorage.removeItem(SESSION_PORTAL_MODE_KEY)
  sessionStorage.removeItem(SESSION_ACTIVITY_SESSION_ID_KEY)
  sessionStorage.removeItem(AUTH_RETURN_NEXT_KEY)
}

import { revokeAuthTokens } from "./authTokensApi";
import { clearLastSessionActivity } from "./idleSession";
import { clearPortalSessionStorage } from "./sessionKeys";
import { recordActivityLogout } from "./userActivityApi";

export type PortalLogoutReason = "idle" | "manual";

/** End portal session: activity log, revoke tokens, clear storage. */
export async function performPortalLogout(): Promise<void> {
  await recordActivityLogout();
  await revokeAuthTokens();
  clearPortalSessionStorage();
  clearLastSessionActivity();
}

import type { PortalMode } from "@/modules/Investing/context/PortalModeContext"

export const MY_ACCOUNT_INVESTOR_PROFILE_ROLE_LABEL = "Investor"
export const MY_ACCOUNT_SPONSOR_PROFILE_ROLE_LABEL = "Sponsor"

/**
 * My account → Profile Role follows the active portal mode (read-only on company tab):
 * syndicating → Sponsor; investing → Investor.
 */
export function profileRoleLabelForMyAccount(portalMode: PortalMode): string {
  return portalMode === "syndicating"
    ? MY_ACCOUNT_SPONSOR_PROFILE_ROLE_LABEL
    : MY_ACCOUNT_INVESTOR_PROFILE_ROLE_LABEL
}

import { getStoredAccessToken } from "./authTokensApi"
import { isLpInvestorSessionUser } from "./roleUtils"
import { SESSION_PORTAL_MODE_KEY } from "./sessionKeys"
import { getSessionOrganizationCompanyId } from "./sessionOrganization"

/** Sent on API calls so the backend scopes data to the selected company workspace. */
export const ACTIVE_ORGANIZATION_HEADER = "X-Active-Organization-Id"

/**
 * Investing vs Syndicating. Backend applies CRM Contacts Visibility in Investing Mode
 * for LP investors and for Lead / Admin / Co / company roles who switched modes.
 */
export const PORTAL_MODE_HEADER = "X-Portal-Mode"

/**
 * Internal sentinel read by {@link portalFetch} so callers can omit the workspace org header
 * even when the global fetch interceptor merges fresh auth headers.
 */
export const PORTAL_OMIT_ACTIVE_ORG_HEADER = "X-Portal-Omit-Active-Organization"

function readPortalModeHeaderValue(): "investing" | "syndicating" {
  if (typeof window !== "undefined" && isLpInvestorSessionUser()) {
    return "investing"
  }
  try {
    const v = sessionStorage.getItem(SESSION_PORTAL_MODE_KEY)
    if (v === "investing" || v === "syndicating") return v
  } catch {
    /* sessionStorage unavailable */
  }
  return "syndicating"
}

export function portalAuthHeaders(options?: {
  /** Omit workspace org header (investing participant deal lists are user-scoped). */
  omitActiveOrganization?: boolean
}): HeadersInit {
  const h: Record<string, string> = {}
  const token = getStoredAccessToken()
  if (token) h.Authorization = `Bearer ${token}`

  if (!options?.omitActiveOrganization) {
    const activeOrg = getSessionOrganizationCompanyId()
    if (activeOrg) h[ACTIVE_ORGANIZATION_HEADER] = activeOrg
  }

  h[PORTAL_MODE_HEADER] = readPortalModeHeaderValue()

  return h
}

export function organizationIdQueryParam(): string | undefined {
  const id = getSessionOrganizationCompanyId()
  return id ?? undefined
}

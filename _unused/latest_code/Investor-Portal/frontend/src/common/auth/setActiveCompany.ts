import {
  SESSION_USER_DETAILS_KEY,
  SESSION_WORKSPACE_COMPANY_ID_KEY,
} from "./sessionKeys"
import { getSessionAccessibleCompanies } from "./sessionMemberships"

export const PORTAL_ACTIVE_COMPANY_CHANGED_EVENT = "portal-active-company-changed"

function writeSessionWorkspaceCompanyContext(
  companyId: string,
  companyName: string,
): void {
  const id = companyId.trim().toLowerCase()
  const name = companyName.trim()
  if (!id || !name) return
  try {
    const raw = sessionStorage.getItem(SESSION_USER_DETAILS_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    const patch = {
      companyName: name,
      company_name: name,
      organizationName: name,
      organization_name: name,
      organization_id: id,
      organizationId: id,
    }
    if (
      Array.isArray(parsed) &&
      parsed[0] &&
      typeof parsed[0] === "object" &&
      !Array.isArray(parsed[0])
    ) {
      const first = {
        ...(parsed[0] as Record<string, unknown>),
        ...patch,
      }
      sessionStorage.setItem(
        SESSION_USER_DETAILS_KEY,
        JSON.stringify([first, ...parsed.slice(1)]),
      )
      return
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      sessionStorage.setItem(
        SESSION_USER_DETAILS_KEY,
        JSON.stringify({ ...(parsed as Record<string, unknown>), ...patch }),
      )
    }
  } catch {
    /* ignore */
  }
}

/** Persist active company for multi-org users (workspace key only). */
export function setActiveCompanyId(companyId: string, companyName?: string): void {
  const id = companyId.trim().toLowerCase()
  if (!id) return
  const options = getSessionAccessibleCompanies()
  const match = options.find((c) => c.companyId === id)
  if (!match) return

  sessionStorage.setItem(SESSION_WORKSPACE_COMPANY_ID_KEY, id)
  writeSessionWorkspaceCompanyContext(
    id,
    (companyName ?? match.companyName ?? "").trim(),
  )

  window.dispatchEvent(new CustomEvent(PORTAL_ACTIVE_COMPANY_CHANGED_EVENT))
}

/** After sign-in: default workspace to primary org when user has multiple companies. */
export function ensureActiveCompanyInitialized(): void {
  const companies = getSessionAccessibleCompanies()
  if (companies.length === 0) return
  const existing = sessionStorage
    .getItem(SESSION_WORKSPACE_COMPANY_ID_KEY)
    ?.trim()
    .toLowerCase()
  const existingMatch = existing
    ? companies.find((c) => c.companyId === existing)
    : undefined
  if (existingMatch) {
    writeSessionWorkspaceCompanyContext(
      existingMatch.companyId,
      existingMatch.companyName,
    )
    return
  }
  const primary = companies[0]
  if (primary) setActiveCompanyId(primary.companyId, primary.companyName)
}

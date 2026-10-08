import {
  SESSION_USER_DETAILS_KEY,
  SESSION_WORKSPACE_COMPANY_ID_KEY,
} from "./sessionKeys"
import { isPlatformAdmin } from "./roleUtils"
import {
  getSessionAccessibleCompanies,
  getSessionPrimaryCompanyName,
  isAccessibleCompanyId,
} from "./sessionMemberships"

function organizationIdFromUserDetailsRoot(
  o: Record<string, unknown> | null,
): string | null {
  if (!o) return null
  const id = o.organization_id ?? o.organizationId ?? o.organizationID
  if (id == null || id === "") return null
  const s = typeof id === "string" ? id.trim() : String(id).trim()
  return s || null
}

function readOrgIdAndWorkspaceKeyFromSession(): {
  orgFromUser: string | null
  workspaceKey: string | null
} {
  let orgFromUser: string | null = null
  try {
    const raw = sessionStorage.getItem(SESSION_USER_DETAILS_KEY)
    if (!raw) {
      return {
        orgFromUser: null,
        workspaceKey: getWorkspaceKeyFromSessionLower(),
      }
    }
    const parsed = JSON.parse(raw) as unknown
    let o: Record<string, unknown> | null = null
    if (
      Array.isArray(parsed) &&
      parsed[0] &&
      typeof parsed[0] === "object" &&
      !Array.isArray(parsed[0])
    ) {
      o = parsed[0] as Record<string, unknown>
    } else if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      o = parsed as Record<string, unknown>
    }
    if (o) {
      const r = organizationIdFromUserDetailsRoot(o)
      orgFromUser = r ? r.toLowerCase() : null
    }
  } catch {
    orgFromUser = null
  }
  return { orgFromUser, workspaceKey: getWorkspaceKeyFromSessionLower() }
}

function getWorkspaceKeyFromSessionLower(): string | null {
  const w = sessionStorage.getItem(SESSION_WORKSPACE_COMPANY_ID_KEY)?.trim()
  return w ? w.toLowerCase() : null
}

/**
 * Resolves the current workspace `companies.id` (UUID) for loading company-scoped data.
 *
 * - **Platform admin:** workspace key first (selected company), then session org.
 * - **Multi-company users:** validated workspace key when set, else primary org in session.
 * - **Single-company users:** primary org in session (ignores stale workspace keys).
 */
export function getSessionOrganizationCompanyId(): string | null {
  const { orgFromUser, workspaceKey } = readOrgIdAndWorkspaceKeyFromSession()
  if (isPlatformAdmin()) {
    if (workspaceKey) return workspaceKey
    if (orgFromUser) return orgFromUser
    return null
  }

  const accessible = getSessionAccessibleCompanies()
  const multiCompany = accessible.length > 1

  if (multiCompany) {
    if (workspaceKey && isAccessibleCompanyId(workspaceKey)) return workspaceKey
    if (orgFromUser && isAccessibleCompanyId(orgFromUser)) return orgFromUser
    if (accessible[0]?.companyId) return accessible[0].companyId
    return null
  }

  if (orgFromUser) return orgFromUser
  if (workspaceKey && isAccessibleCompanyId(workspaceKey)) return workspaceKey
  return null
}

/**
 * Display name for the active workspace company (selected org / logged-in scope),
 * not every membership the user belongs to.
 */
export function getActiveWorkspaceCompanyName(): string {
  const companyId = getSessionOrganizationCompanyId()
  if (companyId) {
    const normalized = companyId.trim().toLowerCase()
    const match = getSessionAccessibleCompanies().find(
      (c) => c.companyId === normalized,
    )
    if (match?.companyName?.trim()) return match.companyName.trim()
  }
  return getSessionPrimaryCompanyName()
}

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolves which organization to list for **GET /users?organizationId=** when the
 * Members page is opened without a parent (e.g. `/members`) and the viewer is a
 * platform admin. Prefers `organizationId` from user details, then
 * `getSessionOrganizationCompanyId()` (aligns with Company settings → Members).
 * Returns `false` when there is no resolvable org (empty list; not a global user list).
 */
export function resolvePlatformAdminMembersListScope():
  | string
  | false
  | undefined {
  if (!isPlatformAdmin()) return undefined
  const { orgFromUser } = readOrgIdAndWorkspaceKeyFromSession()
  if (orgFromUser && ORG_UUID_RE.test(orgFromUser)) return orgFromUser
  const w = getSessionOrganizationCompanyId()
  if (w && ORG_UUID_RE.test(w)) return w
  return false
}


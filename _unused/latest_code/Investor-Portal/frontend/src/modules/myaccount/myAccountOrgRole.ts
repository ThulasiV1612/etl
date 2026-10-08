import {
  COMPANY_ADMIN,
  COMPANY_USER,
  normalizeRole,
} from "../../common/auth/roleUtils"
import {
  memberRoleDisplayName,
  parseMembershipsFromRow,
  type UserMembership,
} from "../Syndication/usermanagement/memberAdminShared"
import {
  getActiveWorkspaceCompanyName,
  getSessionOrganizationCompanyId,
} from "../../common/auth/sessionOrganization"
import { getSessionAccessibleCompanies } from "../../common/auth/sessionMemberships"

function isCompanyOrgPortalRole(role: string | null | undefined): boolean {
  const r = normalizeRole(String(role ?? ""))
  return r === COMPANY_ADMIN || r === COMPANY_USER
}

function isCompanyOrgMembershipRoleLabel(role: unknown): boolean {
  const r = String(role ?? "").trim().toLowerCase()
  return (
    r === COMPANY_ADMIN ||
    r === COMPANY_USER ||
    r === "company admin" ||
    r === "company member"
  )
}

function parseMembershipsForActiveWorkspace(
  u: Record<string, unknown>,
): UserMembership[] {
  const companyId = getSessionOrganizationCompanyId()
  const companyName =
    (companyId
      ? getSessionAccessibleCompanies().find((c) => c.companyId === companyId)
          ?.companyName
      : ""
    )?.trim() ||
    getActiveWorkspaceCompanyName().trim() ||
    ""
  const nameKey = companyName.toLowerCase()

  const all = parseMembershipsFromRow(u)
  if (!companyId && !companyName) return all

  const byName = all.filter(
    (m) => nameKey && m.company.trim().toLowerCase() === nameKey,
  )
  if (byName.length > 0) return byName

  const raw = u.memberships
  if (Array.isArray(raw) && companyId) {
    for (const item of raw) {
      if (item == null || typeof item !== "object" || Array.isArray(item)) {
        continue
      }
      const rec = item as Record<string, unknown>
      const cid = String(rec.companyId ?? rec.company_id ?? "")
        .trim()
        .toLowerCase()
      const role = String(rec.role ?? "").trim()
      if (cid === companyId && isCompanyOrgMembershipRoleLabel(role)) {
        const cn = String(
          rec.companyName ?? rec.company_name ?? rec.company ?? companyName,
        ).trim()
        return [
          {
            company: cn || companyName || "Company",
            role: memberRoleDisplayName(role),
          },
        ]
      }
    }
  }

  if (
    companyId &&
    isCompanyOrgPortalRole(String(u.role ?? ""))
  ) {
    const primaryId = String(u.organization_id ?? u.organizationId ?? "")
      .trim()
      .toLowerCase()
    if (primaryId === companyId) {
      return [
        {
          company: companyName || "Company",
          role: memberRoleDisplayName(String(u.role ?? "")),
        },
      ]
    }
  }

  return byName
}

/**
 * My account → Org Role is shown only for company admin and company member.
 */
export function viewerShowsOrgRoleInMyAccount(
  u: Record<string, unknown> | null,
): boolean {
  if (!u) return false
  if (isCompanyOrgPortalRole(String(u.role ?? ""))) return true
  return parseMembershipsForActiveWorkspace(u).some((m) =>
    isCompanyOrgMembershipRoleLabel(m.role),
  )
}

/**
 * Org-scoped role label (Company Admin / Company Member), not deal roster roles.
 */
export function orgRoleLabelForMyAccount(
  u: Record<string, unknown> | null,
): string {
  if (!u) return "—"

  if (isCompanyOrgPortalRole(String(u.role ?? ""))) {
    return memberRoleDisplayName(String(u.role ?? ""))
  }

  const fromMemberships = [
    ...new Set(
      parseMembershipsForActiveWorkspace(u)
        .filter((m) => isCompanyOrgMembershipRoleLabel(m.role))
        .map((m) => memberRoleDisplayName(m.role)),
    ),
  ].filter((label) => label && label !== "—")

  if (fromMemberships.length > 0) return fromMemberships.join(", ")

  return "—"
}

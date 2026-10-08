import {
  isLeadSponsorRole,
  LP_INVESTOR_ROLE_VALUE,
} from "../constants/investor-profile"
import type { DealInvestorRow } from "../types/deal-investors.types"
import { EMAIL_UNAVAILABLE_LABEL } from "../../../../common/utils/displayEmail"

export {
  EMAIL_UNAVAILABLE_LABEL as INVESTOR_EMAIL_REDACTED_LABEL,
  displayEmail,
  isDisplayableEmail as isUsableInvestorEmail,
} from "../../../../common/utils/displayEmail"

export type ViewerDealMemberRole =
  | "lead_sponsor"
  | "admin_sponsor"
  | "co_sponsor"
  | "lp_investor"
  | null

const VIEWER_DEAL_MEMBER_ROLE_VALUES = new Set<string>([
  "lead_sponsor",
  "admin_sponsor",
  "co_sponsor",
  "lp_investor",
])

/** API `viewerDealMemberRole` from GET `/deals/:id/members`. */
export function parseViewerDealMemberRoleFromApi(
  raw: unknown,
): ViewerDealMemberRole {
  const t = String(raw ?? "").trim()
  if (VIEWER_DEAL_MEMBER_ROLE_VALUES.has(t)) {
    return t as ViewerDealMemberRole
  }
  return null
}

/** Lead, admin, and co-sponsor on the deal roster (deal Documents tab / workspace). */
export function viewerIsDealSponsorRole(
  role: ViewerDealMemberRole,
): boolean {
  return (
    role === "lead_sponsor" ||
    role === "admin_sponsor" ||
    role === "co_sponsor"
  )
}

function roleLikeStringsForMember(m: DealInvestorRow): string[] {
  const out: string[] = []
  const r = String(m.investorRole ?? "").trim()
  if (r && r !== "—") out.push(r)
  for (const lab of m.memberRoleLabels ?? []) {
    const t = String(lab ?? "").trim()
    if (t && t !== "—") out.push(t)
  }
  return out
}

function roleStringIsLeadSponsor(raw: string): boolean {
  if (isLeadSponsorRole(raw)) return true
  return String(raw).trim().toLowerCase() === "lead sponsor"
}

function roleStringIsAdminSponsor(raw: string): boolean {
  const t = String(raw).trim().toLowerCase()
  return t === "admin sponsor"
}

function roleStringIsCoSponsor(raw: string): boolean {
  const t = String(raw).trim().toLowerCase()
  return t === "co-sponsor" || t === "co sponsor"
}

/** Match viewer to roster row by portal email and/or `contactId` (= user or CRM contact uuid). */
export function dealMemberRowMatchesViewer(
  m: DealInvestorRow,
  sessionEmail: string,
  sessionUserId: string,
): boolean {
  const em = sessionEmail.trim().toLowerCase()
  if (em && em.includes("@")) {
    const rowEmail = String(m.userEmail ?? "").trim().toLowerCase()
    if (rowEmail && rowEmail !== "—" && rowEmail === em) return true
  }
  const uid = sessionUserId.trim().toLowerCase()
  if (uid) {
    const cid = String(m.contactId ?? "").trim().toLowerCase()
    if (cid && cid === uid) return true
  }
  return false
}

/**
 * Match the signed-in user’s email to a deal roster row and classify sponsor / LP role.
 * Uses `memberRoleLabels` as well as `investorRole` (same row can rely on labels only).
 * Returns null when the viewer is not on the roster (typical org owner / admin).
 */
export function resolveViewerDealMemberRole(
  members: DealInvestorRow[],
  sessionEmail: string,
  sessionUserId = "",
): ViewerDealMemberRole {
  const em = sessionEmail.trim().toLowerCase()
  const uid = sessionUserId.trim().toLowerCase()
  if ((!em || !em.includes("@")) && !uid) return null
  let hasLead = false
  let hasAdmin = false
  let hasCo = false
  let hasLp = false
  for (const m of members) {
    if (!dealMemberRowMatchesViewer(m, em, uid)) continue
    const roles = roleLikeStringsForMember(m)
    if (roles.length === 0) continue
    for (const raw of roles) {
      if (roleStringIsLeadSponsor(raw)) hasLead = true
      else if (roleStringIsAdminSponsor(raw)) hasAdmin = true
      else if (roleStringIsCoSponsor(raw)) hasCo = true
      const role = String(raw).trim().toLowerCase()
      if (
        role === LP_INVESTOR_ROLE_VALUE.toLowerCase() ||
        role === "lp investors" ||
        role === "lp investor"
      ) {
        hasLp = true
      }
    }
  }
  if (hasLead) return "lead_sponsor"
  if (hasAdmin) return "admin_sponsor"
  if (hasCo) return "co_sponsor"
  if (hasLp) return "lp_investor"
  return null
}

/**
 * The signed-in viewer’s roster row (matched by `userEmail`), for role display.
 * Use with {@link resolveViewerDealInvestorRoleRaw} for a single string, or with
 * {@link DealInvestorRoleBadge} (pass `investorRole` and `memberRoleLabels`).
 */
export function resolveViewerDealMemberMatch(
  members: DealInvestorRow[],
  sessionEmail: string,
  sessionUserId = "",
): { investorRole?: string; memberRoleLabels?: string[] } | null {
  const em = sessionEmail.trim().toLowerCase()
  const uid = sessionUserId.trim().toLowerCase()
  if ((!em || !em.includes("@")) && !uid) return null
  for (const m of members) {
    if (!dealMemberRowMatchesViewer(m, em, uid)) continue
    return {
      investorRole: m.investorRole,
      memberRoleLabels: m.memberRoleLabels,
    }
  }
  return null
}

/**
 * Roster `investor_role` for the signed-in viewer when they appear on the deal
 * roster (lead sponsor, LP investor, etc.). Prefer
 * `memberRoleLabels[0]` when the API only sends deal-member labels.
 */
export function resolveViewerDealInvestorRoleRaw(
  members: DealInvestorRow[],
  sessionEmail: string,
  sessionUserId = "",
): string | null {
  const match = resolveViewerDealMemberMatch(
    members,
    sessionEmail,
    sessionUserId,
  )
  if (!match) return null
  const raw = String(match.investorRole ?? "").trim()
  if (raw && raw !== "—") return raw
  const fromLabels = match.memberRoleLabels
    ?.map((s) => String(s ?? "").trim())
    .filter((s) => s && s !== "—")
  if (fromLabels?.length) return fromLabels[0]!
  return null
}

/** Roster `investor_role` when the viewer is Lead / Admin / Co-sponsor; otherwise null. */
export function resolveViewerSponsorInvestorRoleRaw(
  members: DealInvestorRow[],
  sessionEmail: string,
  sessionUserId = "",
): string | null {
  const kind = resolveViewerDealMemberRole(
    members,
    sessionEmail,
    sessionUserId,
  )
  if (
    kind !== "lead_sponsor" &&
    kind !== "admin_sponsor" &&
    kind !== "co_sponsor"
  ) {
    return null
  }
  return resolveViewerDealInvestorRoleRaw(
    members,
    sessionEmail,
    sessionUserId,
  )
}

/** eSign Templates tab: upload / edit / delete templates — lead or admin sponsor. */
export function viewerCanUploadDealEsignTemplates(
  role: ViewerDealMemberRole,
): boolean {
  return role === "lead_sponsor" || role === "admin_sponsor"
}

/**
 * Deal profile (create/edit wizard, list “Edit Deal”): lead or admin sponsor,
 * or a workspace viewer who is not a co-sponsor / LP on this deal.
 * Co-sponsors cannot edit the deal.
 */
export function viewerCanEditDeal(role: ViewerDealMemberRole): boolean {
  return role !== "co_sponsor" && role !== "lp_investor"
}

/** Investors tab: approve fund — lead, admin sponsor, or company / platform admin. */
export function viewerCanApproveDealFund(
  role: ViewerDealMemberRole,
  opts?: { isWorkspaceAdmin?: boolean },
): boolean {
  if (opts?.isWorkspaceAdmin) return true
  return role === "lead_sponsor" || role === "admin_sponsor"
}

/** Investors tab: send eSign to an investor — lead, admin, or co-sponsor on the deal. */
export function viewerCanSendDealEsignTemplates(
  role: ViewerDealMemberRole,
): boolean {
  return (
    role === "lead_sponsor" ||
    role === "admin_sponsor" ||
    role === "co_sponsor"
  )
}

/** Investors tab: API scopes co-sponsors to their Sponsor-name investors. */
export function viewerShouldSeeOnlyOwnAddedInvestors(
  _role: ViewerDealMemberRole,
): boolean {
  // Backend filters by Investor → Sponsor/Co-sponsor (Sponsor name); do not re-filter here.
  return false
}

/** @deprecated Sponsor relationship scope is enforced by the API. */
export function filterDealInvestorRowsForCoSponsorViewer(
  rows: DealInvestorRow[],
  _sessionUserId: string,
): DealInvestorRow[] {
  return rows
}

/**
 * Investors tab: co-sponsor rows are already limited to that viewer’s Sponsor-name
 * investors by the API; lead/admin get full roster with co-sponsor emails redacted.
 */
export function scopeDealInvestorRowsForViewer(
  rows: DealInvestorRow[],
  viewerRole: ViewerDealMemberRole,
  _sessionUserId: string,
): DealInvestorRow[] {
  return redactCoSponsorAddedInvestorEmailsForLeadAdminViewer(rows, viewerRole)
}

/**
 * Lead / admin sponsors see the full roster; hide email on rows a co-sponsor added.
 * Uses API `addedByIsCoSponsorOnDeal` when present (matches backend redaction).
 */
export function redactCoSponsorAddedInvestorEmailsForLeadAdminViewer(
  rows: DealInvestorRow[],
  viewerRole: ViewerDealMemberRole,
): DealInvestorRow[] {
  if (viewerRole !== "lead_sponsor" && viewerRole !== "admin_sponsor") {
    return rows
  }
  return rows.map((row) => {
    if (row.addedByIsCoSponsorOnDeal !== true) return row
    return { ...row, userEmail: EMAIL_UNAVAILABLE_LABEL }
  })
}

/** Which deal detail tab ids the viewer may open, based on roster role. */
export function visibleDealDetailTabIds(
  role: ViewerDealMemberRole,
  opts?: { isWorkspaceAdmin?: boolean },
): Set<string> {
  const all = new Set([
    "offering_details",
    "documents",
    "esign_templates",
    "investors",
    "investor_communication",
    "distributions",
    "deal_members",
  ])
  // Company / platform admin keep Deal Members even if they are also an LP on the deal.
  if (opts?.isWorkspaceAdmin) return all
  if (role === null) return all
  if (role === "lead_sponsor" || role === "admin_sponsor") {
    return all
  }
  if (role === "co_sponsor") {
    const s = new Set(all)
    s.delete("deal_members")
    return s
  }
  if (role === "lp_investor") {
    const s = new Set(all)
    s.delete("deal_members")
    return s
  }
  return all
}

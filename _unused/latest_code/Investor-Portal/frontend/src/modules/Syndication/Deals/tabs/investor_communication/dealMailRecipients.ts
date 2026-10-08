import { EMAIL_UNAVAILABLE_LABEL } from "../../../../../common/utils/displayEmail"
import { ADD_MEMBER_DRAFT_ROW_ID } from "../deal_members/add-investment/addMemberDraftInvestorRow"
import {
  isDealMembersTabRole,
  isGeneralPartnerRole,
  isLpInvestorRole,
  investorRoleLabel,
} from "../../constants/investor-profile"
import type { DealInvestorClass } from "../../types/deal-investor-class.types"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import {
  isGpInvestorClass,
  isLpInvestorClass,
} from "../../utils/investorClassOverviewFields"

export type DealMailRecipientGroup = "investor" | "deal_member"
export type InvestorClassKind = "lp" | "gp"

export interface DealMailRecipient {
  id: string
  displayName: string
  email: string
  groups: DealMailRecipientGroup[]
  roleLabel: string
  classKind: InvestorClassKind
  className: string
  sponsorKey: string
  sponsorName: string
  sponsorEmail: string
  addedByUserId: string
  addedByIsCoSponsor: boolean
  requiresCosponsorRelease: boolean
  /** Yes-intercept co-sponsor LPs: lead mail goes to co-sponsor and those LPs. */
  includeCoSponsorOnSend: boolean
  sourceRowId: string
  sourceKind: "investor" | "member"
  /** Investor or cosponsor has an address that can actually receive the mail. */
  canDeliver: boolean
}

export interface DealMailLpSponsorGroup {
  key: string
  sponsorName: string
  sponsorEmail: string
  isCosponsor: boolean
  requiresRelease: boolean
  intercept: "yes" | "no" | null
  recipients: DealMailRecipient[]
}

export interface DealMailRecipientTree {
  gps: DealMailRecipient[]
  lps: DealMailRecipient[]
  lpGroups: DealMailLpSponsorGroup[]
}

export interface BuildDealMailRecipientsInput {
  investors: DealInvestorRow[]
  classes: DealInvestorClass[]
  viewerUserId?: string
  viewerEmail?: string
}

const NONE_SPONSOR_KEY = "none"
const LEAD_ADMIN_GROUP_LABEL = "Lead / Admin LPs"
const NO_COSPONSOR_GROUP_LABEL = "No cosponsor"

function usableEmail(raw: unknown): string {
  const email = String(raw ?? "").trim()
  if (!email.includes("@")) return ""
  if (email.toLowerCase() === EMAIL_UNAVAILABLE_LABEL.toLowerCase()) return ""
  return email
}

function roleLabelForRow(row: DealInvestorRow): string {
  const fromLabels = row.memberRoleLabels
    ?.map((s) => investorRoleLabel(String(s ?? "").trim()))
    .filter((s) => s && s !== "—")
  if (fromLabels?.length) return fromLabels.join(", ")
  const role = String(row.investorRole ?? "").trim()
  if (!role || role === "—") return "—"
  return investorRoleLabel(role)
}

function groupLabel(groups: DealMailRecipientGroup[]): string {
  const hasInv = groups.includes("investor")
  const hasMem = groups.includes("deal_member")
  if (hasInv && hasMem) return "Investor & general partner"
  if (hasInv) return "Investor"
  if (hasMem) return "General Partner"
  return "—"
}

export function groupLabelForDealMailRecipient(r: {
  groups: DealMailRecipientGroup[]
}): string {
  return groupLabel(r.groups)
}

function matchInvestorClass(
  row: DealInvestorRow,
  classes: DealInvestorClass[],
): DealInvestorClass | null {
  const raw = String(row.investorClass ?? "").trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  return (
    classes.find(
      (c) =>
        c.id.trim().toLowerCase() === lower ||
        c.name.trim().toLowerCase() === lower,
    ) ?? null
  )
}

export function classKindForInvestorRow(
  row: DealInvestorRow,
  classes: DealInvestorClass[],
): InvestorClassKind {
  const matched = matchInvestorClass(row, classes)
  if (matched) {
    if (isGpInvestorClass(matched)) return "gp"
    if (isLpInvestorClass(matched)) return "lp"
  }
  const className = String(row.investorClass ?? "").trim().toLowerCase()
  if (/\bgp\b|general partner/.test(className)) return "gp"
  if (/\blp\b|limited partner/.test(className)) return "lp"
  if (isGeneralPartnerRole(row.investorRole)) return "gp"
  if (
    isDealMembersTabRole(row.investorRole) &&
    !isLpInvestorRole(row.investorRole)
  )
    return "gp"
  return "lp"
}

function sponsorKeyForRow(row: DealInvestorRow): string {
  const uid = String(row.addedByUserId ?? "").trim().toLowerCase()
  if (uid) return `uid:${uid}`
  const email = usableEmail(row.addedByEmail)
  if (email) return `em:${email.toLowerCase()}`
  const name = String(row.addedByDisplayName ?? "").trim()
  if (name && name !== "—") return `nm:${name.toLowerCase()}`
  return NONE_SPONSOR_KEY
}

function sponsorNameForRow(row: DealInvestorRow, isCosponsor: boolean): string {
  const name = String(row.addedByDisplayName ?? "").trim()
  if (name && name !== "—") return name
  const email = usableEmail(row.addedByEmail)
  if (email) return email
  if (isCosponsor) return "Co-sponsor"
  if (sponsorKeyForRow(row) === NONE_SPONSOR_KEY) return NO_COSPONSOR_GROUP_LABEL
  return LEAD_ADMIN_GROUP_LABEL
}

function viewerOwnsSponsor(
  row: DealInvestorRow,
  viewerUserId: string,
  viewerEmail: string,
): boolean {
  const uid = String(row.addedByUserId ?? "").trim().toLowerCase()
  if (viewerUserId && uid && uid === viewerUserId) return true
  const email = usableEmail(row.addedByEmail).toLowerCase()
  if (viewerEmail && email && email === viewerEmail) return true
  return false
}

function roleIsAdminSponsor(role: string): boolean {
  return role.trim().toLowerCase() === "admin sponsor"
}

function roleIsCoSponsor(role: string): boolean {
  const t = role.trim().toLowerCase()
  return t === "co-sponsor" || t === "co sponsor"
}

function memberRoles(row: DealInvestorRow): string[] {
  const out: string[] = []
  const role = String(row.investorRole ?? "").trim()
  if (role && role !== "—") out.push(role)
  for (const lab of row.memberRoleLabels ?? []) {
    const t = String(lab ?? "").trim()
    if (t && t !== "—") out.push(t)
  }
  return out
}

function rowIsAdminSponsor(row: DealInvestorRow): boolean {
  return memberRoles(row).some(roleIsAdminSponsor)
}

function rowIsCoSponsorMember(row: DealInvestorRow): boolean {
  return memberRoles(row).some(roleIsCoSponsor)
}

function sortByName(a: DealMailRecipient, b: DealMailRecipient): number {
  return a.displayName.localeCompare(b.displayName, undefined, {
    sensitivity: "base",
  })
}

export function buildDealMailRecipients({
  investors,
  classes,
  viewerUserId = "",
  viewerEmail = "",
}: BuildDealMailRecipientsInput): DealMailRecipient[] {
  const viewerId = viewerUserId.trim().toLowerCase()
  const viewerEm = viewerEmail.trim().toLowerCase()
  const out: DealMailRecipient[] = []

  for (const row of investors) {
    if (row.id === ADD_MEMBER_DRAFT_ROW_ID) continue
    const email = usableEmail(row.userEmail)
    const classKind = classKindForInvestorRow(row, classes)
    const isCosponsor =
      row.addedByIsCoSponsorOnDeal === true ||
      row.addedByCoSponsorEmailIntercept === "yes" ||
      row.addedByCoSponsorEmailIntercept === "no"
    const intercept = row.addedByCoSponsorEmailIntercept === "no" ? "no" : "yes"
    const holdAtCoSponsor = isCosponsor && intercept === "no"
    const includeCoSponsorOnSend = isCosponsor && intercept === "yes"
    const requiresCosponsorRelease =
      classKind === "lp" &&
      holdAtCoSponsor &&
      !viewerOwnsSponsor(row, viewerId, viewerEm)
    const hideLpEmailFromViewer =
      classKind === "lp" &&
      isCosponsor &&
      !viewerOwnsSponsor(row, viewerId, viewerEm)
    const sponsorEmail = usableEmail(row.addedByEmail)
    const canDeliver = Boolean(
      (!hideLpEmailFromViewer && email) ||
        (requiresCosponsorRelease && sponsorEmail) ||
        includeCoSponsorOnSend,
    )

    const displayName =
      row.displayName?.trim() ||
      row.userDisplayName?.trim() ||
      (hideLpEmailFromViewer ? "" : email) ||
      "Investor"
    const className = String(row.investorClass ?? "").trim()
    out.push({
      id: `investor-${row.id}-${email || sponsorKeyForRow(row) || row.id}`,
      displayName,
      email: hideLpEmailFromViewer ? "" : email,
      groups: ["investor"],
      roleLabel: roleLabelForRow(row),
      classKind,
      className,
      sponsorKey: sponsorKeyForRow(row),
      sponsorName: sponsorNameForRow(row, isCosponsor),
      sponsorEmail,
      addedByUserId: String(row.addedByUserId ?? "").trim(),
      addedByIsCoSponsor: isCosponsor,
      requiresCosponsorRelease,
      includeCoSponsorOnSend:
        classKind === "lp" &&
        includeCoSponsorOnSend &&
        !viewerOwnsSponsor(row, viewerId, viewerEm),
      sourceRowId: row.id,
      sourceKind: "investor",
      canDeliver,
    })
  }

  return out.sort(sortByName)
}

export function groupDealMailRecipients(
  recipients: DealMailRecipient[],
): DealMailRecipientTree {
  const gps = recipients.filter((r) => r.classKind === "gp").sort(sortByName)
  const lps = recipients.filter((r) => r.classKind === "lp").sort(sortByName)
  const bySponsor = new Map<string, DealMailLpSponsorGroup>()

  for (const r of lps) {
    const existing = bySponsor.get(r.sponsorKey)
    if (existing) {
      existing.recipients.push(r)
      if (r.sponsorEmail && !existing.sponsorEmail)
        existing.sponsorEmail = r.sponsorEmail
      if (r.requiresCosponsorRelease) existing.requiresRelease = true
      if (r.requiresCosponsorRelease) existing.intercept = "no"
      else if (r.includeCoSponsorOnSend && existing.intercept !== "no")
        existing.intercept = "yes"
      continue
    }
    bySponsor.set(r.sponsorKey, {
      key: r.sponsorKey,
      sponsorName:
        r.addedByIsCoSponsor || r.sponsorKey === NONE_SPONSOR_KEY
          ? r.sponsorName
          : r.sponsorName || LEAD_ADMIN_GROUP_LABEL,
      sponsorEmail: r.sponsorEmail,
      isCosponsor: r.addedByIsCoSponsor,
      requiresRelease: r.requiresCosponsorRelease,
      intercept: r.requiresCosponsorRelease
        ? "no"
        : r.includeCoSponsorOnSend
          ? "yes"
          : null,
      recipients: [r],
    })
  }

  const lpGroups = [...bySponsor.values()].sort((a, b) => {
    if (a.requiresRelease !== b.requiresRelease)
      return a.requiresRelease ? 1 : -1
    if (a.key === NONE_SPONSOR_KEY) return 1
    if (b.key === NONE_SPONSOR_KEY) return -1
    return a.sponsorName.localeCompare(b.sponsorName, undefined, {
      sensitivity: "base",
    })
  })

  return { gps, lps, lpGroups }
}

export function deliveryEmailsForRecipients(
  selected: DealMailRecipient[],
): string[] {
  const emails: string[] = []
  for (const r of selected) {
    if (r.requiresCosponsorRelease) {
      if (r.sponsorEmail.includes("@")) emails.push(r.sponsorEmail)
      continue
    }
    if (r.addedByIsCoSponsor && r.classKind === "lp") {
      if (r.includeCoSponsorOnSend || r.requiresCosponsorRelease) {
        if (r.sponsorEmail.includes("@")) emails.push(r.sponsorEmail)
        continue
      }
    }
    if (r.email.includes("@")) emails.push(r.email)
    if (r.includeCoSponsorOnSend && r.sponsorEmail.includes("@")) {
      emails.push(r.sponsorEmail)
    }
  }
  return [...new Set(emails.map((e) => e.trim().toLowerCase()))]
}

export function mergeDealInvestorRowsForMail(
  lpInvestors: DealInvestorRow[],
  allInvestors: DealInvestorRow[],
): DealInvestorRow[] {
  const byId = new Map<string, DealInvestorRow>()
  for (const row of allInvestors) {
    if (!row.id || row.id === ADD_MEMBER_DRAFT_ROW_ID) continue
    byId.set(row.id, row)
  }
  for (const row of lpInvestors) {
    if (!row.id || row.id === ADD_MEMBER_DRAFT_ROW_ID) continue
    byId.set(row.id, row)
  }
  return [...byId.values()]
}

function memberAlreadyListed(
  recipients: DealMailRecipient[],
  row: DealInvestorRow,
): boolean {
  const email = usableEmail(row.userEmail).toLowerCase()
  const contactId = String(row.contactId ?? "").trim().toLowerCase()
  return recipients.some((r) => {
    if (email && r.email.trim().toLowerCase() === email) return true
    if (contactId && r.sourceRowId.trim().toLowerCase() === contactId) return true
    if (r.sourceRowId && r.sourceRowId === row.id) return true
    return false
  })
}

/** Add admin sponsor and co-sponsor roster people as GP recipients. */
export function appendAdminAndCoSponsorMembersAsRecipients(
  recipients: DealMailRecipient[],
  members: DealInvestorRow[],
): DealMailRecipient[] {
  const extra: DealMailRecipient[] = []
  for (const row of members) {
    if (row.id === ADD_MEMBER_DRAFT_ROW_ID) continue
    if (!rowIsAdminSponsor(row) && !rowIsCoSponsorMember(row)) continue
    if (memberAlreadyListed(recipients, row)) continue
    const email = usableEmail(row.userEmail)
    const displayName =
      row.displayName?.trim() ||
      row.userDisplayName?.trim() ||
      email ||
      (rowIsAdminSponsor(row) ? "Admin sponsor" : "Co-sponsor")
    extra.push({
      id: `member-${row.id}-${email || row.id}`,
      displayName,
      email,
      groups: ["deal_member"],
      roleLabel: roleLabelForRow(row),
      classKind: "gp",
      className: String(row.investorClass ?? "").trim(),
      sponsorKey: sponsorKeyForRow(row),
      sponsorName: displayName,
      sponsorEmail: email,
      addedByUserId: String(row.addedByUserId ?? "").trim(),
      addedByIsCoSponsor: rowIsCoSponsorMember(row),
      requiresCosponsorRelease: false,
      includeCoSponsorOnSend: false,
      sourceRowId: row.id,
      sourceKind: "member",
      canDeliver: Boolean(email),
    })
  }
  return [...recipients, ...extra].sort(sortByName)
}

export function defaultDealMailRecipientIds(
  recipients: DealMailRecipient[],
  opts: {
    viewerIsCosponsor: boolean
    viewerUserId?: string
    viewerEmail?: string
    preselectEmails?: string[]
  },
): Set<string> {
  const preselect = new Set(
    (opts.preselectEmails ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  )
  if (preselect.size > 0) {
    return new Set(
      recipients
        .filter((r) => {
          const email = r.email.trim().toLowerCase()
          const sponsor = r.sponsorEmail.trim().toLowerCase()
          return (
            (email && preselect.has(email)) ||
            (sponsor && preselect.has(sponsor))
          )
        })
        .map((r) => r.id),
    )
  }
  const viewerId = String(opts.viewerUserId ?? "").trim().toLowerCase()
  const viewerEm = String(opts.viewerEmail ?? "").trim().toLowerCase()
  if (opts.viewerIsCosponsor) {
    return new Set(
      recipients
        .filter((r) => {
          if (r.classKind !== "lp") return false
          const uid = r.addedByUserId.trim().toLowerCase()
          if (viewerId && uid && uid === viewerId) return true
          const sponsor = r.sponsorEmail.trim().toLowerCase()
          if (viewerEm && sponsor && sponsor === viewerEm) return true
          return false
        })
        .map((r) => r.id),
    )
  }
  return new Set(
    recipients
      .filter((r) => {
        if (r.classKind === "lp") return true
        const role = r.roleLabel.trim().toLowerCase()
        return roleIsAdminSponsor(role) || roleIsCoSponsor(role)
      })
      .map((r) => r.id),
  )
}

export function mergeDealInvestorsAndMembersToRecipients(
  investors: DealInvestorRow[],
  members: DealInvestorRow[] = [],
): DealMailRecipient[] {
  return appendAdminAndCoSponsorMembersAsRecipients(
    buildDealMailRecipients({ investors, classes: [] }),
    members,
  )
}

/** Co-sponsor send picker: only LPs this viewer added — never lead/admin GPs or their LPs. */
export function filterDealMailRecipientsForCoSponsorViewer(
  recipients: DealMailRecipient[],
  opts: { viewerUserId?: string; viewerEmail?: string },
): DealMailRecipient[] {
  const viewerId = String(opts.viewerUserId ?? "").trim().toLowerCase()
  const viewerEm = String(opts.viewerEmail ?? "").trim().toLowerCase()
  return recipients.filter((r) => {
    if (r.classKind !== "lp") return false
    const uid = r.addedByUserId.trim().toLowerCase()
    if (viewerId && uid && uid === viewerId) return true
    const sponsor = r.sponsorEmail.trim().toLowerCase()
    if (viewerEm && sponsor && sponsor === viewerEm) return true
    return false
  })
}

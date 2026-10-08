import {
  isDealMembersTabRole,
  isLpInvestorRole,
} from "../constants/investor-profile"
import type { DealInvestorClass } from "../types/deal-investor-class.types"
import type { DealInvestorRow } from "../types/deal-investors.types"
import {
  isBuiltInDocumentSection,
  type NestedPreviewDocument,
  type OfferingPreviewSection,
} from "./offeringPreviewDocSections"

export type SponsorPickerOption = { id: string; label: string }

/** True when the row is a deal roster sponsor (Lead / Admin / Co-sponsor), not an LP investor pick. */
export function isDealSponsorRosterRow(row: DealInvestorRow): boolean {
  if (isDealMembersTabRole(row.investorRole)) return true
  for (const label of row.memberRoleLabels ?? []) {
    if (isDealMembersTabRole(label)) return true
  }
  return false
}

/** Investors tab rows eligible for Shared With (deal LPs only; no sponsors / deal members). */
export function filterLpInvestorsForDocumentSharedWith(
  rows: DealInvestorRow[],
): DealInvestorRow[] {
  return rows.filter((r) => {
    if (!r.id.trim()) return false
    if (isDealSponsorRosterRow(r)) return false
    const role = r.investorRole?.trim()
    if (role && role !== "—" && !isLpInvestorRole(role) && isDealMembersTabRole(role)) {
      return false
    }
    return true
  })
}

/**
 * Portal `users.id` for a sponsor roster row — matches `addedByUserId` on LP rows they added.
 */
export function resolveSponsorPortalUserId(
  member: DealInvestorRow,
  lpInvestors: DealInvestorRow[],
): string | null {
  const contactId = member.contactId?.trim()
  if (contactId) {
    const cidLower = contactId.toLowerCase()
    if (
      lpInvestors.some(
        (i) => i.addedByUserId?.trim().toLowerCase() === cidLower,
      )
    ) {
      return contactId
    }
  }

  const memberName = member.displayName?.trim()
  if (memberName && memberName !== "—") {
    for (const inv of lpInvestors) {
      const adderName = inv.addedByDisplayName?.trim()
      const uid = inv.addedByUserId?.trim()
      if (adderName === memberName && uid) return uid
    }
  }

  return contactId || null
}

/** Sponsor users on the deal roster (for “Sponsor investors” Shared With). */
export function buildSponsorUserPickerOptions(
  sponsorRoster: DealInvestorRow[],
  lpInvestors: DealInvestorRow[],
): SponsorPickerOption[] {
  const out: SponsorPickerOption[] = []
  const seen = new Set<string>()

  for (const m of sponsorRoster) {
    if (!isDealSponsorRosterRow(m)) continue
    const userId = resolveSponsorPortalUserId(m, lpInvestors)?.trim()
    if (!userId) continue
    const key = userId.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const name = m.displayName?.trim() || "—"
    const email =
      m.userEmail?.trim() && m.userEmail !== "—" ? m.userEmail.trim() : ""
    out.push({
      id: userId,
      label: email ? `${name} (${email})` : name,
    })
  }

  return out.sort((a, b) =>
    a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
  )
}

export function lpInvestorsAddedBySponsorUserId(
  sponsorUserId: string,
  lpInvestors: DealInvestorRow[],
): DealInvestorRow[] {
  const key = sponsorUserId.trim().toLowerCase()
  if (!key) return []
  return lpInvestors.filter(
    (i) => i.addedByUserId?.trim().toLowerCase() === key,
  )
}

/**
 * Stored intercept `yes` = No intercept (lead shares reach co-sponsor and their LPs).
 * Stored `no` = Yes intercept (lead shares stay with the co-sponsor until they share).
 */
export function coSponsorInterceptPassesDocumentsToInvestors(
  intercept: string | null | undefined,
): boolean {
  return String(intercept ?? "yes").trim().toLowerCase() !== "no"
}

/** LPs of a co-sponsor with Yes intercept do not receive sponsor-user Shared With. */
export function lpReceivesDocumentsSharedWithTheirSponsor(
  row: DealInvestorRow,
): boolean {
  if (row.addedByIsCoSponsorOnDeal === true) {
    return coSponsorInterceptPassesDocumentsToInvestors(
      row.addedByCoSponsorEmailIntercept,
    )
  }
  return true
}

export function lpInvestorsIncludedWhenSharingWithSponsorUser(
  sponsorUserId: string,
  lpInvestors: DealInvestorRow[],
): DealInvestorRow[] {
  return lpInvestorsAddedBySponsorUserId(sponsorUserId, lpInvestors).filter(
    lpReceivesDocumentsSharedWithTheirSponsor,
  )
}

export function sponsorUserShareInterceptHoldsAtCoSponsor(
  sponsorUserId: string,
  lpInvestors: DealInvestorRow[],
): boolean {
  const added = lpInvestorsAddedBySponsorUserId(sponsorUserId, lpInvestors)
  if (added.length === 0) return false
  return added.some(
    (row) =>
      row.addedByIsCoSponsorOnDeal === true &&
      !coSponsorInterceptPassesDocumentsToInvestors(
        row.addedByCoSponsorEmailIntercept,
      ),
  )
}

export function buildSponsorPickerOptions(
  members: DealInvestorRow[],
): SponsorPickerOption[] {
  return members
    .map((m) => {
      const id = m.id?.trim() || ""
      const name = m.displayName?.trim() || "—"
      const email =
        m.userEmail?.trim() && m.userEmail !== "—" ? m.userEmail.trim() : ""
      if (!id) return null
      return {
        id,
        label: email ? `${name} (${email})` : name,
      }
    })
    .filter((x): x is SponsorPickerOption => x != null)
}

/** Shared With menu heading for sponsor-scoped LP audience. */
export const SPONSOR_USER_INVESTORS_MENU_LABEL = "Sponsor user investors"

export function sponsorAudienceSearchBlob(
  sponsorUserIds: string[],
  options: SponsorPickerOption[],
): string {
  const parts: string[] = ["sponsor user investors"]
  for (const id of sponsorUserIds) {
    const o = options.find((x) => x.id === id)
    if (o?.label) parts.push(o.label)
  }
  return parts.join(" ")
}

export type CoSponsorDocumentAudienceContext = {
  /** Portal user ids for the signed-in co-sponsor (session id + equivalent `addedByUserId`). */
  viewerUserIds: ReadonlySet<string>
  /** LP rows already scoped to this co-sponsor (GET investors?lp=1). */
  lpInvestors: DealInvestorRow[]
  dealClasses: DealInvestorClass[]
}

export function collectCoSponsorViewerUserIds(
  sessionUserId: string,
  lpInvestors: DealInvestorRow[],
): Set<string> {
  const ids = new Set<string>()
  const uid = sessionUserId.trim().toLowerCase()
  if (uid) ids.add(uid)
  for (const row of lpInvestors) {
    const adder = row.addedByUserId?.trim().toLowerCase()
    if (adder) ids.add(adder)
  }
  return ids
}

/** Portal / roster ids that match the signed-in lead or admin sponsor. */
export function collectLeadAdminViewerShareIds(
  sessionUserId: string,
  sessionEmail: string,
  sponsorRoster: DealInvestorRow[],
  lpInvestors: DealInvestorRow[],
): Set<string> {
  const ids = collectCoSponsorViewerUserIds(sessionUserId, [])
  const email = sessionEmail.trim().toLowerCase()
  for (const member of sponsorRoster) {
    const memberEmail = member.userEmail?.trim().toLowerCase() ?? ""
    const contactId = member.contactId?.trim().toLowerCase() ?? ""
    const matches =
      (contactId && ids.has(contactId)) ||
      (email && memberEmail && memberEmail === email) ||
      (member.id?.trim() && ids.has(member.id.trim().toLowerCase()))
    if (!matches) continue
    const portalId = resolveSponsorPortalUserId(member, lpInvestors)?.trim()
    if (portalId) ids.add(portalId.toLowerCase())
    if (contactId) ids.add(contactId)
    const rowId = member.id?.trim().toLowerCase()
    if (rowId) ids.add(rowId)
  }
  return ids
}

function investorRowMatchKeys(row: DealInvestorRow): string[] {
  return [
    row.id,
    row.contactId,
    row.profileId,
    row.userInvestorProfileId,
    row.offeringId,
  ]
    .map((v) => v?.trim().toLowerCase())
    .filter((v): v is string => Boolean(v))
}

function investorRowMatchesDealClass(
  row: DealInvestorRow,
  classId: string,
  dealClasses: DealInvestorClass[],
): boolean {
  const rowClass = row.investorClass?.trim()
  if (!rowClass || rowClass === "—") return false
  if (rowClass === classId) return true
  const cls = dealClasses.find((c) => c.id === classId)
  const className = cls?.name?.trim()
  return Boolean(className && rowClass === className)
}

function coSponsorLpMatchesSharedInvestorId(
  sharedId: string,
  lpInvestors: DealInvestorRow[],
): boolean {
  const target = sharedId.trim().toLowerCase()
  if (!target) return false
  for (const row of lpInvestors) {
    if (investorRowMatchKeys(row).includes(target)) return true
  }
  return false
}

/**
 * Workspace Documents tab: co-sponsors see files Shared With them (sponsor user)
 * or with their investors (row, class, All Investors, or their LP’s eSign PDF).
 */
export function nestedDocumentVisibleToCoSponsor(
  doc: NestedPreviewDocument,
  ctx: CoSponsorDocumentAudienceContext,
): boolean {
  for (const sponsorUid of doc.sharedSponsorUserIds ?? []) {
    const key = sponsorUid.trim().toLowerCase()
    if (key && ctx.viewerUserIds.has(key)) return true
  }

  const esignRowId = doc.esignInvestorRowId?.trim().toLowerCase()
  if (esignRowId && coSponsorLpMatchesSharedInvestorId(esignRowId, ctx.lpInvestors)) {
    return true
  }

  if (doc.sharedWithAllInvestors) return true

  for (const id of doc.sharedInvestorIds ?? []) {
    if (coSponsorLpMatchesSharedInvestorId(id, ctx.lpInvestors)) return true
  }

  for (const classId of doc.sharedDealClassIds ?? []) {
    for (const row of ctx.lpInvestors) {
      if (investorRowMatchesDealClass(row, classId, ctx.dealClasses)) return true
    }
  }

  return false
}

export function nestedDocumentIdsFromPreviewJson(
  json: string | null | undefined,
): Set<string> {
  const ids = new Set<string>()
  if (!json?.trim()) return ids
  try {
    const parsed = JSON.parse(json) as { sections?: unknown }
    const sections = Array.isArray(parsed.sections) ? parsed.sections : []
    for (const s of sections) {
      if (s == null || typeof s !== "object" || Array.isArray(s)) continue
      const nested = (s as { nestedDocuments?: unknown }).nestedDocuments
      if (!Array.isArray(nested)) continue
      for (const d of nested) {
        if (d == null || typeof d !== "object" || Array.isArray(d)) continue
        const id = String((d as { id?: unknown }).id ?? "").trim()
        if (id) ids.add(id)
      }
    }
  } catch {
    /* ignore */
  }
  return ids
}

export function filterDocumentSectionsForCoSponsor(
  sections: OfferingPreviewSection[],
  ctx: CoSponsorDocumentAudienceContext,
  opts?: { alwaysVisibleDocumentIds?: ReadonlySet<string> },
): OfferingPreviewSection[] {
  const alwaysVisible = opts?.alwaysVisibleDocumentIds
  return sections
    .map((s) => ({
      ...s,
      nestedDocuments: (s.nestedDocuments ?? []).filter((d) => {
        const id = d.id?.trim()
        if (id && alwaysVisible?.has(id)) return true
        return nestedDocumentVisibleToCoSponsor(d, ctx)
      }),
    }))
    .filter(
      (s) =>
        s.nestedDocuments.length > 0 || isBuiltInDocumentSection(s),
    )
}

export type LeadAdminDocumentAudienceContext = {
  viewerUserIds: ReadonlySet<string>
}

/**
 * Lead / admin sponsors do not see co-sponsor uploads unless that file is
 * Shared With their sponsor user.
 */
export function nestedDocumentVisibleToLeadOrAdminSponsor(
  doc: NestedPreviewDocument,
  ctx: LeadAdminDocumentAudienceContext,
): boolean {
  if (doc.uploadedByIsCoSponsor !== true) return true
  for (const sponsorUid of doc.sharedSponsorUserIds ?? []) {
    const key = sponsorUid.trim().toLowerCase()
    if (key && ctx.viewerUserIds.has(key)) return true
  }
  return false
}

export function filterDocumentSectionsForLeadOrAdminSponsor(
  sections: OfferingPreviewSection[],
  ctx: LeadAdminDocumentAudienceContext,
): OfferingPreviewSection[] {
  return sections
    .map((s) => ({
      ...s,
      nestedDocuments: (s.nestedDocuments ?? []).filter((d) =>
        nestedDocumentVisibleToLeadOrAdminSponsor(d, ctx),
      ),
    }))
    .filter(
      (s) => s.nestedDocuments.length > 0 || isBuiltInDocumentSection(s),
    )
}

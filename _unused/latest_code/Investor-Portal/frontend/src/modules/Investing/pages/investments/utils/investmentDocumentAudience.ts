import type { DealInvestorClass } from "@/modules/Syndication/Deals/types/deal-investor-class.types"
import type { DealInvestorRow } from "@/modules/Syndication/Deals/types/deal-investors.types"
import { investorEsignIsFullyCompletedForRow } from "@/modules/Syndication/Deals/utils/investorEsignStatus"
import { lpReceivesDocumentsSharedWithTheirSponsor } from "@/modules/Syndication/Deals/utils/offeringPreviewDocumentAudience"
import {
  FUNDING_INFORMATION_DOCUMENTS_SECTION_ID,
  isFundingInstructionsAutoPdfDocument,
  isInvestorEsignWorkspaceDocument,
  type NestedPreviewDocument,
} from "@/modules/Syndication/Deals/utils/offeringPreviewDocSections"

export type InvestmentDocumentAudienceContext = {
  viewerRows: DealInvestorRow[]
  dealClasses: DealInvestorClass[]
  /** All investor row ids for this viewer (email match), for Shared With id resolution. */
  viewerInvestorIds: ReadonlySet<string>
  /** Portal `users.id` for the signed-in viewer (co-sponsor Shared With). */
  viewerUserId?: string
}

export const EMPTY_INVESTMENT_DOCUMENT_AUDIENCE: InvestmentDocumentAudienceContext =
  {
    viewerRows: [],
    dealClasses: [],
    viewerInvestorIds: new Set(),
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

function hasExplicitDocumentAudience(doc: NestedPreviewDocument): boolean {
  if (doc.sharedDealClassIds.length > 0) return true
  if (doc.sharedInvestorIds.length > 0) return true
  if ((doc.sharedSponsorUserIds?.length ?? 0) > 0) return true
  if (doc.sharedWithAllInvestors) return true
  return false
}

function viewerMatchesSharedInvestorId(
  sharedId: string,
  ctx: InvestmentDocumentAudienceContext,
): boolean {
  const target = sharedId.trim()
  if (!target) return false
  if (ctx.viewerInvestorIds.has(target)) return true
  for (const row of ctx.viewerRows) {
    for (const raw of [
      row.id,
      row.contactId,
      row.profileId,
      row.userInvestorProfileId,
      row.offeringId,
    ]) {
      if (raw?.trim() === target) return true
    }
  }
  return false
}

/** True when this login has finished eSign for at least one commitment on the deal. */
function viewerHasCompletedEsign(
  viewerRows: InvestmentDocumentAudienceContext["viewerRows"],
): boolean {
  for (const row of viewerRows) {
    if (investorEsignIsFullyCompletedForRow(row)) return true
  }
  return false
}

function fundingDocumentRequiresEsignCompletion(
  doc: NestedPreviewDocument,
): boolean {
  if (doc.requiresProfileInvestment) return true
  if (isFundingInstructionsAutoPdfDocument(doc)) return true
  return (
    doc.lpDisplaySectionId?.trim() === FUNDING_INFORMATION_DOCUMENTS_SECTION_ID
  )
}

/**
 * LP portal access after Visibility already allows the surface.
 * Empty Shared With → every signed-in investor on the deal.
 * When Shared With is set, only those recipients (or All Investors / class / sponsor).
 */
export function nestedDocumentVisibleToInvestor(
  doc: NestedPreviewDocument,
  ctx: InvestmentDocumentAudienceContext,
): boolean {
  if (isInvestorEsignWorkspaceDocument(doc)) return false

  if (
    fundingDocumentRequiresEsignCompletion(doc) &&
    !viewerHasCompletedEsign(ctx.viewerRows)
  ) {
    return false
  }
  if (!hasExplicitDocumentAudience(doc)) return true
  if (doc.sharedWithAllInvestors) return true

  const { viewerRows, dealClasses } = ctx

  for (const id of doc.sharedInvestorIds) {
    if (viewerMatchesSharedInvestorId(id, ctx)) return true
  }

  for (const classId of doc.sharedDealClassIds) {
    for (const row of viewerRows) {
      if (investorRowMatchesDealClass(row, classId, dealClasses)) return true
    }
  }

  for (const sponsorUid of doc.sharedSponsorUserIds ?? []) {
    const key = sponsorUid.trim().toLowerCase()
    if (!key) continue
    const viewerUid = ctx.viewerUserId?.trim().toLowerCase()
    if (viewerUid && viewerUid === key) return true
    for (const row of viewerRows) {
      if (row.addedByUserId?.trim().toLowerCase() === key) {
        if (lpReceivesDocumentsSharedWithTheirSponsor(row)) return true
        continue
      }
      if (row.contactId?.trim().toLowerCase() === key) return true
    }
  }

  return false
}

/** True when Shared With has at least one class, investor, sponsor, or All Investors. */
export function documentHasSharedWithAudience(
  doc: NestedPreviewDocument,
): boolean {
  return hasExplicitDocumentAudience(doc)
}

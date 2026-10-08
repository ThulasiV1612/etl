import {
  effectiveDocumentSharedWithScope,
  isEsignTemplateDocumentsSection,
  isInvestorEsignWorkspaceDocument,
  isInvestorOfferingDocumentSectionExcluded,
  offeringPreviewDocumentExcludedFromInvestorOffering,
  readDealDocumentSectionsForWorkspace,
  resolveFlatDocumentSharedWithScope,
  sectionDisplayLabel,
  sectionSharedWithDisplay,
  sectionVisibleOnOfferingPreview,
  type SectionSharedWithScope,
} from "@/modules/Syndication/Deals/utils/offeringPreviewDocSections"
import { readOfferingPreviewDocuments } from "@/modules/Syndication/Deals/utils/offeringPreviewDocuments"
import type { NestedPreviewDocument, OfferingPreviewSection } from "@/modules/Syndication/Deals/utils/offeringPreviewDocSections"
import type { InvestmentDocumentAudienceContext } from "./investmentDocumentAudience"
import {
  EMPTY_INVESTMENT_DOCUMENT_AUDIENCE,
  nestedDocumentVisibleToInvestor,
} from "./investmentDocumentAudience"

export type InvestmentDetailDocumentRow = {
  id: string
  name: string
  url: string | null
  dateAdded: string
  /** ISO time Shared With was last set, when known. */
  sharedAt?: string
  sectionLabel: string
  /** How this file is exposed on the deal Documents tab. */
  visibilityLabel: string
  source: "assigned" | "offering_link" | "esign"
  /** Pending eSign — show Sign action (opens in-page modal). */
  canSign?: boolean
  /** Dropbox Sign request for this profile send. */
  signatureRequestId?: string
  /** eSign template profile (individual, joint_tenancy, …). */
  categoryId?: string
  /** Per-document signature state (E-signatures sub-tab only). */
  esignStatus?: "pending" | "signed"
}

export type InvestmentDetailDocumentSectionGroup = {
  sectionId: string
  sectionLabel: string
  documents: InvestmentDetailDocumentRow[]
  /** Total files in this section on the deal (before investor filtering). */
  totalOnDeal: number
}

/** LP portal: signed-in investors see Offering link + LP portal only scoped files. */
const LP_PORTAL_DOCUMENT_CTX = {
  isPublicAnonymousOffering: false,
  isLpDealWorkspace: true,
} as const

export { EMPTY_INVESTMENT_DOCUMENT_AUDIENCE }

/** Offering Documents tab: exclude Investor e signatures and apply search. */
export function filterInvestorOfferingDocumentSectionGroups(
  sections: InvestmentDetailDocumentSectionGroup[],
  query: string,
): InvestmentDetailDocumentSectionGroup[] {
  const q = query.trim().toLowerCase()
  return sections
    .filter(
      (section) =>
        !isInvestorOfferingDocumentSectionExcluded(
          section.sectionId,
          section.sectionLabel,
        ),
    )
    .filter((section) => section.totalOnDeal > 0)
    .map((section) => {
      if (!q) return section
      const sectionLabelMatches = section.sectionLabel.toLowerCase().includes(q)
      const documents = section.documents.filter((d) => {
        const blob = [d.name, d.sectionLabel, section.sectionLabel]
          .join(" ")
          .toLowerCase()
        return blob.includes(q)
      })
      if (sectionLabelMatches) return section
      return { ...section, documents }
    })
    .filter((section) => {
      if (!q) return section.documents.length > 0
      return (
        section.documents.length > 0 ||
        section.sectionLabel.toLowerCase().includes(q)
      )
    })
}

function sortDocumentsByName(
  a: InvestmentDetailDocumentRow,
  b: InvestmentDetailDocumentRow,
): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" })
}

function pushRow(
  out: InvestmentDetailDocumentRow[],
  args: {
    id: string
    name: string
    url: string | null
    dateAdded: string
    sharedAt?: string
    sectionLabel: string
    scope: SectionSharedWithScope
  },
): void {
  const scope = args.scope
  const source: InvestmentDetailDocumentRow["source"] =
    scope === "offering_page" ? "offering_link" : "assigned"
  out.push({
    id: args.id,
    name: args.name,
    url: args.url,
    dateAdded: args.dateAdded,
    ...(args.sharedAt ? { sharedAt: args.sharedAt } : {}),
    sectionLabel: args.sectionLabel,
    visibilityLabel: sectionSharedWithDisplay(scope),
    source,
  })
}

function documentVisibleToInvestorOnLpPortal(
  doc: NestedPreviewDocument,
  sec: OfferingPreviewSection,
  audience: InvestmentDocumentAudienceContext,
): boolean {
  const scope = effectiveDocumentSharedWithScope(doc, sec)
  if (!sectionVisibleOnOfferingPreview(scope, LP_PORTAL_DOCUMENT_CTX)) return false
  return nestedDocumentVisibleToInvestor(doc, audience)
}

function readDocumentSectionsForInvestorListing(dealId: string) {
  return readDealDocumentSectionsForWorkspace(dealId)
}

/**
 * Deal Documents tab (sponsor uploads): files this investor may see, grouped by
 * section in the same order as the syndication Documents tab.
 */
export function listInvestmentDetailDocumentSectionGroups(
  dealId: string,
  audience: InvestmentDocumentAudienceContext,
): InvestmentDetailDocumentSectionGroup[] {
  const id = dealId?.trim() ?? ""
  if (!id) return []

  const groups: InvestmentDetailDocumentSectionGroup[] = []

  const sections = readDocumentSectionsForInvestorListing(id)
  for (const sec of sections) {
    const sl = sectionDisplayLabel(sec)
    if (
      isEsignTemplateDocumentsSection(sec) ||
      isInvestorOfferingDocumentSectionExcluded(sec.id, sl)
    ) {
      continue
    }
    const rows: InvestmentDetailDocumentRow[] = []
    const nestedOnDeal = sec.nestedDocuments.filter(
      (d) => !isInvestorEsignWorkspaceDocument(d),
    )
    const totalOnDeal = nestedOnDeal.length
    for (const d of nestedOnDeal) {
      if (!documentVisibleToInvestorOnLpPortal(d, sec, audience)) continue
      const scope = effectiveDocumentSharedWithScope(d, sec)
      pushRow(rows, {
        id: d.id,
        name: d.name,
        url: d.url,
        dateAdded: d.dateAdded?.trim() || "—",
        ...(d.sharedAt ? { sharedAt: d.sharedAt } : {}),
        sectionLabel: sl,
        scope,
      })
    }
    if (totalOnDeal > 0) {
      groups.push({
        sectionId: sec.id,
        sectionLabel: sl,
        documents: rows.sort(sortDocumentsByName),
        totalOnDeal,
      })
    }
  }

  if (groups.length === 0) {
    const legacyRows: InvestmentDetailDocumentRow[] = []
    const seenLegacyIds = new Set<string>()
    for (const d of readOfferingPreviewDocuments(id)) {
      if (seenLegacyIds.has(d.id)) continue
      if (offeringPreviewDocumentExcludedFromInvestorOffering(d, sections)) continue
      const scope = resolveFlatDocumentSharedWithScope(d.sharedWithScope)
      if (!sectionVisibleOnOfferingPreview(scope, LP_PORTAL_DOCUMENT_CTX)) continue
      const legacyDoc: NestedPreviewDocument = {
        id: d.id,
        name: d.name,
        url: d.url,
        dateAdded: d.dateAdded ?? "—",
        lpDisplaySectionId: "",
        sharedDealClassIds: [],
        sharedInvestorIds: [],
        sharedWithAllInvestors: false,
        sharedSponsorUserIds: [],
        sharedWithScope: scope,
      }
      if (!nestedDocumentVisibleToInvestor(legacyDoc, audience)) continue
      seenLegacyIds.add(d.id)
      pushRow(legacyRows, {
        id: d.id,
        name: d.name,
        url: d.url,
        dateAdded: d.dateAdded?.trim() || "—",
        sectionLabel: "Documents",
        scope,
      })
    }
    if (legacyRows.length > 0) {
      groups.push({
        sectionId: "legacy-documents",
        sectionLabel: "Documents",
        documents: legacyRows.sort(sortDocumentsByName),
        totalOnDeal: legacyRows.length,
      })
    }
  }

  return groups
}

/**
 * Flat list of offering documents for this investor (all sections combined).
 */
export function listDocumentsForInvestmentDetail(
  dealId: string,
  audience: InvestmentDocumentAudienceContext,
): {
  assigned: InvestmentDetailDocumentRow[]
  offeringLink: InvestmentDetailDocumentRow[]
  all: InvestmentDetailDocumentRow[]
} {
  const allRows = listInvestmentDetailDocumentSectionGroups(dealId, audience).flatMap(
    (g) => g.documents,
  )
  const assigned = allRows.filter((r) => r.source === "assigned")
  const offeringLink = allRows.filter((r) => r.source === "offering_link")

  return {
    assigned: assigned.sort(sortDocumentsByName),
    offeringLink: offeringLink.sort(sortDocumentsByName),
    all: [...allRows].sort(sortDocumentsByName),
  }
}

export function dealHasOfferingDocumentsOnDeal(dealId: string): boolean {
  const id = dealId?.trim() ?? ""
  if (!id) return false
  const sections = readDocumentSectionsForInvestorListing(id)
  for (const section of sections) {
    if (isEsignTemplateDocumentsSection(section)) continue
    if (
      section.nestedDocuments.some((doc) => !isInvestorEsignWorkspaceDocument(doc))
    ) {
      return true
    }
  }
  for (const doc of readOfferingPreviewDocuments(id)) {
    if (offeringPreviewDocumentExcludedFromInvestorOffering(doc, sections)) {
      continue
    }
    return true
  }
  return false
}

export function dealHasOfferingDocumentSections(dealId: string): boolean {
  return dealHasOfferingDocumentsOnDeal(dealId)
}

import { readOfferingPreviewDocuments } from "@/modules/Syndication/Deals/utils/offeringPreviewDocuments"
import {
  effectiveDocumentSharedWithScope,
  isEsignTemplateDocumentsSection,
  isInvestorEsignWorkspaceDocument,
  offeringPreviewDocumentExcludedFromInvestorOffering,
  readOfferingPreviewSections,
  resolveFlatDocumentSharedWithScope,
  sectionDisplayLabel,
  sectionSharedWithDisplay,
  sectionVisibleOnOfferingPreview,
} from "@/modules/Syndication/Deals/utils/offeringPreviewDocSections"

export interface LpDealDocumentRow {
  id: string
  name: string
  url: string | null
  sectionLabel: string
  sharedWithLabel: string
}

/**
 * Resolves document rows for LP portal: nested sections + legacy flat list.
 * Logged-in LPs see both Offering page and LP-only scoped sections.
 */
export function listDocumentsForLpDealPage(dealId: string): LpDealDocumentRow[] {
  const id = dealId.trim()
  if (!id) return []
  const sections = readOfferingPreviewSections(id)
  const out: LpDealDocumentRow[] = []
  const lpPortalCtx = {
    isPublicAnonymousOffering: false,
    isLpDealWorkspace: true,
  }
  for (const sec of sections) {
    if (isEsignTemplateDocumentsSection(sec)) continue
    const sl = sectionDisplayLabel(sec)
    for (const d of sec.nestedDocuments) {
      if (isInvestorEsignWorkspaceDocument(d)) continue
      const scope = effectiveDocumentSharedWithScope(d, sec)
      if (!sectionVisibleOnOfferingPreview(scope, lpPortalCtx)) continue
      out.push({
        id: d.id,
        name: d.name,
        url: d.url,
        sectionLabel: sl,
        sharedWithLabel: sectionSharedWithDisplay(
          effectiveDocumentSharedWithScope(d, sec),
        ),
      })
    }
  }
  if (out.length > 0) return out
  for (const d of readOfferingPreviewDocuments(id)) {
    if (offeringPreviewDocumentExcludedFromInvestorOffering(d, sections)) continue
    const scope = resolveFlatDocumentSharedWithScope(d.sharedWithScope)
    if (!sectionVisibleOnOfferingPreview(scope, lpPortalCtx)) continue
    out.push({
      id: d.id,
      name: d.name,
      url: d.url,
      sectionLabel: "Documents",
      sharedWithLabel: sectionSharedWithDisplay(scope),
    })
  }
  return out
}

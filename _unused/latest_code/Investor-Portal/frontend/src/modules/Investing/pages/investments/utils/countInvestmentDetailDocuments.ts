import { fetchDealMyEsignDocuments } from "@/modules/Syndication/Deals/api/dealsApi"
import { buildInvestmentDocumentAudience } from "./buildInvestmentDocumentAudience"
import {
  filterInvestorOfferingDocumentSectionGroups,
  listInvestmentDetailDocumentSectionGroups,
} from "./investmentDetailDocuments"
import { refreshInvestmentDealDocumentsPreview } from "./refreshInvestmentDealDocumentsPreview"

/**
 * Count of files the investor can see on the investment Documents tab
 * (shared documents + e-sign files).
 */
export async function countVisibleDocumentsForInvestmentDetail(
  dealId: string,
): Promise<number> {
  const id = dealId.trim()
  if (!id) return 0

  await refreshInvestmentDealDocumentsPreview(id)

  let offeringCount = 0
  try {
    const audience = await buildInvestmentDocumentAudience(id)
    offeringCount = filterInvestorOfferingDocumentSectionGroups(
      listInvestmentDetailDocumentSectionGroups(id, audience),
      "",
    ).reduce((n, section) => n + section.documents.length, 0)
  } catch {
    offeringCount = 0
  }

  let esignCount = 0
  try {
    const esign = await fetchDealMyEsignDocuments(id)
    esignCount = Array.isArray(esign.documents) ? esign.documents.length : 0
  } catch {
    esignCount = 0
  }

  return offeringCount + esignCount
}

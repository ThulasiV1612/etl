import {
  fetchDealById,
  fetchDealOfferingInvestorPreviewJson,
} from "@/modules/Syndication/Deals/api/dealsApi"
import { dealHasOfferingDocumentsOnDeal } from "./investmentDetailDocuments"
import { syncInvestmentDealDocumentPreview } from "./syncInvestmentDealDocumentPreview"

export type RefreshInvestmentDocumentsPreviewResult = {
  /** Server fetch succeeded and preview was applied (or deal had no JSON). */
  syncedFromServer: boolean
  /** At least one document exists on the deal Documents tab after refresh. */
  hasSections: boolean
}

function applyServerOfferingPreview(
  dealId: string,
  offeringInvestorPreviewJson: string,
): void {
  syncInvestmentDealDocumentPreview(dealId, offeringInvestorPreviewJson, {
    notify: false,
  })
}

async function resolveOfferingInvestorPreviewJsonFromServer(
  dealId: string,
): Promise<{ json: string | null; synced: boolean }> {
  try {
    const fromPreview = await fetchDealOfferingInvestorPreviewJson(dealId)
    if (fromPreview?.trim()) {
      return { json: fromPreview.trim(), synced: true }
    }
  } catch {
    /* try full deal row next */
  }

  try {
    const deal = await fetchDealById(dealId)
    const fromDeal = deal.offeringInvestorPreviewJson
    return {
      json: fromDeal?.trim() ? fromDeal.trim() : null,
      synced: true,
    }
  } catch {
    return { json: null, synced: false }
  }
}

/**
 * Hydrate offering document sections from the deal row. Replaces any stale in-memory
 * preview cache so investor sections match what the sponsor saved on the Documents tab.
 */
export async function refreshInvestmentDealDocumentsPreview(
  dealId: string | null | undefined,
): Promise<RefreshInvestmentDocumentsPreviewResult> {
  const id = dealId?.trim() ?? ""
  if (!id) return { syncedFromServer: false, hasSections: false }

  const { json, synced } = await resolveOfferingInvestorPreviewJsonFromServer(id)

  if (json) {
    applyServerOfferingPreview(id, json)
  }

  return {
    syncedFromServer: synced,
    hasSections: dealHasOfferingDocumentsOnDeal(id),
  }
}

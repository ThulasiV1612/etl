import { applyOfferingInvestorPreviewJsonFromServer } from "@/modules/Syndication/Deals/utils/offeringPreviewServerState"
import { clearOfferingPreviewRuntime } from "@/modules/Syndication/Deals/utils/offeringPreviewRuntimeStore"

/** Hydrate local document sections from server `offeringInvestorPreviewJson`. */
export function syncInvestmentDealDocumentPreview(
  dealId: string,
  offeringInvestorPreviewJson: string | null | undefined,
  opts?: { notify?: boolean },
): void {
  const id = dealId?.trim() ?? ""
  if (!id) return
  const json = offeringInvestorPreviewJson?.trim()
  if (!json) return
  clearOfferingPreviewRuntime(id)
  applyOfferingInvestorPreviewJsonFromServer(id, json, opts)
}

import type { DealDetailApi } from "@/modules/Syndication/Deals/api/dealsApi"
import { canInvestorCommitInvestOrOnboard } from "@/modules/Syndication/Deals/constants/deal-lifecycle"
import { isCapitalRaisingDealStage } from "@/modules/Syndication/Deals/constants/deal-lifecycle/deal-stage-status-map"

/** Matches backend `evaluateLpInvestNowEligibility` for LP Invest Now CTAs. */
export function canLpInvestNowOnDeal(
  deal: Pick<DealDetailApi, "dealStage" | "offeringStatus"> | null | undefined,
): boolean {
  if (!deal) return false
  if (!isCapitalRaisingDealStage(deal.dealStage)) return false
  return canInvestorCommitInvestOrOnboard({
    dealStage: deal.dealStage,
    offeringStatus: deal.offeringStatus,
  })
}

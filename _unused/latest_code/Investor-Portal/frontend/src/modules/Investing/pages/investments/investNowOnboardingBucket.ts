import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import type { DealInvestorsPayload } from "@/modules/Syndication/Deals/types/deal-investors.types"
import {
  dealHasFullyCompletedProfileEsign,
  dealHasInvestNowDraftForViewer,
} from "@/modules/Investing/pages/invest/investNowDraftUtils"
import { viewerDealNeedsOnboarding } from "@/modules/Investing/utils/investingViewerDealScope"
import type { InvestmentOnboardingBucket } from "./investments.types"

/**
 * Deal-level tab bucket for the investments list.
 * Active (`in_progress`): at least one profile fully completed e-sign (deal stays here
 * even if another profile is still a draft).
 * Pending: invited or draft only when no profile has fully completed e-sign yet.
 */
export function resolveDealOnboardingBuckets(
  payload: DealInvestorsPayload,
  viewerEmailNorm?: string,
): InvestmentOnboardingBucket[] {
  const em =
    viewerEmailNorm?.trim().toLowerCase() ||
    getSessionUserEmail()?.trim().toLowerCase() ||
    ""
  if (!em) return []

  if (dealHasFullyCompletedProfileEsign(payload.investors, em)) {
    return ["in_progress"]
  }

  const invited = viewerDealNeedsOnboarding(payload, em)
  const draft = dealHasInvestNowDraftForViewer(payload.investors, em)
  if (invited || draft) return ["pending"]
  return []
}

export function primaryOnboardingBucket(
  buckets: InvestmentOnboardingBucket[],
): InvestmentOnboardingBucket {
  if (buckets.includes("in_progress")) return "in_progress"
  return "pending"
}

import type {
  DealInvestorRow,
  DealInvestorsPayload,
} from "@/modules/Syndication/Deals/types/deal-investors.types"
import type { DealRecord } from "@/modules/Syndication/dealsDashboardUtils"
import type { DealListRow } from "@/modules/Syndication/Deals/types/deals.types"
import {
  effectiveOfferingStatusForAccess,
  getDealStatusRules,
  isInvestorDashboardOpportunityOffering,
} from "@/modules/Syndication/Deals/constants/deal-lifecycle"
import { parseMoneyDigits } from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"
import { dealHasFullyCompletedProfileEsign } from "@/modules/Investing/pages/invest/investNowDraftUtils"
import {
  viewerDealHasStartedInvestment,
  viewerDealNeedsOnboarding,
} from "@/modules/Investing/utils/investingViewerDealScope"

export type InvestingDashboardDealBucket =
  | "all"
  | "active"
  | "in_progress"
  | "coming_soon"

/** Classified deal buckets (excludes the aggregate `all` tab). */
export type InvestingDashboardClassifiedDealBucket = Exclude<
  InvestingDashboardDealBucket,
  "all"
>

/** Tab order on the investor dashboard deals block. */
export const INVESTING_DASHBOARD_DEAL_TAB_ORDER: readonly InvestingDashboardDealBucket[] =
  ["all", "active", "in_progress", "coming_soon"]

export type InvestingDashboardDealsByBucket = Record<
  InvestingDashboardClassifiedDealBucket,
  DealRecord[]
>

export function isInvestingDashboardComingSoonDeal(
  row: Pick<DealListRow, "offeringStatus" | "dealStage">,
): boolean {
  const effective = effectiveOfferingStatusForAccess(
    row.dealStage,
    row.offeringStatus,
  )
  if (!effective) return false
  return getDealStatusRules(effective).status === "coming_soon"
}

export function isInvestingDashboardOpportunityDeal(
  row: Pick<DealListRow, "offeringStatus" | "dealStage">,
): boolean {
  return isInvestorDashboardOpportunityOffering(
    row.dealStage,
    row.offeringStatus,
  )
}

/** Not yet GP countersigned or complete; not inactive / draft / past / closed. */
const EXCLUDE_FROM_IN_PROGRESS: ReadonlySet<string> = new Set([
  "Counter-signed",
  "Funding instructions sent",
  "Funds fully received (complete)",
  "Inactive (bought out, assigned, or sold)",
  "Canceled (did not complete)",
  "Draft (hidden to investors)",
  "Past (hidden)",
  "Closed (no new investments allowed)",
  "Coming soon (no new investments allowed)",
])

const ACTIVE_INVESTMENT_STATUSES: ReadonlySet<string> = new Set([
  "Counter-signed",
  "Funding instructions sent",
  "Funds fully received (complete)",
])

/**
 * Committed $ on one row when the investment is active and the GP has not
 * countersigned yet (matches dashboard “Total in-progress”).
 */
export function inProgressNotCountersignedCommittedOnRow(
  row: DealInvestorRow,
): number {
  const status = String(row.status ?? "").trim()
  if (!status || status === "—" || EXCLUDE_FROM_IN_PROGRESS.has(status))
    return 0
  const n = parseMoneyDigits(String(row.committed ?? ""))
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

function activeCountersignedCommittedOnRow(row: DealInvestorRow): number {
  const status = String(row.status ?? "").trim()
  if (!status || status === "—" || !ACTIVE_INVESTMENT_STATUSES.has(status))
    return 0
  const n = parseMoneyDigits(String(row.committed ?? ""))
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

function rowMatchesViewer(row: DealInvestorRow, viewerEmailNorm: string): boolean {
  const em = String(row.userEmail ?? "").trim().toLowerCase()
  return Boolean(em && em !== "—" && em === viewerEmailNorm)
}

/** Sum of in-progress (not countersigned) committed $ for the signed-in LP on a deal. */
export function inProgressNotCountersignedForViewer(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): number {
  if (!viewerEmailNorm) return 0
  let sum = 0
  for (const inv of payload.investors) {
    if (!rowMatchesViewer(inv, viewerEmailNorm)) continue
    sum += inProgressNotCountersignedCommittedOnRow(inv)
  }
  return sum
}

/** Sum of countersigned / post-signature committed $ for the signed-in LP on a deal. */
export function activeCountersignedCommittedForViewer(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): number {
  if (!viewerEmailNorm) return 0
  let sum = 0
  for (const inv of payload.investors) {
    if (!rowMatchesViewer(inv, viewerEmailNorm)) continue
    sum += activeCountersignedCommittedOnRow(inv)
  }
  return sum
}

/** True when the viewer has finished e-sign for at least one profile on this deal. */
export function viewerHasActiveDealEsignCompletion(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): boolean {
  return dealHasFullyCompletedProfileEsign(payload.investors, viewerEmailNorm)
}

/**
 * Dashboard deal cards: active (e-sign complete for ≥1 profile, or GP
 * countersigned) and in-progress (onboarding / Invest Now not yet signed).
 * Coming soon is preview-only opportunities (Investment Opportunities tab) until the
 * investor has started committing or signing.
 */
function viewerHasInvestmentActivityOnDeal(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): boolean {
  return (
    viewerHasActiveDealEsignCompletion(payload, viewerEmailNorm) ||
    activeCountersignedCommittedForViewer(payload, viewerEmailNorm) > 0 ||
    inProgressNotCountersignedForViewer(payload, viewerEmailNorm) > 0 ||
    viewerDealHasStartedInvestment(payload, viewerEmailNorm)
  )
}

export function classifyInvestingDashboardDealBucket(
  row: Pick<DealListRow, "offeringStatus" | "dealStage">,
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): InvestingDashboardClassifiedDealBucket | null {
  if (!viewerEmailNorm) return null

  const isOpportunity = isInvestingDashboardOpportunityDeal(row)
  const hasActivity = viewerHasInvestmentActivityOnDeal(payload, viewerEmailNorm)

  if (isOpportunity && !hasActivity) return "coming_soon"

  if (viewerHasActiveDealEsignCompletion(payload, viewerEmailNorm)) {
    return "active"
  }
  if (activeCountersignedCommittedForViewer(payload, viewerEmailNorm) > 0) {
    return "active"
  }
  if (inProgressNotCountersignedForViewer(payload, viewerEmailNorm) > 0) {
    return "in_progress"
  }
  if (viewerDealHasStartedInvestment(payload, viewerEmailNorm)) {
    return "in_progress"
  }
  if (viewerDealNeedsOnboarding(payload, viewerEmailNorm)) {
    return "in_progress"
  }
  if (isOpportunity) return "coming_soon"
  if (!hasActivity) {
    const effective = effectiveOfferingStatusForAccess(
      row.dealStage,
      row.offeringStatus,
    )
    if (effective && getDealStatusRules(effective).allowDashboardVisibility) {
      return "coming_soon"
    }
  }
  return null
}

/**
 * Platform admin in investing mode has no LP activity — bucket by offering status only
 * so opportunity deals appear under Opportunities, not Active.
 */
export function classifyInvestingDashboardDealBucketForPlatformAdmin(
  row: Pick<DealListRow, "offeringStatus" | "dealStage">,
): InvestingDashboardClassifiedDealBucket {
  if (isInvestingDashboardOpportunityDeal(row)) return "coming_soon"
  return "active"
}

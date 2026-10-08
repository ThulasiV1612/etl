import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import { inProgressNotCountersignedForViewer } from "@/modules/Investing/pages/dashboard/investingDashboardDealBucket"
import { applyLpSessionDealIdScope, filterDealListRowsVisibleToInvestors } from "@/modules/Investing/utils/investingViewerDealScope"
import { fetchMyDistributions } from "@/modules/Syndication/Deals/distribution-setup/api/myDistributionsApi"
import { fetchDealInvestors, fetchDealsList } from "@/modules/Syndication/Deals/api/dealsApi"
import { formatUsdDashboardAmount } from "@/modules/Syndication/Deals/dealsDashboardMoney"
import type { DealInvestorsPayload } from "@/modules/Syndication/Deals/types/deal-investors.types"
import { parseMoneyDigits } from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"

export interface InvestingDashboardMetrics {
  /** Deals in investing scope where you have committed capital (includes sponsor-archived). */
  dealCount: number
  totalInvestedDisplay: string
  totalDistributedDisplay: string
  /**
   * LP: sum of your committed $ on investment rows that are not counter-signed
   * (or complete / inactive) — see `loadInvestingDashboardMetrics` filters.
   * Non-LP: sum of per-deal list “Total in-progress” fields.
   */
  totalInProgressDisplay: string
}

function formatInvestingMoney(n: number): string {
  const x = Number.isFinite(n) ? n : 0
  if (x === 0) return "$0"
  return formatUsdDashboardAmount(x)
}

/**
 * Sum committed amounts for investor rows belonging to the signed-in LP (email match).
 * Used instead of deal-wide KPI / full roster totals on the investing home dashboard.
 */
function committedAmountForViewerLpRows(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): number {
  if (!viewerEmailNorm) return 0
  let sum = 0
  for (const inv of payload.investors) {
    const em = String(inv.userEmail ?? "").trim().toLowerCase()
    if (!em || em === "—" || em !== viewerEmailNorm) continue
    const n = parseMoneyDigits(String(inv.committed ?? ""))
    if (Number.isFinite(n)) sum += n
  }
  return sum
}

/**
 * KPIs for investing home: only the signed-in user’s exposure (committed, in
 * progress, and distribution payments), on deals in scope. Deal count = active deals
 * with your committed amount &gt; 0.
 */
export async function loadInvestingDashboardMetrics(): Promise<InvestingDashboardMetrics> {
  const viewerEmail = getSessionUserEmail()
  const lpEmailNorm = String(viewerEmail ?? "").trim().toLowerCase()
  if (!lpEmailNorm) {
    return {
      dealCount: 0,
      totalInvestedDisplay: formatInvestingMoney(0),
      totalDistributedDisplay: formatInvestingMoney(0),
      totalInProgressDisplay: formatInvestingMoney(0),
    }
  }

  const list = filterDealListRowsVisibleToInvestors(
    applyLpSessionDealIdScope(
      await fetchDealsList({ includeParticipantDeals: true }),
    ),
  )
  const active = list
  if (active.length === 0) {
    return {
      dealCount: 0,
      totalInvestedDisplay: formatInvestingMoney(0),
      totalDistributedDisplay: formatInvestingMoney(0),
      totalInProgressDisplay: formatInvestingMoney(0),
    }
  }

  const [perDeal, myDistributions] = await Promise.all([
    Promise.all(
      active.map(async (row) => {
        const payload = await fetchDealInvestors(row.id, {
          lpInvestorsOnly: false,
        })
        return { row, payload }
      }),
    ),
    fetchMyDistributions().catch(() => ({
      distributions: [],
      totalPayment: "0",
    })),
  ])

  let sumInvested = 0
  let sumInProgress = 0
  let myDealCount = 0

  for (const { payload } of perDeal) {
    const myCommitted = committedAmountForViewerLpRows(payload, lpEmailNorm)
    if (myCommitted > 0) myDealCount += 1
    sumInvested += myCommitted
    sumInProgress += inProgressNotCountersignedForViewer(payload, lpEmailNorm)
  }

  const sumDistributed = parseMoneyDigits(String(myDistributions.totalPayment ?? ""))
  const distributedNum = Number.isFinite(sumDistributed) ? sumDistributed : 0

  return {
    dealCount: myDealCount,
    totalInvestedDisplay: formatInvestingMoney(sumInvested),
    totalDistributedDisplay: formatInvestingMoney(distributedNum),
    totalInProgressDisplay: formatInvestingMoney(sumInProgress),
  }
}

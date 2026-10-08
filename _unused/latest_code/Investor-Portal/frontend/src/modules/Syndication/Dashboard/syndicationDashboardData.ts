import { fetchContacts } from "../contacts/api/contactsApi"
import {
  fetchDealInvestorClasses,
  fetchDealInvestors,
  fetchDealsList,
} from "../Deals/api/dealsApi"
import { fetchDistributionSetup } from "../Deals/distribution-setup/api/distributionSetupApi"
import {
  acceptedAmountForPayload,
  formatUsdDashboardAmount,
  sumPriorDistributionsAmount,
  targetAmountNumberForDeal,
} from "../Deals/dealsDashboardMoney"
import type { DealListRow } from "../Deals/types/deals.types"

export interface SyndicationDashboardSummary {
  dealCount: number
  /** Sum of investor rows across all deals (investment line items). */
  totalInvestorRows: number
  totalTargetDisplay: string
  totalDistributionsDisplay: string
  totalCommittedDisplay: string
  contactsCount: number
}

async function loadDashboardSummaryForDealList(
  listOptions: { includeParticipantDeals?: boolean } | undefined,
): Promise<SyndicationDashboardSummary> {
  const [list, contacts] = await Promise.all([
    fetchDealsList(listOptions),
    fetchContacts(),
  ])

  const contactsCount = contacts.length

  if (list.length === 0) {
    return {
      dealCount: 0,
      totalInvestorRows: 0,
      totalTargetDisplay: formatUsdDashboardAmount(0),
      totalDistributionsDisplay: formatUsdDashboardAmount(0),
      totalCommittedDisplay: formatUsdDashboardAmount(0),
      contactsCount,
    }
  }

  const perDeal = await Promise.all(
    list.map(async (row: DealListRow) => {
      const [payload, classes, distSetup] = await Promise.all([
        fetchDealInvestors(row.id, { lpInvestorsOnly: true }),
        fetchDealInvestorClasses(row.id),
        fetchDistributionSetup(row.id).catch(() => null),
      ])
      return { row, payload, classes, distSetup }
    }),
  )

  let totalInvestorRows = 0
  let sumTarget = 0
  let sumAccepted = 0
  let sumDistributed = 0

  for (const { row, payload, classes, distSetup } of perDeal) {
    totalInvestorRows += payload.investors.length
    sumTarget += targetAmountNumberForDeal(row, classes)
    sumAccepted += acceptedAmountForPayload(payload)
    sumDistributed += sumPriorDistributionsAmount(distSetup?.priorDistributions)
  }

  return {
    dealCount: list.length,
    totalInvestorRows,
    totalTargetDisplay: formatUsdDashboardAmount(sumTarget),
    totalDistributionsDisplay: formatUsdDashboardAmount(sumDistributed),
    totalCommittedDisplay: formatUsdDashboardAmount(sumAccepted),
    contactsCount,
  }
}

/**
 * Loads aggregate metrics for the syndicating dashboard cards.
 * - Total target amount = sum of offering sizes (investor classes per deal), else deal raise target.
 * - Total distributions = sum of completed distribution cash across all deals.
 * - Total committed = sum of accepted investment amounts across all deals.
 */
export async function loadSyndicationDashboardSummary(): Promise<SyndicationDashboardSummary> {
  return loadDashboardSummaryForDealList(undefined)
}

/**
 * Investing home: same KPI math as syndicating, over `GET /deals?includeParticipantDeals=1`
 * (company deals plus deals where the viewer is on the roster).
 */
export async function loadInvestingDashboardSummary(): Promise<SyndicationDashboardSummary> {
  return loadDashboardSummaryForDealList({ includeParticipantDeals: true })
}

import { useMemo } from "react"
import {
  dealListRowToDealRecord,
  dealRecordToInvestingCardMetrics,
  mergeDealRecordWithInvestorsAndClasses,
  type DealRecord,
} from "@/modules/Syndication/dealsDashboardUtils"
import type { DealDetailApi } from "@/modules/Syndication/Deals/api/dealsApi"
import type { DealInvestorsPayload } from "@/modules/Syndication/Deals/types/deal-investors.types"
import type { DealInvestorClass } from "@/modules/Syndication/Deals/types/deal-investor-class.types"
import type { DealCardMetric } from "@/common/components/deal-card/DealCard"
import { EMPTY_INVESTORS_PAYLOAD } from "@/modules/Syndication/Deals/dealOfferingPreviewShared"

/**
 * Merges list row + classes + investors into the same `DealRecord` shape used
 * for investing deal cards, so the LP details page can reuse that metric set.
 */
export function useLpDealRecord(
  detail: DealDetailApi | null,
  classes: DealInvestorClass[] | undefined,
  investorsPayload: DealInvestorsPayload | undefined,
): { merged: DealRecord | null; cardMetrics: DealCardMetric[] } {
  return useMemo(() => {
    if (!detail) return { merged: null, cardMetrics: [] }
    const listRow = detail.listRow
    const base = dealListRowToDealRecord(listRow)
    const cls = classes ?? []
    const payload = investorsPayload ?? EMPTY_INVESTORS_PAYLOAD
    const merged = mergeDealRecordWithInvestorsAndClasses(
      listRow,
      base,
      payload,
      cls,
    )
    return {
      merged,
      cardMetrics: dealRecordToInvestingCardMetrics(merged),
    }
  }, [detail, classes, investorsPayload])
}

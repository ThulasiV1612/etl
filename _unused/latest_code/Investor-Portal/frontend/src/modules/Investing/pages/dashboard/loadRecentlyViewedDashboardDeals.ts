import {
  fetchDealById,
  fetchDealInvestorClasses,
  fetchDealInvestors,
} from "@/modules/Syndication/Deals/api/dealsApi"
import { EMPTY_INVESTORS_PAYLOAD } from "@/modules/Syndication/Deals/dealOfferingPreviewShared"
import type { DealListRow } from "@/modules/Syndication/Deals/types/deals.types"
import {
  dealListRowToDealRecord,
  mergeDealRecordWithInvestorsAndClasses,
  type DealRecord,
} from "@/modules/Syndication/dealsDashboardUtils"
import {
  dealHasInvestNowDraftForViewer,
  firstInvestNowDraftRowForViewer,
  investNowProgressForViewer,
} from "@/modules/Investing/pages/invest/investNowDraftUtils"
import { readRecentlyViewedDealIds } from "./recentlyViewedDeals"
import type { InvestingDashboardDealsByBucket } from "./investingDashboardDealBucket"

function mergeDealRecord(
  row: DealListRow,
  payload: Awaited<ReturnType<typeof fetchDealInvestors>>,
  classes: Awaited<ReturnType<typeof fetchDealInvestorClasses>>,
  viewerEmailNorm: string,
): DealRecord {
  const record = mergeDealRecordWithInvestorsAndClasses(
    row,
    dealListRowToDealRecord(row),
    payload,
    classes,
  )
  const progress = investNowProgressForViewer(
    payload.investors,
    viewerEmailNorm,
  )
  if (progress) record.investNowDraftProgress = progress
  if (dealHasInvestNowDraftForViewer(payload.investors, viewerEmailNorm)) {
    const draftRow = firstInvestNowDraftRowForViewer(
      payload.investors,
      viewerEmailNorm,
    )
    if (draftRow) {
      record.investNowResumeScope = {
        investmentId: String(draftRow.id ?? "").trim() || undefined,
        userInvestorProfileId:
          String(draftRow.userInvestorProfileId ?? "").trim() || undefined,
        profileId: String(draftRow.profileId ?? "").trim() || undefined,
      }
    }
  }
  return record
}

function indexDealsById(
  dealsByBucket: InvestingDashboardDealsByBucket,
): Map<string, DealRecord> {
  const map = new Map<string, DealRecord>()
  for (const bucket of Object.values(dealsByBucket)) {
    for (const deal of bucket) {
      const id = deal.id?.trim()
      if (id) map.set(id, deal)
    }
  }
  return map
}

export async function loadRecentlyViewedDashboardDeals(
  dealsByBucket: InvestingDashboardDealsByBucket,
  viewerEmailNorm: string,
): Promise<DealRecord[]> {
  const ids = readRecentlyViewedDealIds()
  if (ids.length === 0) return []

  const indexed = indexDealsById(dealsByBucket)
  const out: DealRecord[] = []

  for (const id of ids) {
    const cached = indexed.get(id)
    if (cached) {
      out.push(cached)
      continue
    }
    try {
      const detail = await fetchDealById(id)
      const [payload, classes] = await Promise.all([
        fetchDealInvestors(id).catch(() => EMPTY_INVESTORS_PAYLOAD),
        fetchDealInvestorClasses(id).catch(() => []),
      ])
      out.push(
        mergeDealRecord(detail.listRow, payload, classes, viewerEmailNorm),
      )
    } catch {
      /* deal no longer accessible */
    }
  }

  return out
}

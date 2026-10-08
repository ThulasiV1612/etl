import type { DealRecord } from "@/modules/Syndication/dealsDashboardUtils"

/** Recently viewed (shared-link) deals first, then other opportunity deals — deduped by id. */
export function mergeOpportunitiesTabDeals(
  opportunityDeals: DealRecord[],
  recentlyViewedDeals: DealRecord[],
): DealRecord[] {
  const seen = new Set<string>()
  const merged: DealRecord[] = []
  for (const deal of recentlyViewedDeals) {
    const id = deal.id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    merged.push(deal)
  }
  for (const deal of opportunityDeals) {
    const id = deal.id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    merged.push(deal)
  }
  return merged
}

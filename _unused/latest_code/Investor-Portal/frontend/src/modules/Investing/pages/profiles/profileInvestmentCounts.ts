import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import { applyLpSessionDealIdScope, filterDealListRowsVisibleToInvestors } from "@/modules/Investing/utils/investingViewerDealScope"
import type { InvestmentListRow } from "@/modules/Investing/pages/investments/investments.types"
import { fetchDealsList, fetchDealInvestors } from "@/modules/Syndication/Deals/api/dealsApi"
import { parseMoneyDigits } from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"
import type { InvestorProfileListRow } from "./investor-profiles.types"

function normEmail(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Counts investments in the merged list that reference a saved book profile
 * (`user_investor_profile_id` on the deal commitment), matching the profile’s id.
 * Prefer {@link fetchInvestmentCountsByUserInvestorProfileId} for accuracy: the
 * investments list is collapsed to one row per deal and can omit `userInvestorProfileId`.
 */
export function countLinkedInvestmentsForUserProfileId(
  profileId: string,
  investmentRows: readonly InvestmentListRow[] | null | undefined,
): number {
  const pid = String(profileId ?? "").trim()
  if (!pid || !investmentRows?.length) return 0
  return investmentRows.filter(
    (r) => (r.userInvestorProfileId ?? "").trim() === pid,
  ).length
}

/**
 * For each “My profile” id, the number of **deal commitment** lines (one per
 * `deal_investment` row) where the viewer’s email matches, committed amount is
 * positive, and `userInvestorProfileId` equals the saved profile id. Uses the
 * same deal scope as the Investing list (LP session filter; sponsor-archived deals
 * with your commitments are included).
 */
export async function fetchInvestmentCountsByUserInvestorProfileId(): Promise<
  ReadonlyMap<string, number>
> {
  const em = getSessionUserEmail()
  if (!em?.trim()) return new Map()
  const emn = normEmail(em)
  let list: Awaited<ReturnType<typeof fetchDealsList>> = []
  try {
    list = await fetchDealsList({ includeParticipantDeals: true })
  } catch {
    return new Map()
  }
  const active = filterDealListRowsVisibleToInvestors(
    applyLpSessionDealIdScope(list),
  )
  if (active.length === 0) return new Map()

  const results = await Promise.all(
    active.map(async (row) => {
      try {
        const payload = await fetchDealInvestors(row.id, {
          lpInvestorsOnly: false,
        })
        return payload.investors
      } catch {
        return []
      }
    }),
  )

  const counts = new Map<string, number>()
  for (const investors of results) {
    for (const inv of investors) {
      if (normEmail(String(inv.userEmail ?? "")) !== emn) continue
      const amt = parseMoneyDigits(String(inv.committed ?? ""))
      if (!Number.isFinite(amt) || amt <= 0) continue
      const uip = String(inv.userInvestorProfileId ?? "").trim()
      if (!uip) continue
      counts.set(uip, (counts.get(uip) ?? 0) + 1)
    }
  }
  return counts
}

/** Merges server row with linked-investment count from the app’s investments data. */
export function mergeInvestorProfileRowsWithLinkedCounts(
  rows: readonly InvestorProfileListRow[],
  investmentRows: readonly InvestmentListRow[] | null | undefined,
  /** When set (e.g. from {@link fetchInvestmentCountsByUserInvestorProfileId}), per-profile
   *  counts are authoritative; the merged investments list is not used for counting. */
  countByUserProfileId?: ReadonlyMap<string, number> | null,
): InvestorProfileListRow[] {
  if (!rows.length) return []
  const dealMap = countByUserProfileId
  if (dealMap == null && !investmentRows?.length) {
    return rows.map((p) => ({
      ...p,
      investmentsCount: numberOr0(p.investmentsCount),
    }))
  }
  return rows.map((p) => {
    const fromApi = numberOr0(p.investmentsCount)
    if (dealMap != null) {
      const n = numberOr0(dealMap.get(p.id))
      return {
        ...p,
        investmentsCount: Math.max(fromApi, n),
      }
    }
    const fromList = countLinkedInvestmentsForUserProfileId(
      p.id,
      investmentRows,
    )
    return {
      ...p,
      investmentsCount: Math.max(fromApi, fromList),
    }
  })
}

function numberOr0(n: number | null | undefined): number {
  return Number.isFinite(Number(n)) ? Math.max(0, Math.trunc(Number(n))) : 0
}

import { investmentRowMatchesOnboardingTab } from "@/modules/Investing/pages/investments/investmentOnboardingBucket"
import type { InvestmentListRow } from "@/modules/Investing/pages/investments/investments.types"

/**
 * True when the investor has any relationship on this deal (invited, in progress,
 * or committed). Sponsor archive must not move these rows to Archives.
 */
export function investmentRowHasInvestorStake(row: InvestmentListRow): boolean {
  if (row.investedAmount > 0) return true
  if (row.hasInvestNowDraft) return true
  if (investmentRowMatchesOnboardingTab(row, "in_progress")) return true
  if (investmentRowMatchesOnboardingTab(row, "pending")) return true
  return false
}

/**
 * Sponsor `archived` hides deals from syndication active lists only. Investors
 * keep seeing deals they are invited to or invested in under Active / Pending.
 */
export function investmentRowArchivedForInvestorView(
  row: InvestmentListRow,
): boolean {
  if (!row.archived) return false
  return !investmentRowHasInvestorStake(row)
}

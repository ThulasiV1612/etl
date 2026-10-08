import type { DealInvestorClass } from "./types/deal-investor-class.types"
import type { DealInvestorsPayload } from "./types/deal-investors.types"
import type { DealListRow } from "./types/deals.types"
import { parseMoneyDigits } from "./utils/offeringMoneyFormat"

/** USD with symbol, grouping, and 2 decimal places (e.g. $1,234.56). */
export function formatUsdDashboardAmount(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0)
}

/**
 * Total target for a deal: sum of investor-class offering sizes when any exist;
 * otherwise raise target from the list row (0 if missing).
 */
export function targetAmountNumberForDeal(
  row: DealListRow,
  classes: DealInvestorClass[],
): number {
  let sum = 0
  let hasClassAmount = false
  for (const c of classes) {
    const n = parseMoneyDigits(String(c.offeringSize ?? ""))
    if (Number.isFinite(n)) {
      hasClassAmount = true
      sum += n
    }
  }
  if (hasClassAmount) return sum
  const fallback = parseMoneyDigits(String(row.raiseTarget ?? "").trim())
  return Number.isFinite(fallback) ? fallback : 0
}

/**
 * Sum of completed distribution cash amounts (prior distribution records).
 */
export function sumPriorDistributionsAmount(
  priors: Array<{ amount?: string | null }> | undefined | null,
): number {
  if (!priors?.length) return 0
  return priors.reduce((acc, row) => {
    const n = parseMoneyDigits(String(row.amount ?? ""))
    return acc + (Number.isFinite(n) ? n : 0)
  }, 0)
}

/**
 * Sum of accepted investments for a deal: KPI committed when present, else sum of row committed amounts.
 */
export function acceptedAmountForPayload(payload: DealInvestorsPayload): number {
  const rawKpi = String(payload.kpis.committed ?? "").trim()
  if (rawKpi && rawKpi !== "—") {
    const n = parseMoneyDigits(rawKpi)
    if (Number.isFinite(n)) return n
  }
  return payload.investors.reduce((acc, inv) => {
    const n = parseMoneyDigits(String(inv.committed ?? ""))
    return acc + (Number.isFinite(n) ? n : 0)
  }, 0)
}

export function fundedAmountForPayload(payload: DealInvestorsPayload): number {
  const raw = String(payload.kpis.totalFunded ?? "").trim()
  if (!raw || raw === "—") return 0
  const n = parseMoneyDigits(raw)
  return Number.isFinite(n) ? n : 0
}

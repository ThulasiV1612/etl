/**
 * Preferred return service — wraps formula helpers for waterfall tiers.
 */

import {
  preferredReturnActual365,
  preferredReturnByPeriod,
} from "./helpers/formulas"
import { accrualDayCount } from "./helpers/dateCalculator"

export function computePreferredDue(params: {
  capital: number
  annualRateDecimal: number
  mode: "actual365" | "periodFactor"
  periodsPerYear?: number
  accrualStartIso?: string
  periodStartIso?: string
  periodEndIso?: string
}): number {
  if (params.mode === "periodFactor") {
    return preferredReturnByPeriod({
      capital: params.capital,
      annualRate: params.annualRateDecimal,
      periodsPerYear: params.periodsPerYear ?? 4,
    })
  }
  const days =
    params.accrualStartIso &&
    params.periodStartIso &&
    params.periodEndIso
      ? accrualDayCount({
          accrualStartIso: params.accrualStartIso,
          periodStartIso: params.periodStartIso,
          periodEndIso: params.periodEndIso,
        })
      : 0
  return preferredReturnActual365({
    capital: params.capital,
    annualRate: params.annualRateDecimal,
    days,
  })
}

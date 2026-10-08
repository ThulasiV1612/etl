/**
 * Preferred / CoC due calculation context (portal: actual/365).
 */

import type { DistributionSetupClass } from "../types/distribution-setup.types"
import {
  accrualDayCount,
  inclusiveDayCount,
} from "../engine/helpers/dateCalculator"
import { preferredReturnActual365 } from "../engine/helpers/formulas"

export type PreferredDayCountMode = "period_window" | "from_accrual_start"

export type InvestmentAccrualLine = {
  classId: string
  capital: number
  /** Funded / accrual start YYYY-MM-DD */
  accrualStartIso: string
}

export type PrefAccrualContext = {
  periodStartIso: string
  periodEndIso: string
  /** Deal-level fallback accrual start (close / first funded). */
  defaultAccrualStartIso?: string
  dayCountMode: PreferredDayCountMode
  investments?: InvestmentAccrualLine[]
}

function toNum(v: string | number | undefined): number {
  const n = Number(String(v ?? "").replace(/[$,%\s,]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export function daysForAccrual(
  accrualStartIso: string,
  ctx: PrefAccrualContext,
): number {
  const start = (
    accrualStartIso ||
    ctx.defaultAccrualStartIso ||
    ctx.periodStartIso
  ).slice(0, 10)
  if (ctx.dayCountMode === "from_accrual_start") {
    return inclusiveDayCount({
      startIso: start,
      endIso: ctx.periodEndIso,
    })
  }
  return accrualDayCount({
    accrualStartIso: start,
    periodStartIso: ctx.periodStartIso,
    periodEndIso: ctx.periodEndIso,
  })
}

export function preferredDueForCapital(params: {
  capital: number
  annualRateDecimal: number
  accrualStartIso: string
  ctx: PrefAccrualContext
}): number {
  const days = daysForAccrual(params.accrualStartIso, params.ctx)
  return preferredReturnActual365({
    capital: params.capital,
    annualRate: params.annualRateDecimal,
    days,
  })
}

/** Class preferred due — sum investment lines when present, else class funded. */
export function classPreferredDue(params: {
  classRow: DistributionSetupClass
  annualRateDecimal: number
  ctx: PrefAccrualContext
}): number {
  const { classRow, annualRateDecimal, ctx } = params
  if (!(annualRateDecimal > 0)) return 0

  const lines = (ctx.investments ?? []).filter(
    (l) => l.classId === classRow.id && l.capital > 0,
  )
  if (lines.length > 0) {
    return lines.reduce(
      (s, l) =>
        s +
        preferredDueForCapital({
          capital: l.capital,
          annualRateDecimal,
          accrualStartIso: l.accrualStartIso,
          ctx,
        }),
      0,
    )
  }

  const capital = toNum(classRow.actuallyFunded)
  const start =
    ctx.defaultAccrualStartIso?.slice(0, 10) || ctx.periodStartIso
  return preferredDueForCapital({
    capital,
    annualRateDecimal,
    accrualStartIso: start,
    ctx,
  })
}

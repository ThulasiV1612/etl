/**
 * Pure distribution formulas (business rules from portal / explaination.txt).
 * Manual inputs vs calculated outputs are documented in docs/Waterfall Formula Library.
 */

import { roundMoney, roundPct } from "./rounding"

/** Preferred / CoC due — actual/365, no compounding. */
export function preferredReturnActual365(params: {
  capital: number
  annualRate: number
  days: number
  dayCountBasis?: number
}): number {
  const basis = params.dayCountBasis && params.dayCountBasis > 0
    ? params.dayCountBasis
    : 365
  if (!(params.capital > 0) || !(params.annualRate > 0) || !(params.days > 0))
    return 0
  return roundMoney(params.capital * params.annualRate * (params.days / basis))
}

/** Period-factor preferred (legacy SyndicationX): capital × rate ÷ periodsPerYear. */
export function preferredReturnByPeriod(params: {
  capital: number
  annualRate: number
  periodsPerYear: number
}): number {
  if (!(params.periodsPerYear > 0)) return 0
  return roundMoney(
    params.capital * (params.annualRate / params.periodsPerYear),
  )
}

export function investorDistributionPercent(params: {
  investment: number
  classRaise: number
}): number {
  if (!(params.classRaise > 0)) return 0
  return roundPct((params.investment / params.classRaise) * 100)
}

export function investorPaymentFromPercent(params: {
  distributionAmount: number
  distributionPercent: number
}): number {
  return roundMoney(
    params.distributionAmount * (params.distributionPercent / 100),
  )
}

export function investorPaymentFromCapital(params: {
  classPaid: number
  investorCapital: number
  classCapital: number
}): number {
  if (!(params.classCapital > 0)) return 0
  return roundMoney(
    params.classPaid * (params.investorCapital / params.classCapital),
  )
}

/** Pro-rata shortfall inside an unmet hurdle (Woodland rule). */
export function investorShortfall(params: {
  investorRequired: number
  totalRequired: number
  totalShortfall: number
}): number {
  if (!(params.totalRequired > 0) || !(params.totalShortfall > 0)) return 0
  return roundMoney(
    (params.investorRequired / params.totalRequired) * params.totalShortfall,
  )
}

export function investorPaidAfterShortfall(params: {
  investorRequired: number
  totalRequired: number
  availableCash: number
}): number {
  const totalShortfall = Math.max(
    0,
    params.totalRequired - params.availableCash,
  )
  if (!(params.totalRequired > 0)) return 0
  if (totalShortfall <= 0) return roundMoney(params.investorRequired)
  const short = investorShortfall({
    investorRequired: params.investorRequired,
    totalRequired: params.totalRequired,
    totalShortfall,
  })
  return roundMoney(params.investorRequired - short)
}

/** Allocate available cash across classes by required weights (same hurdle). */
export function allocateCashByRequired(params: {
  availableCash: number
  requiredByKey: Record<string, number>
}): Record<string, number> {
  const entries = Object.entries(params.requiredByKey)
  const totalRequired = entries.reduce((s, [, v]) => s + Math.max(0, v), 0)
  const out: Record<string, number> = {}
  if (!(totalRequired > 0) || !(params.availableCash > 0)) {
    for (const [k] of entries) out[k] = 0
    return out
  }
  const scale = Math.min(1, params.availableCash / totalRequired)
  for (const [k, req] of entries)
    out[k] = roundMoney(Math.max(0, req) * scale)
  return out
}

export function catchupDue(params: {
  catchupPct: number
  lpProfitToDate: number
  gpProfitToDate: number
}): number {
  const pct = Math.min(99, Math.max(0, params.catchupPct))
  if (pct <= 0 || pct >= 100) return 0
  return roundMoney(
    Math.max(
      0,
      (pct / (100 - pct)) * params.lpProfitToDate - params.gpProfitToDate,
    ),
  )
}

export function promoteResidualShare(params: {
  remainingCash: number
  classSharePct: number
  totalSharePct: number
}): number {
  if (!(params.totalSharePct > 0) || !(params.remainingCash > 0)) return 0
  return roundMoney(
    params.remainingCash * (params.classSharePct / params.totalSharePct),
  )
}

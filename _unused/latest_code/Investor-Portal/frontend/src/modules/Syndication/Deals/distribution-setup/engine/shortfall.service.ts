/**
 * Shortfall allocation — Woodland multi-class / investor pro-rata rules.
 */

import {
  allocateCashByRequired,
  investorPaidAfterShortfall,
  investorShortfall,
} from "./helpers/formulas"
import { roundMoney } from "./helpers/rounding"

export function allocateHurdleShortfall(params: {
  availableCash: number
  requiredById: Record<string, number>
}): {
  paidById: Record<string, number>
  unpaidById: Record<string, number>
  totalRequired: number
  totalShortfall: number
  hurdleFullyMet: boolean
} {
  const totalRequired = Object.values(params.requiredById).reduce(
    (s, v) => s + Math.max(0, v),
    0,
  )
  const totalShortfall = roundMoney(
    Math.max(0, totalRequired - params.availableCash),
  )
  const paidById = allocateCashByRequired({
    availableCash: params.availableCash,
    requiredByKey: params.requiredById,
  })
  const unpaidById: Record<string, number> = {}
  for (const [id, req] of Object.entries(params.requiredById)) {
    unpaidById[id] = roundMoney(Math.max(0, req) - (paidById[id] ?? 0))
  }
  return {
    paidById,
    unpaidById,
    totalRequired: roundMoney(totalRequired),
    totalShortfall,
    hurdleFullyMet: totalShortfall <= 0.005,
  }
}

export function allocateInvestorShortfallLine(params: {
  investorRequired: number
  totalRequired: number
  availableCash: number
}): { paid: number; unpaid: number; shortfall: number } {
  const paid = investorPaidAfterShortfall(params)
  const totalShortfall = Math.max(
    0,
    params.totalRequired - params.availableCash,
  )
  const shortfall = investorShortfall({
    investorRequired: params.investorRequired,
    totalRequired: params.totalRequired,
    totalShortfall,
  })
  return {
    paid,
    unpaid: roundMoney(params.investorRequired - paid),
    shortfall,
  }
}

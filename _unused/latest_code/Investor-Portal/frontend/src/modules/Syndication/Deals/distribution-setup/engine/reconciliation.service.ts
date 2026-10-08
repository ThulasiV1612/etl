/**
 * Reconciliation — class nets vs investor lines vs distribution total.
 */

import { roundMoney } from "./helpers/rounding"

export type ReconciliationCheck = {
  id: string
  ok: boolean
  message: string
  expected?: number
  actual?: number
  delta?: number
}

export function reconcileDistribution(params: {
  distributionAmount: number
  classNets: Record<string, number>
  investorPayments: Array<{ classId: string; payment: number }>
  otherAdjustments?: number
}): ReconciliationCheck[] {
  const checks: ReconciliationCheck[] = []
  const classSum = Object.values(params.classNets).reduce(
    (s, v) => s + (Number.isFinite(v) ? v : 0),
    0,
  )
  const other = params.otherAdjustments ?? 0
  const expectedTotal = roundMoney(params.distributionAmount + other)
  const classDelta = roundMoney(classSum - params.distributionAmount)
  checks.push({
    id: "class_vs_waterfall",
    ok: Math.abs(classDelta) <= 0.02,
    message:
      Math.abs(classDelta) <= 0.02
        ? "Class waterfall totals match distribution amount (within 2¢)."
        : "Class waterfall totals do not match distribution amount.",
    expected: params.distributionAmount,
    actual: roundMoney(classSum),
    delta: classDelta,
  })

  const byClass = new Map<string, number>()
  for (const line of params.investorPayments) {
    byClass.set(
      line.classId,
      (byClass.get(line.classId) ?? 0) + (line.payment || 0),
    )
  }
  for (const [classId, classPay] of Object.entries(params.classNets)) {
    const invSum = roundMoney(byClass.get(classId) ?? 0)
    const delta = roundMoney(invSum - classPay)
    checks.push({
      id: `investors_${classId}`,
      ok: Math.abs(delta) <= 0.02 || classPay <= 0.005,
      message:
        Math.abs(delta) <= 0.02
          ? `Investors for ${classId} match class net.`
          : `Investors for ${classId} do not match class net.`,
      expected: roundMoney(classPay),
      actual: invSum,
      delta,
    })
  }

  const invTotal = roundMoney(
    params.investorPayments.reduce((s, l) => s + (l.payment || 0), 0),
  )
  checks.push({
    id: "final_total",
    ok: Math.abs(invTotal - expectedTotal) <= 0.05 || invTotal === 0,
    message:
      Math.abs(invTotal - expectedTotal) <= 0.05 || invTotal === 0
        ? "Final investor payments reconcile to distribution (+ Other)."
        : "Final investor payments do not reconcile to distribution (+ Other).",
    expected: expectedTotal,
    actual: invTotal,
    delta: roundMoney(invTotal - expectedTotal),
  })

  return checks
}

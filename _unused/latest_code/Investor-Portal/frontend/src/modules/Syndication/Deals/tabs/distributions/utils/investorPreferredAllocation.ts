/**
 * Investor preferred-due allocation (Woodland / portal style).
 * Required = capital × rate × days/365; cash is split pro‑rata by Required.
 */

import type { DealInvestorRow } from "../../../types/deal-investors.types"
import type { DistributionSetupClass } from "../../../distribution-setup/types/distribution-setup.types"
import {
  preferredReturnActual365,
} from "../../../distribution-setup/engine/helpers/formulas"
import {
  accrualDayCount,
  inclusiveDayCount,
} from "../../../distribution-setup/engine/helpers/dateCalculator"
import type { PreferredDayCountMode } from "../../../distribution-setup/engine/preferredDue"
import { allocateCentsByWeight, roundMoney, roundPct } from "../../../distribution-setup/engine/helpers/rounding"
import {
  investorCapitalForDistribution,
  parseStoredClassPercent,
  resolveInvestorClass,
  resolvePercentOfDeal,
  type InvestorDistributionLine,
} from "./investorDistributionAllocation"

export type InvestorPreferredLine = InvestorDistributionLine & {
  /** Preferred due for the period (before shortfall). */
  required: number
  /** required − payment */
  unpaid: number
  annualRatePct: number
  days: number
}

function toRateDecimal(raw: string | undefined): number {
  const n = Number(String(raw ?? "").replace(/[$,%\s,]/g, ""))
  if (!Number.isFinite(n) || n <= 0) return 0
  return n > 1 ? n / 100 : n
}

/** Annual preferred rate for a class (decimal). */
export function classPreferredRateDecimal(
  cls: DistributionSetupClass,
): number {
  const type = String(cls.classType ?? "").toLowerCase()
  if (type === "preferred_equity") {
    const total = toRateDecimal(cls.prefEquity?.totalRate)
    if (total > 0) return total
    return toRateDecimal(cls.prefEquity?.currentRate)
  }
  if (type === "lp" || type === "gp") {
    if (cls.preferredReturn?.enabled === false) return 0
    return toRateDecimal(cls.preferredReturn?.rate)
  }
  return toRateDecimal(cls.preferredReturn?.rate)
}

function daysForInvestor(params: {
  accrualStartIso: string
  periodStartIso: string
  periodEndIso: string
  dayCountMode: PreferredDayCountMode
}): number {
  const start =
    params.accrualStartIso ||
    params.periodStartIso
  if (params.dayCountMode === "from_accrual_start") {
    return inclusiveDayCount({
      startIso: start,
      endIso: params.periodEndIso,
    })
  }
  return accrualDayCount({
    accrualStartIso: start,
    periodStartIso: params.periodStartIso,
    periodEndIso: params.periodEndIso,
  })
}

/**
 * Allocate a distribution amount across investors by preferred due.
 * Matches portal: pay each investor Required × (Available / TotalRequired)
 * using largest-remainder cents (Woodland / Excel parity).
 *
 * Optional perClassPaid: when provided (from waterfall sim), allocate within
 * each class using that class's paid amount as the cash pool.
 */
export function allocateInvestorsByPreferredDue(params: {
  distributionAmount: number
  periodStartIso: string
  periodEndIso: string
  dayCountMode?: PreferredDayCountMode
  defaultAccrualStartIso?: string
  investors: DealInvestorRow[]
  classes: DistributionSetupClass[]
  /** Class nets from waterfall (preferred paid per class). */
  perClassPaid?: Record<string, number>
  /** Net Other (manual) adjustments applied after waterfall, by capital weight. */
  otherAdjustment?: number
}): InvestorPreferredLine[] {
  const dayCountMode = params.dayCountMode ?? "period_window"
  const amount = Math.max(0, params.distributionAmount)
  const classById = new Map(params.classes.map((c) => [c.id, c]))

  type Acc = {
    investor: DealInvestorRow
    classId: string
    className: string
    capital: number
    annualRatePct: number
    days: number
    required: number
  }

  const matched: Acc[] = []
  for (const inv of params.investors) {
    const cls = resolveInvestorClass(inv.investorClass ?? "", params.classes)
    if (!cls) continue
    const capital = investorCapitalForDistribution(inv)
    const rateDec = classPreferredRateDecimal(cls)
    if (!(capital > 0) || !(rateDec > 0)) continue

    const funded = String(inv.fundedDate ?? "")
      .trim()
      .slice(0, 10)
    const accrualStart =
      (/^\d{4}-\d{2}-\d{2}$/.test(funded) ? funded : "") ||
      params.defaultAccrualStartIso ||
      params.periodStartIso

    const days = daysForInvestor({
      accrualStartIso: accrualStart,
      periodStartIso: params.periodStartIso,
      periodEndIso: params.periodEndIso,
      dayCountMode,
    })
    const required = preferredReturnActual365({
      capital,
      annualRate: rateDec,
      days,
    })
    if (!(required > 0)) continue

    matched.push({
      investor: inv,
      classId: cls.id,
      className: cls.name || classById.get(cls.id)?.name || "—",
      capital,
      annualRatePct: rateDec * 100,
      days,
      required,
    })
  }

  const capitalByClass = new Map<string, number>()
  for (const m of matched) {
    capitalByClass.set(
      m.classId,
      (capitalByClass.get(m.classId) ?? 0) + m.capital,
    )
  }

  const paymentByIndex = new Array(matched.length).fill(0) as number[]

  const perClass = params.perClassPaid
  const usePerClass =
    perClass != null &&
    Object.keys(perClass).some((id) => (perClass[id] ?? 0) > 0.005)

  if (usePerClass && perClass) {
    // Woodland path: class waterfall paid → pro-rata by investor Required within class.
    const byClass = new Map<string, number[]>()
    matched.forEach((m, i) => {
      const list = byClass.get(m.classId) ?? []
      list.push(i)
      byClass.set(m.classId, list)
    })
    for (const [classId, indices] of byClass) {
      const classCash = Math.max(0, perClass[classId] ?? 0)
      const weights = indices.map((i) => matched[i]!.required)
      const cents = allocateCentsByWeight({
        totalCents: Math.round(classCash * 100),
        weights,
      })
      indices.forEach((i, j) => {
        paymentByIndex[i] = (cents[j] ?? 0) / 100
      })
    }
  } else {
    // Deal-level preferred shortfall (same math when rates differ across classes).
    const payCents = allocateCentsByWeight({
      totalCents: Math.round(amount * 100),
      weights: matched.map((m) => m.required),
    })
    matched.forEach((_, i) => {
      paymentByIndex[i] = (payCents[i] ?? 0) / 100
    })
  }

  const other = params.otherAdjustment ?? 0
  if (Math.abs(other) >= 0.005 && matched.length > 0) {
    const otherCents = allocateCentsByWeight({
      totalCents: Math.round(Math.abs(other) * 100),
      weights: matched.map((m) => m.capital),
    })
    const sign = other >= 0 ? 1 : -1
    matched.forEach((_, i) => {
      paymentByIndex[i] = roundMoney(
        Math.max(0, paymentByIndex[i]! + (sign * (otherCents[i] ?? 0)) / 100),
      )
    })
  }

  const dealCapital = matched.reduce((s, m) => s + Math.max(0, m.capital), 0)
  const lines: InvestorPreferredLine[] = matched.map((m, i) => {
    const payment = paymentByIndex[i] ?? 0
    const classCap = capitalByClass.get(m.classId) ?? 0
    const storedPct = parseStoredClassPercent(
      m.investor.percentOfClassDistributions,
    )
    const percentOfClass =
      storedPct != null
        ? storedPct
        : classCap > 0
          ? roundPct((m.capital / classCap) * 100)
          : 0
    const contactId = m.investor.contactId?.trim() || undefined
    const userEmail =
      m.investor.userEmail?.trim().toLowerCase() || undefined
    return {
      investorId: m.investor.id,
      ...(contactId ? { contactId } : {}),
      ...(userEmail ? { userEmail } : {}),
      investorName:
        m.investor.displayName?.trim() ||
        m.investor.userDisplayName?.trim() ||
        "—",
      classId: m.classId,
      className: m.className,
      capital: m.capital,
      percentOfClass,
      percentOfDeal: resolvePercentOfDeal({
        entityOwnershipPercent: m.investor.entityOwnershipPercent,
        capital: m.capital,
        dealCapital,
      }),
      payment,
      required: m.required,
      unpaid: roundMoney(Math.max(0, m.required - payment)),
      annualRatePct: m.annualRatePct,
      days: m.days,
    }
  })

  return lines.sort((a, b) => {
    const byClassName = a.className.localeCompare(b.className)
    if (byClassName !== 0) return byClassName
    return b.payment - a.payment || a.investorName.localeCompare(b.investorName)
  })
}

/** Collapse only identical twin posts (same date + amount + source + name). */
export function dedupePriorDistributions<
  T extends {
    id: string
    date: string
    amount: string
    source?: string
    name?: string
    investorPayments?: unknown[]
  },
>(priors: T[]): T[] {
  const best = new Map<string, T>()
  for (const p of priors) {
    const amt = String(p.amount ?? "").replace(/[^0-9.-]/g, "")
    const nameKey = String(p.name ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
    const key = `${p.date}|${amt}|${String(p.source ?? "").toLowerCase()}|${nameKey}`
    const prev = best.get(key)
    if (!prev) {
      best.set(key, p)
      continue
    }
    const prevLines = prev.investorPayments?.length ?? 0
    const nextLines = p.investorPayments?.length ?? 0
    if (nextLines > prevLines || (nextLines === prevLines && p.id > prev.id))
      best.set(key, p)
  }
  return [...best.values()].sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Normalize completed distribution runs for a deal.
 * Keeps separate runs in the same period (different name/amount).
 * Only drops exact twin posts (same date + amount + source + name).
 */
export function sanitizePriorDistributions<
  T extends {
    id: string
    date: string
    amount: string
    source?: string
    name?: string
    investorPayments?: unknown[]
    periodStart?: string
    periodEnd?: string
  },
>(priors: T[]): T[] {
  return dedupePriorDistributions(priors)
}

/** Sum final investor payments by class (Who receives what / reconciliation). */
export function classTotalsFromInvestorLines(
  lines: Array<{ classId: string; payment: number }>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of lines) {
    const id = String(line.classId ?? "").trim()
    if (!id) continue
    out[id] = roundMoney((out[id] ?? 0) + (line.payment || 0))
  }
  return out
}

import { parseMoneyDigits } from "../../utils/offeringMoneyFormat"
import { resolveInvestorClass } from "../../tabs/distributions/utils/investorDistributionAllocation"
import type {
  DistributionFeeClassSplit,
  DistributionFeeConfig,
  DistributionSetupClass,
} from "../types/distribution-setup.types"
import { allocateCentsByWeight, roundMoney } from "../engine/helpers/rounding"
import {
  getPeriodWindow,
  periodFromFactor,
} from "./distributionPeriod"

export type FeeClassSplitInvestorRef = {
  investorClass?: string | null
}

export type FeeClassSplitStatus = {
  classId: string
  className: string
  percent: number
  /** True when a positive percentage is entered for this class. */
  mentioned: boolean
  investorCount: number
  /** Mentioned class with at least one assigned investor. */
  payable: boolean
}

/** Built-in fee type presets — empty so sponsors type/create their own. */
export const DEFAULT_DISTRIBUTION_FEE_TYPE_OPTIONS = [] as const

/** Legacy presets removed from the Type dropdown (still allowed if already selected). */
const REMOVED_DISTRIBUTION_FEE_TYPE_PRESETS = new Set([
  "acquisition fee",
  "asset management fee",
  "disposition fee",
  "property management fee",
])

export function mergeFeeTypeOptions(params: {
  options?: string[] | null
  extra?: string[] | null
}): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const extras = new Set(
    (params.extra ?? [])
      .map((raw) =>
        String(raw ?? "")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase(),
      )
      .filter(Boolean),
  )
  for (const raw of [
    ...(params.options ?? []),
    ...DEFAULT_DISTRIBUTION_FEE_TYPE_OPTIONS,
    ...(params.extra ?? []),
  ]) {
    const t = String(raw ?? "")
      .trim()
      .replace(/\s+/g, " ")
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    if (
      REMOVED_DISTRIBUTION_FEE_TYPE_PRESETS.has(key) &&
      !extras.has(key)
    )
      continue
    seen.add(key)
    out.push(t)
  }
  return out
}

export function emptyDistributionFeeConfig(
  classes: DistributionSetupClass[] = [],
): DistributionFeeConfig {
  const asOf = new Date().toISOString().slice(0, 10)
  const window = getPeriodWindow(asOf, "quarterly")
  return {
    name: "",
    type: "",
    typeOptions: [...DEFAULT_DISTRIBUTION_FEE_TYPE_OPTIONS],
    cashAvailable: "$0.00",
    periodFactor: "0.25",
    periodStart: window.start,
    periodEnd: window.end,
    classSplits: defaultClassSplits(classes),
  }
}

export function defaultClassSplits(
  classes: DistributionSetupClass[],
): DistributionFeeClassSplit[] {
  return classes.map((c) => ({
    classId: c.id,
    percent: "0",
  }))
}

/** Keep splits aligned with current Class Setup; preserve typed percents. */
export function syncFeeClassSplits(params: {
  classes: DistributionSetupClass[]
  splits: DistributionFeeClassSplit[]
}): DistributionFeeClassSplit[] {
  const byId = new Map(
    params.splits.map((s) => [s.classId, s.percent] as const),
  )
  return params.classes.map((c) => ({
    classId: c.id,
    percent: byId.get(c.id) ?? "0",
  }))
}

export function parseFeePercent(raw: string): number {
  const t = String(raw ?? "")
    .trim()
    .replace(/%/g, "")
    .replace(/,/g, "")
  if (!t) return NaN
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

export function feeClassSplitTotal(splits: DistributionFeeClassSplit[]): number {
  return roundMoney(
    splits.reduce((sum, s) => {
      const n = parseFeePercent(s.percent)
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0),
  )
}

/** Count deal investors assigned to each Class Setup class. */
export function countFeeClassInvestors(params: {
  classes: DistributionSetupClass[]
  investors?: FeeClassSplitInvestorRef[] | null
}): Map<string, number> {
  const counts = new Map<string, number>()
  for (const cls of params.classes) counts.set(cls.id, 0)
  for (const inv of params.investors ?? []) {
    const cls = resolveInvestorClass(inv.investorClass ?? "", params.classes)
    if (!cls) continue
    counts.set(cls.id, (counts.get(cls.id) ?? 0) + 1)
  }
  return counts
}

/**
 * Class-scoped Class Split status: a class is payable only when it has a
 * percentage and at least one investor. Empty mentioned classes do not
 * spill their share to other classes.
 */
export function listFeeClassSplitStatuses(params: {
  classes: DistributionSetupClass[]
  splits: DistributionFeeClassSplit[]
  investors?: FeeClassSplitInvestorRef[] | null
}): FeeClassSplitStatus[] {
  const counts = countFeeClassInvestors(params)
  return params.classes.map((cls) => {
    const split = params.splits.find((s) => s.classId === cls.id)
    const n = parseFeePercent(split?.percent ?? "0")
    const percent = Number.isFinite(n) ? n : 0
    const mentioned = percent > 0
    const investorCount = counts.get(cls.id) ?? 0
    return {
      classId: cls.id,
      className: cls.name || "Class",
      percent,
      mentioned,
      investorCount,
      payable: mentioned && investorCount > 0,
    }
  })
}

export function feeClassSplitBlockedNames(
  statuses: FeeClassSplitStatus[],
): string[] {
  return statuses
    .filter((s) => s.mentioned && s.investorCount === 0)
    .map((s) => s.className)
}

function blockedClassSplitMessage(names: string[]): string {
  if (names.length === 0) return ""
  const listed =
    names.length === 1
      ? names[0]!
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
  const verb = names.length === 1 ? "has" : "have"
  return `${listed} ${verb} a percentage allocated but no class investors. Distributions are class-scoped, so that class is not paid and this distribution is not paid to other classes either.`
}

export function validateDistributionFee(params: {
  fee: DistributionFeeConfig
  requireComplete?: boolean
  classes?: DistributionSetupClass[]
  investors?: FeeClassSplitInvestorRef[] | null
}): { ok: boolean; message: string } {
  const name = params.fee.name.trim()
  const requireComplete = params.requireComplete === true || name.length > 0

  if (!requireComplete) return { ok: true, message: "" }

  if (!name)
    return {
      ok: false,
      message: "Acquisition fee name is required.",
    }

  const feeType = params.fee.type.trim()
  if (!feeType)
    return {
      ok: false,
      message: "Acquisition fee type is required.",
    }

  if (params.fee.classSplits.length === 0)
    return {
      ok: false,
      message: "Add investor classes in Class Setup before configuring a fee.",
    }

  for (const s of params.fee.classSplits) {
    const n = parseFeePercent(s.percent)
    if (!Number.isFinite(n) || n < 0 || n > 100)
      return {
        ok: false,
        message: "Each class percentage must be between 0% and 100%.",
      }
  }

  const total = feeClassSplitTotal(params.fee.classSplits)
  if (Math.abs(total - 100) > 0.005)
    return {
      ok: false,
      message: `Class allocation must equal 100% (currently ${total.toFixed(2)}%).`,
    }

  const start = params.fee.periodStart?.trim() ?? ""
  const end = params.fee.periodEnd?.trim() ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
    return {
      ok: false,
      message: "Period start date and period end date are required.",
    }
  if (end < start)
    return {
      ok: false,
      message: "Period end date must be on or after the period start date.",
    }

  if (params.classes?.length) {
    const blocked = feeClassSplitBlockedNames(
      listFeeClassSplitStatuses({
        classes: params.classes,
        splits: params.fee.classSplits,
        investors: params.investors,
      }),
    )
    if (blocked.length > 0)
      return {
        ok: false,
        message: blockedClassSplitMessage(blocked),
      }
  }

  return { ok: true, message: "" }
}

/** When period cadence changes, snap the fee window to that calendar period. */
export function feeWindowForPeriodFactor(params: {
  periodFactor: string
  asOfIso?: string
}): { periodStart: string; periodEnd: string } {
  const period = periodFromFactor(Number(params.periodFactor) || 0.25)
  const asOf =
    params.asOfIso && /^\d{4}-\d{2}-\d{2}$/.test(params.asOfIso)
      ? params.asOfIso
      : new Date().toISOString().slice(0, 10)
  const window = getPeriodWindow(asOf, period)
  return { periodStart: window.start, periodEnd: window.end }
}

/** Allocate fee cash across classes by percentage (cents-accurate). */
export function allocateFeeCashByClass(params: {
  cashAvailable: string
  splits: DistributionFeeClassSplit[]
}): Record<string, number> {
  const cash = Math.max(0, parseMoneyDigits(params.cashAvailable))
  const weights = params.splits.map((s) => {
    const n = parseFeePercent(s.percent)
    return Number.isFinite(n) && n > 0 ? n : 0
  })
  const cents = allocateCentsByWeight({
    totalCents: Math.round(cash * 100),
    weights,
  })
  const out: Record<string, number> = {}
  params.splits.forEach((s, i) => {
    out[s.classId] = (cents[i] ?? 0) / 100
  })
  return out
}

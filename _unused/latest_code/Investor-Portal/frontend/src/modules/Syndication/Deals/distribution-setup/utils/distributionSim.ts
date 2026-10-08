import type {
  DistributionPaymentRow,
  DistributionSetupClass,
  DistributionSetupPromote,
  DistributionWfKind,
  PriorDistributionRecord,
} from "../types/distribution-setup.types"
import {
  computeStageMetFromHurdles,
  periodsPerYearFromFactor,
  type HurdleCashFlow,
  type HurdleEvaluation,
  type WaterfallInput,
} from "./hurdleCalculations"
import { catchupDue } from "../engine/helpers/formulas"
import { allocateCentsByWeight, roundMoney } from "../engine/helpers/rounding"
import {
  classPreferredDue,
  type InvestmentAccrualLine,
  type PrefAccrualContext,
  type PreferredDayCountMode,
} from "../engine/preferredDue"
import {
  getPeriodWindow,
  periodFromFactor,
  periodLabel,
  remainingDueAfterPriorPool,
  sumPriorCashInPeriod,
  type DistributionPeriod,
} from "./distributionPeriod"

function toNum(v: string | number | undefined): number {
  const n = Number(String(v ?? "").replace(/[$,%\s,]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`
}

/** Money with cents — use for Who receives what / investor payments. */
export function formatMoneyCents(n: number): string {
  if (!Number.isFinite(n)) return "$0.00"
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatPct(n: number): string {
  return `${Math.round(n * 10) / 10}%`
}

export function stageCount(promote: DistributionSetupPromote): number {
  return (promote.hurdles?.length ?? 0) + 1
}

export function equityParticipants(
  classes: DistributionSetupClass[],
): DistributionSetupClass[] {
  return classes.filter(
    (c) => c.classType === "lp" || c.classType === "gp",
  )
}

export function shareAt(
  promote: DistributionSetupPromote,
  classId: string,
  stage: number,
): number {
  return toNum(promote.shares?.[classId]?.[stage])
}

export function hurdleLabel(
  h: DistributionSetupPromote["hurdles"][number],
): string {
  return `${h.rate}% ${h.basis}`
}

/** Pref-style tiers whose period obligation is reduced by same-period prior cash. */
function isPeriodPrefKind(kind: DistributionWfKind): boolean {
  return kind === "LP_PREF" || kind === "PREF_CURRENT" || kind === "PREF_ACCRUED"
}

function rateForClass(
  row: DistributionPaymentRow,
  c: DistributionSetupClass,
): number {
  if (row.kind === "PREF_CURRENT")
    return toNum(c.prefEquity.currentRate) / 100
  if (row.kind === "PREF_ACCRUED")
    return (
      Math.max(
        0,
        toNum(c.prefEquity.totalRate) - toNum(c.prefEquity.currentRate),
      ) / 100
    )
  if (row.kind === "LP_PREF")
    return c.preferredReturn.enabled
      ? toNum(c.preferredReturn.rate) / 100
      : 0
  return 0
}

export function computeDue(
  row: DistributionPaymentRow,
  classes: DistributionSetupClass[],
  ctx: PrefAccrualContext,
  ignoreManual = false,
): number {
  if (!ignoreManual && row.amountMode === "input")
    return toNum(row.inputAmount)
  const list = row.payTo
    .map((id) => classes.find((c) => c.id === id))
    .filter((c): c is DistributionSetupClass => c != null)

  if (row.kind === "PREF_CURRENT" || row.kind === "LP_PREF")
    return roundMoney(
      list.reduce(
        (s, c) =>
          s +
          classPreferredDue({
            classRow: c,
            annualRateDecimal: rateForClass(row, c),
            ctx,
          }),
        0,
      ),
    )
  if (row.kind === "PREF_ACCRUED")
    return roundMoney(
      list.reduce(
        (s, c) =>
          s +
          classPreferredDue({
            classRow: c,
            annualRateDecimal: rateForClass(row, c),
            ctx,
          }),
        0,
      ),
    )
  if (row.kind === "ROC")
    return list.reduce((s, c) => s + toNum(c.actuallyFunded), 0)
  return 0
}

function classDueShare(
  row: DistributionPaymentRow,
  c: DistributionSetupClass,
  ctx: PrefAccrualContext,
): number {
  if (
    row.kind === "PREF_CURRENT" ||
    row.kind === "PREF_ACCRUED" ||
    row.kind === "LP_PREF"
  )
    return classPreferredDue({
      classRow: c,
      annualRateDecimal: rateForClass(row, c),
      ctx,
    })
  if (row.kind === "ROC") return toNum(c.actuallyFunded)
  return 1
}

export function calcFormulaNote(
  row: DistributionPaymentRow,
  classes: DistributionSetupClass[],
  ctx?: PrefAccrualContext,
): string {
  const fallbackCtx: PrefAccrualContext = ctx ?? {
    periodStartIso: "2026-01-01",
    periodEndIso: "2026-03-31",
    dayCountMode: "period_window",
  }
  const due = computeDue(row, classes, fallbackCtx, true)
  if (row.kind === "PREF_CURRENT")
    return `funded × current rate × days/365 — e.g. ${formatMoney(due)}`
  if (row.kind === "PREF_ACCRUED")
    return `accrued (total−current) × days/365 — est. ${formatMoney(due)}`
  if (row.kind === "LP_PREF")
    return `Σ funded × pref rate × days/365 — e.g. ${formatMoney(due)}`
  if (row.kind === "ROC") return `unreturned capital — ${formatMoney(due)}`
  if (row.kind === "CATCHUP")
    return `amount restoring the class to its target share of profits to date`
  return ""
}

export interface SimFlowRow {
  kind: "payment" | "stage"
  index: number
  label: string
  due: number | null
  paid: number | null
  note?: string
  shortfall?: number
  stage?: number
  skipped?: boolean
}

export interface SimResult {
  flowRows: SimFlowRow[]
  perClass: Record<string, number>
  leftover: number
  totalPaid: number
  hurdleEvaluations: HurdleEvaluation[]
  stageMet: Record<number, boolean>
  period: DistributionPeriod
  periodWindowLabel: string
  priorCashInPeriod: number
  /** Days in the accrual window used for preferred dues. */
  preferredDayCount: number
  dayCountMode: PreferredDayCountMode
  /** True when a preferred/CoC tier was not fully paid — promote blocked. */
  preferredHurdleUnpaid: boolean
}

export function investedCapitalFromClasses(
  classes: DistributionSetupClass[],
): number {
  return classes
    .filter((c) => c.classType === "lp" || c.classType === "gp")
    .reduce((s, c) => s + toNum(c.actuallyFunded), 0)
}

export function buildWaterfallInput(params: {
  cash: number
  periodFactor: number
  classes: DistributionSetupClass[]
  cashFlows?: HurdleCashFlow[]
  cumulativeDistributions?: number
  cashInPeriod?: number
}): WaterfallInput {
  const investedCapital = investedCapitalFromClasses(params.classes)
  const periodsPerYear = periodsPerYearFromFactor(params.periodFactor)
  const cashFlows =
    params.cashFlows && params.cashFlows.length > 0
      ? params.cashFlows
      : []
  const periodCash =
    params.cashInPeriod != null && Number.isFinite(params.cashInPeriod)
      ? params.cashInPeriod
      : params.cash
  return {
    cashFlows,
    availableCash: params.cash,
    investedCapital,
    periodsPerYear,
    distribution: periodCash,
    cumulativeDistributions: params.cumulativeDistributions,
  }
}

function allocatePaidToClasses(params: {
  paid: number
  dues: number[]
  classIds: string[]
}): Record<string, number> {
  const { paid, dues, classIds } = params
  const out: Record<string, number> = {}
  for (const id of classIds) out[id] = 0
  if (!(paid > 0) || classIds.length === 0) return out

  const totalCents = Math.round(paid * 100)
  const cents = allocateCentsByWeight({
    totalCents,
    weights: dues.map((d) => Math.max(0, d)),
  })
  classIds.forEach((id, i) => {
    out[id] = (cents[i] ?? 0) / 100
  })
  return out
}

export function runDistributionSim(input: {
  cash: number
  periodFactor: number
  rows: DistributionPaymentRow[]
  classes: DistributionSetupClass[]
  promote: DistributionSetupPromote
  stageMetOverrides?: Record<number, boolean>
  dueOverrides: Record<string, number>
  cashFlows?: HurdleCashFlow[]
  cumulativeDistributions?: number
  asOfDate?: string
  priorDistributions?: PriorDistributionRecord[]
  excludePriorId?: string
  /** Deal-level accrual start (close / first funded). */
  investmentDate?: string
  /** Per-investment capital + funded dates for class dues. */
  investments?: InvestmentAccrualLine[]
  /**
   * period_window = Woodland (clip to period).
   * from_accrual_start = Wildflower CoC (accrual start → period end).
   */
  dayCountMode?: PreferredDayCountMode
  /** Optional explicit period window (Test panel start/end dates). */
  periodStartIso?: string
  periodEndIso?: string
}): SimResult {
  const {
    cash,
    periodFactor,
    rows,
    classes,
    promote,
    stageMetOverrides = {},
    dueOverrides,
    cashFlows,
    cumulativeDistributions,
    asOfDate,
    priorDistributions = [],
    excludePriorId,
    investmentDate,
    investments,
    dayCountMode = "period_window",
    periodStartIso,
    periodEndIso,
  } = input

  const period = periodFromFactor(periodFactor)
  const asOf =
    asOfDate && /^\d{4}-\d{2}-\d{2}/.test(asOfDate)
      ? asOfDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10)

  const customStart =
    periodStartIso && /^\d{4}-\d{2}-\d{2}/.test(periodStartIso)
      ? periodStartIso.slice(0, 10)
      : ""
  const customEnd =
    periodEndIso && /^\d{4}-\d{2}-\d{2}/.test(periodEndIso)
      ? periodEndIso.slice(0, 10)
      : ""
  const windowOverride =
    customStart && customEnd && customEnd >= customStart
      ? { start: customStart, end: customEnd }
      : undefined

  const { window, priorCash } = sumPriorCashInPeriod({
    priors: priorDistributions.map((p) => ({
      id: p.id,
      amount: toNum(p.amount),
      date: p.date,
    })),
    asOfIso: asOf,
    period,
    excludeId: excludePriorId,
    windowOverride,
  })

  const prefCtx: PrefAccrualContext = {
    periodStartIso: window.start,
    periodEndIso: window.end,
    defaultAccrualStartIso:
      investmentDate && /^\d{4}-\d{2}-\d{2}/.test(investmentDate)
        ? investmentDate.slice(0, 10)
        : window.start,
    dayCountMode,
    investments,
  }

  const preferredDayCount =
    dayCountMode === "from_accrual_start"
      ? inclusiveDays(
          prefCtx.defaultAccrualStartIso || window.start,
          window.end,
        )
      : inclusiveDays(window.start, window.end)

  const cashInPeriod = priorCash + cash
  const waterfallInput = buildWaterfallInput({
    cash,
    periodFactor,
    classes,
    cashFlows,
    cumulativeDistributions,
    cashInPeriod,
  })
  const { stageMet, evaluations: hurdleEvaluations } =
    computeStageMetFromHurdles(promote, waterfallInput, stageMetOverrides)

  const stageMetFinal: Record<number, boolean> = { ...stageMet }

  let remaining = cash
  let priorPool = priorCash
  const perClass: Record<string, number> = {}
  const profit: Record<string, number> = {}
  classes.forEach((c) => {
    perClass[c.id] = 0
    profit[c.id] = 0
  })

  const flowRows: SimFlowRow[] = []
  let starved = false
  let preferredHurdleUnpaid = false

  for (let i = 0; i < rows.length; i++) {
    const t = rows[i]!
    if (starved) {
      flowRows.push({
        kind: "payment",
        index: i,
        label: t.name,
        due: null,
        paid: null,
        skipped: true,
        note: preferredHurdleUnpaid
          ? "not reached — preferred / CoC hurdle unpaid upstream"
          : "not reached — cash exhausted upstream",
      })
      continue
    }

    let fullDue: number
    if (t.kind === "CATCHUP" && t.amountMode !== "input") {
      const lpProfit = classes
        .filter((c) => c.classType === "lp")
        .reduce((s, c) => s + (profit[c.id] || 0), 0)
      const gpProfit = (t.payTo || []).reduce(
        (s, id) => s + (profit[id] || 0),
        0,
      )
      fullDue = catchupDue({
        catchupPct: toNum(t.catchupPct) || 20,
        lpProfitToDate: lpProfit,
        gpProfitToDate: gpProfit,
      })
    } else {
      fullDue = computeDue(t, classes, prefCtx)
    }

    let baseDue = fullDue
    let appliedFromPrior = 0
    if (
      dueOverrides[t.id] == null &&
      isPeriodPrefKind(t.kind) &&
      t.amountMode !== "input"
    ) {
      const reduced = remainingDueAfterPriorPool(fullDue, priorPool)
      baseDue = reduced.remainingDue
      appliedFromPrior = reduced.appliedFromPrior
      priorPool = reduced.poolLeft
    }

    const due =
      dueOverrides[t.id] != null ? dueOverrides[t.id]! : baseDue
    const paid = Math.min(remaining, due)
    const list = (t.payTo || [])
      .map((id) => classes.find((c) => c.id === id))
      .filter((c): c is DistributionSetupClass => c != null)

    const dues = list.map((c) => classDueShare(t, c, prefCtx))
    const classIds = list.map((c) => c.id)
    const shares = allocatePaidToClasses({
      paid,
      dues,
      classIds,
    })
    list.forEach((c) => {
      const share = shares[c.id] ?? 0
      perClass[c.id] = (perClass[c.id] || 0) + share
      if (t.kind === "LP_PREF" || t.kind === "CATCHUP")
        profit[c.id] = (profit[c.id] || 0) + share
    })
    remaining = roundMoney(remaining - paid)

    const shortfall = due - paid > 0.005 ? roundMoney(due - paid) : undefined
    const notes: string[] = []
    if (appliedFromPrior > 0.5) {
      notes.push(
        `${formatMoney(appliedFromPrior)} already covered by prior ${periodLabel(period).toLowerCase()} distributions`,
      )
    }
    if (fullDue > due + 0.5 && dueOverrides[t.id] == null) {
      notes.push(
        `full due ${formatMoney(fullDue)} · ${preferredDayCount}d actual/365`,
      )
    } else if (isPeriodPrefKind(t.kind) && t.amountMode !== "input") {
      notes.push(`${preferredDayCount}d × rate ÷ 365`)
    }
    if (shortfall != null) {
      notes.push(
        `shortfall ${formatMoney(shortfall)} — later hurdles blocked`,
      )
    }

    flowRows.push({
      kind: "payment",
      index: i,
      label: t.name,
      due,
      paid,
      shortfall,
      note: notes.length ? notes.join(" · ") : undefined,
    })

    // Portal rule: unpaid preferred / CoC hurdle stops the waterfall.
    if (isPeriodPrefKind(t.kind) && shortfall != null) {
      preferredHurdleUnpaid = true
      remaining = 0
      starved = true
    } else if (remaining <= 0.005) {
      remaining = 0
      starved = true
    }
  }

  const S = stageCount(promote)
  const parts = equityParticipants(classes)
  let active = 0
  while (active < S - 1 && stageMetFinal[active + 1]) active++

  if (parts.length) {
    for (let s = 0; s < S; s++) {
      const idx = rows.length + s
      const stageLabel =
        s === 0
          ? "Split remaining cash — stage 1 (base shares)"
          : `Split remaining cash — stage ${s + 1} (after Hurdle ${s})`

      if (preferredHurdleUnpaid || starved) {
        flowRows.push({
          kind: "stage",
          index: idx,
          stage: s,
          label: stageLabel,
          due: null,
          paid: null,
          skipped: true,
          note: preferredHurdleUnpaid
            ? "not reached — preferred / CoC hurdle not fully satisfied"
            : "not reached — cash exhausted upstream",
        })
        continue
      }

      if (s < active) {
        const ev = hurdleEvaluations[s]
        flowRows.push({
          kind: "stage",
          index: idx,
          stage: s,
          label: stageLabel,
          due: null,
          paid: null,
          note: ev?.detail
            ? `Hurdle ${s + 1} met (${ev.detail}) — cash passes to the next stage ↓`
            : `Hurdle ${s + 1} met — cash passes to the next stage ↓`,
        })
        continue
      }
      if (s > active) {
        const ev = hurdleEvaluations[s - 1]
        flowRows.push({
          kind: "stage",
          index: idx,
          stage: s,
          label: stageLabel,
          due: null,
          paid: null,
          skipped: true,
          note: ev?.detail
            ? `not reached — Hurdle ${s} not met (${ev.detail})`
            : `not reached — Hurdle ${s} not met yet`,
        })
        continue
      }
      if (remaining <= 0.005) {
        flowRows.push({
          kind: "stage",
          index: idx,
          stage: s,
          label: stageLabel,
          due: null,
          paid: null,
          skipped: true,
          note: "not reached — cash exhausted upstream",
        })
        continue
      }
      const shares = parts.map((c) => shareAt(promote, c.id, s))
      const residualCents = allocateCentsByWeight({
        totalCents: Math.round(remaining * 100),
        weights: shares.map((x) => Math.max(0, x)),
      })
      parts.forEach((c, ci) => {
        const share = (residualCents[ci] ?? 0) / 100
        perClass[c.id] = (perClass[c.id] || 0) + share
        profit[c.id] = (profit[c.id] || 0) + share
      })
      flowRows.push({
        kind: "stage",
        index: idx,
        stage: s,
        label: stageLabel,
        due: remaining,
        paid: remaining,
        note: "splits all remaining cash — stop",
      })
      remaining = 0
    }
  }

  const totalPaid = Object.values(perClass).reduce((a, b) => a + b, 0)
  return {
    flowRows,
    perClass,
    leftover: remaining,
    totalPaid,
    hurdleEvaluations,
    stageMet: stageMetFinal,
    period,
    periodWindowLabel: `${window.label} · ${preferredDayCount}d actual/365`,
    priorCashInPeriod: priorCash,
    preferredDayCount,
    dayCountMode,
    preferredHurdleUnpaid,
  }
}

function inclusiveDays(startIso: string, endIso: string): number {
  const a = Date.parse(`${startIso.slice(0, 10)}T00:00:00`)
  const b = Date.parse(`${endIso.slice(0, 10)}T00:00:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

export { factorFromPeriod, periodFromFactor, periodLabel } from "./distributionPeriod"
export type { DistributionPeriod } from "./distributionPeriod"
export type { PreferredDayCountMode, InvestmentAccrualLine }

export function defaultPayToForKind(
  kind: DistributionWfKind,
  classes: DistributionSetupClass[],
): string[] {
  if (kind === "LP_PREF" || kind === "ROC")
    return classes.filter((c) => c.classType === "lp").map((c) => c.id)
  if (kind === "PREF_CURRENT" || kind === "PREF_ACCRUED")
    return classes
      .filter((c) => c.classType === "preferred_equity")
      .map((c) => c.id)
  if (kind === "CATCHUP")
    return classes.filter((c) => c.classType === "gp").map((c) => c.id)
  return []
}

/** Re-export period window helper for callers that need start/end. */
export { getPeriodWindow }

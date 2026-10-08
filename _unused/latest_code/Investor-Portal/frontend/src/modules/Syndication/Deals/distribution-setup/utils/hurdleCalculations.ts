/**
 * Hurdle metrics and waterfall decision helpers.
 * Independent of Excel — XIRR via Newton-Raphson; CoC / preferred are arithmetic.
 */

export type HurdleMetricType = "IRR" | "CashOnCash" | "CumulativeReturn"

export interface HurdleCashFlow {
  date: Date
  /** Negative for investments, positive for distributions. */
  amount: number
}

export interface Hurdle {
  type: HurdleMetricType
  /** Decimal rate, e.g. 0.12 for 12%. */
  hurdleRate: number
  lpShare: number
  gpShare: number
}

export interface WaterfallInput {
  cashFlows: HurdleCashFlow[]
  availableCash: number
  investedCapital: number
  /** 4 quarterly, 12 monthly, 1 annual. */
  periodsPerYear: number
  /** Current-period distribution used for Cash-on-Cash (defaults to availableCash). */
  distribution?: number
  /** Sum of distributions to date for Cumulative Return (optional). */
  cumulativeDistributions?: number
}

export interface HurdleEvaluation {
  type: HurdleMetricType
  metric: number | null
  hurdleRate: number
  hurdleMet: boolean
  canEvaluate: boolean
  /** Excel-style running remaining balance for this hurdle (<= 0 means cleared). */
  accruedBalance?: number
  detail: string
}

export interface WaterfallHurdleResult {
  evaluations: HurdleEvaluation[]
  /** First unmet hurdle index, or hurdles.length if all met. */
  activeHurdleIndex: number
  /** Promote stage index used for residual split (0 = base). */
  activeStage: number
  allHurdlesMet: boolean
}

const MS_PER_DAY = 86_400_000
const XIRR_MAX_ITER = 100
const XIRR_TOL = 1e-7

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_DAY
}

function npvAtRate(cashFlows: HurdleCashFlow[], rate: number): number {
  const t0 = cashFlows[0]!.date
  let npv = 0
  for (const cf of cashFlows) {
    const years = daysBetween(t0, cf.date) / 365
    npv += cf.amount / Math.pow(1 + rate, years)
  }
  return npv
}

function npvDerivative(cashFlows: HurdleCashFlow[], rate: number): number {
  const t0 = cashFlows[0]!.date
  let d = 0
  for (const cf of cashFlows) {
    const years = daysBetween(t0, cf.date) / 365
    if (years === 0) continue
    d += (-years * cf.amount) / Math.pow(1 + rate, years + 1)
  }
  return d
}

/**
 * Dated IRR (XIRR). Solves Σ CF_i / (1+r)^(days_i/365) = 0 via Newton-Raphson,
 * with bisection fallback. Returns null when no meaningful solution exists.
 */
export function calculateXIRR(
  cashFlows: HurdleCashFlow[],
  guess = 0.1,
): number | null {
  const flows = cashFlows
    .filter((cf) => Number.isFinite(cf.amount) && cf.date instanceof Date)
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (flows.length < 2) return null

  const hasPos = flows.some((cf) => cf.amount > 0)
  const hasNeg = flows.some((cf) => cf.amount < 0)
  if (!hasPos || !hasNeg) return null

  let rate = guess
  for (let i = 0; i < XIRR_MAX_ITER; i++) {
    const f = npvAtRate(flows, rate)
    const df = npvDerivative(flows, rate)
    if (!Number.isFinite(f) || !Number.isFinite(df) || Math.abs(df) < 1e-12) {
      break
    }
    const next = rate - f / df
    if (!Number.isFinite(next) || next <= -0.999999) break
    if (Math.abs(next - rate) < XIRR_TOL) {
      return clampIrr(next)
    }
    rate = next
  }

  // Bisection fallback on a wide bracket
  let lo = -0.99
  let hi = 10
  let flo = npvAtRate(flows, lo)
  let fhi = npvAtRate(flows, hi)
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) {
    // Expand high bound once
    hi = 100
    fhi = npvAtRate(flows, hi)
    if (!Number.isFinite(fhi) || flo * fhi > 0) return null
  }

  for (let i = 0; i < XIRR_MAX_ITER; i++) {
    const mid = (lo + hi) / 2
    const fmid = npvAtRate(flows, mid)
    if (!Number.isFinite(fmid) || Math.abs(fmid) < XIRR_TOL) {
      return clampIrr(mid)
    }
    if (flo * fmid <= 0) {
      hi = mid
      fhi = fmid
    } else {
      lo = mid
      flo = fmid
    }
    if (Math.abs(hi - lo) < XIRR_TOL) return clampIrr(mid)
  }

  return clampIrr((lo + hi) / 2)
}

function clampIrr(r: number): number | null {
  if (!Number.isFinite(r) || r <= -1) return null
  return r
}

/** Current IRR >= Hurdle IRR */
export function isIrrHurdleMet(irr: number, hurdleRate: number): boolean {
  return irr >= hurdleRate
}

/**
 * Cash-on-Cash annualized yield:
 * CoC = (distribution / investedCapital) × periodsPerYear
 */
export function calculateCashOnCash(
  distribution: number,
  investedCapital: number,
  periodsPerYear: number,
): number | null {
  if (!(investedCapital > 0) || !(periodsPerYear > 0)) return null
  if (!Number.isFinite(distribution)) return null
  return (distribution / investedCapital) * periodsPerYear
}

export function isCashOnCashHurdleMet(
  cashOnCash: number,
  hurdleRate: number,
): boolean {
  return cashOnCash >= hurdleRate
}

/**
 * Cumulative return = total distributions / invested capital
 * (compared to hurdleRate on the same decimal scale, e.g. 1.0 = 100% returned).
 */
export function calculateCumulativeReturn(
  cumulativeDistributions: number,
  investedCapital: number,
): number | null {
  if (!(investedCapital > 0)) return null
  if (!Number.isFinite(cumulativeDistributions)) return null
  return cumulativeDistributions / investedCapital
}

/**
 * Preferred return for one period:
 * PreferredReturn = OutstandingCapital × (PreferredRate / PeriodsPerYear)
 */
export function calculatePeriodPreferredReturn(
  outstandingCapital: number,
  preferredRate: number,
  periodsPerYear: number,
): number {
  if (!(periodsPerYear > 0)) return 0
  return outstandingCapital * (preferredRate / periodsPerYear)
}

/**
 * Accrued preferred when unpaid amounts compound/carry:
 * NewAccruedPref = PreviousAccruedPref + CurrentPeriodPref − PreferredReturnPaid
 */
export function calculateAccruedPreferredReturn(
  previousAccruedPref: number,
  periodPref: number,
  amountPaidTowardsPref: number,
): number {
  return Math.max(
    0,
    previousAccruedPref + periodPref - amountPaidTowardsPref,
  )
}

export function periodsPerYearFromFactor(periodFactor: number): number {
  if (periodFactor <= 0) return 4
  const n = Math.round(1 / periodFactor)
  if (n === 12 || n === 4 || n === 1) return n
  return 1 / periodFactor
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d))
}

function startOfMonthUtc(d: Date): Date {
  return utcDate(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

function addMonthsUtc(d: Date, n: number): Date {
  return utcDate(d.getUTCFullYear(), d.getUTCMonth() + n, 1)
}

function startOfNextMonthUtc(d: Date): Date {
  return addMonthsUtc(startOfMonthUtc(d), 1)
}

function startOfNextQuarterUtc(d: Date): Date {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const qStart = Math.floor(m / 3) * 3
  return addMonthsUtc(utcDate(y, qStart, 1), 3)
}

function startOfNextAnnualAnniversaryUtc(d: Date): Date {
  // Excel-like annual grid from the investment month/day, next year onward.
  return utcDate(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate())
}

function periodStartForConvention(d: Date, periodsPerYear: number): Date {
  if (periodsPerYear >= 11) return startOfNextMonthUtc(d)
  if (periodsPerYear >= 3 && periodsPerYear <= 5) return startOfNextQuarterUtc(d)
  return startOfNextAnnualAnniversaryUtc(d)
}

function nextPeriodStart(d: Date, periodsPerYear: number): Date {
  if (periodsPerYear >= 11) return addMonthsUtc(d, 1)
  if (periodsPerYear >= 3 && periodsPerYear <= 5) return addMonthsUtc(d, 3)
  return utcDate(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate())
}

function runningHurdleBalance(params: {
  hurdleType: HurdleMetricType
  hurdleRate: number
  input: WaterfallInput
}): number | null {
  const { hurdleType, hurdleRate, input } = params
  if (!(input.investedCapital > 0) || !(input.periodsPerYear > 0)) return null

  const flows = (input.cashFlows ?? [])
    .filter((cf) => cf.date instanceof Date && Number.isFinite(cf.amount))
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  if (flows.length === 0) return null

  // Anchor to earliest negative cash flow (investment), fallback earliest flow date.
  const firstNeg = flows.find((f) => f.amount < 0)
  const t0 = firstNeg?.date ?? flows[0]!.date
  const asOf = flows[flows.length - 1]!.date
  let periodStart = periodStartForConvention(t0, input.periodsPerYear)
  // If asOf is before the first accrual boundary, nothing accrued yet.
  if (asOf.getTime() < periodStart.getTime()) return 0

  const periodReq = input.investedCapital * (hurdleRate / input.periodsPerYear)
  const periodRate = hurdleRate / input.periodsPerYear
  let bal = 0

  /**
   * Convention aligned to the sheet:
   * - Accrual starts at the NEXT period boundary after investment date.
   * - Monthly/quarterly boundaries are calendar boundaries (next month / next quarter start).
   * - Annual boundary is next investment anniversary.
   * - Distributions are netted when their date is in (prevBoundary, currentBoundary].
   * - Mid-period dates are not pro-rated; they land in the enclosing period bucket.
   */
  let prevBoundary = t0
  while (periodStart.getTime() <= asOf.getTime()) {
    if (hurdleType === "IRR") {
      // Excel-like compounding running target.
      bal = bal * (1 + periodRate) + periodReq
    } else if (hurdleType === "CashOnCash") {
      // Simple running required distribution target.
      bal += periodReq
    } else {
      // Cumulative return: equivalent target is capital * hurdle multiple.
      bal = input.investedCapital * hurdleRate
    }
    // Apply positive distributions in this period bucket.
    let distInBucket = 0
    for (const cf of flows) {
      if (cf.amount <= 0) continue
      const ts = cf.date.getTime()
      if (ts > prevBoundary.getTime() && ts <= periodStart.getTime()) {
        distInBucket += cf.amount
      }
    }
    bal -= distInBucket

    // IRR-style running balances in the sheet are treated as "cleared" at 0.
    if (hurdleType === "IRR" && bal < 0) bal = 0

    prevBoundary = periodStart
    periodStart = nextPeriodStart(periodStart, input.periodsPerYear)
  }
  return bal
}

export function evaluateHurdle(
  hurdle: Hurdle,
  input: WaterfallInput,
): HurdleEvaluation {
  const { type, hurdleRate } = hurdle

  if (type === "IRR") {
    const irr = calculateXIRR(input.cashFlows)
    const remaining = runningHurdleBalance({
      hurdleType: type,
      hurdleRate,
      input,
    })
    if (irr == null) {
      return {
        type,
        metric: null,
        hurdleRate,
        hurdleMet: false,
        canEvaluate: false,
        detail: "Need dated cash flows (investment + distributions) for IRR",
      }
    }
    const hurdleMet =
      remaining != null ? remaining <= 0.005 : isIrrHurdleMet(irr, hurdleRate)
    return {
      type,
      metric: irr,
      hurdleRate,
      hurdleMet,
      canEvaluate: true,
      ...(remaining != null ? { accruedBalance: remaining } : {}),
      detail:
        remaining != null
          ? `IRR ${(irr * 100).toFixed(1)}% · running balance ${
              remaining <= 0 ? "cleared" : "remaining"
            } ${Math.abs(remaining).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            })}`
          : `IRR ${(irr * 100).toFixed(1)}% ${hurdleMet ? "≥" : "<"} ${(hurdleRate * 100).toFixed(1)}%`,
    }
  }

  if (type === "CashOnCash") {
    const distribution =
      input.distribution ?? input.availableCash
    const coc = calculateCashOnCash(
      distribution,
      input.investedCapital,
      input.periodsPerYear,
    )
    if (coc == null) {
      return {
        type,
        metric: null,
        hurdleRate,
        hurdleMet: false,
        canEvaluate: false,
        detail: "Need invested capital and periods/year for Cash-on-Cash",
      }
    }
    const remaining = runningHurdleBalance({
      hurdleType: type,
      hurdleRate,
      input,
    })
    const hurdleMet =
      remaining != null
        ? remaining <= 0.005
        : isCashOnCashHurdleMet(coc, hurdleRate)
    return {
      type,
      metric: coc,
      hurdleRate,
      hurdleMet,
      canEvaluate: true,
      ...(remaining != null ? { accruedBalance: remaining } : {}),
      detail:
        remaining != null
          ? `CoC ${(coc * 100).toFixed(1)}% annualized · running balance ${
              remaining <= 0 ? "cleared" : "remaining"
            } ${Math.abs(remaining).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            })}`
          : `CoC ${(coc * 100).toFixed(1)}% ${hurdleMet ? "≥" : "<"} ${(hurdleRate * 100).toFixed(1)}%`,
    }
  }

  // CumulativeReturn
  const cumulative =
    input.cumulativeDistributions ??
    input.cashFlows
      .filter((cf) => cf.amount > 0)
      .reduce((s, cf) => s + cf.amount, 0)
  const cum = calculateCumulativeReturn(cumulative, input.investedCapital)
  if (cum == null) {
    return {
      type,
      metric: null,
      hurdleRate,
      hurdleMet: false,
      canEvaluate: false,
      detail: "Need invested capital for cumulative return",
    }
  }
  const hurdleMet = cum >= hurdleRate
  return {
    type,
    metric: cum,
    hurdleRate,
    hurdleMet,
    canEvaluate: true,
    detail: `Cumulative ${(cum * 100).toFixed(1)}% ${hurdleMet ? "≥" : "<"} ${(hurdleRate * 100).toFixed(1)}%`,
  }
}

/**
 * Walk hurdles in order. While each metric ≥ required return, advance.
 * Stop at the first unmet hurdle (that stage receives residual cash).
 * If every hurdle is satisfied, use the final promote stage.
 */
export function evaluateWaterfallHurdles(
  hurdles: Hurdle[],
  input: WaterfallInput,
): WaterfallHurdleResult {
  const evaluations: HurdleEvaluation[] = []
  let activeHurdleIndex = hurdles.length

  for (let i = 0; i < hurdles.length; i++) {
    const ev = evaluateHurdle(hurdles[i]!, input)
    evaluations.push(ev)
    if (!ev.canEvaluate || !ev.hurdleMet) {
      activeHurdleIndex = i
      break
    }
  }

  const allHurdlesMet = activeHurdleIndex >= hurdles.length
  // Stage 0 = base; stage k = after hurdle k is met
  const activeStage = allHurdlesMet
    ? hurdles.length
    : activeHurdleIndex

  return {
    evaluations,
    activeHurdleIndex,
    activeStage,
    allHurdlesMet,
  }
}

/** Map Class Setup / promote basis labels onto metric types. */
export function promoteBasisToHurdleType(basis: string): HurdleMetricType {
  const b = basis.trim().toLowerCase()
  if (b === "irr") return "IRR"
  if (b === "cash-on-cash" || b === "cash on cash" || b === "coc")
    return "CashOnCash"
  return "CumulativeReturn"
}

/**
 * Build Hurdle[] from promote schedule rows.
 * Rates in promote UI are percentages (e.g. "12"); shares are % strings per stage.
 * Stage `hurdleIndex + 1` shares are the split once that hurdle is cleared
 * (used as lp/gp illustrative shares when only two equity parties exist).
 */
export function hurdlesFromPromote(promote: {
  hurdles: Array<{ rate: string; basis: string }>
  shares?: Record<string, string[]>
}): Hurdle[] {
  const classIds = Object.keys(promote.shares ?? {})
  return (promote.hurdles ?? []).map((h, i) => {
    const stage = i + 1
    let lpShare = 0.8
    let gpShare = 0.2
    if (classIds.length >= 2 && promote.shares) {
      const a = Number(String(promote.shares[classIds[0]!]?.[stage] ?? "").replace(/[%,\s]/g, ""))
      const b = Number(String(promote.shares[classIds[1]!]?.[stage] ?? "").replace(/[%,\s]/g, ""))
      const tot = (Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0)
      if (tot > 0) {
        lpShare = (Number.isFinite(a) ? a : 0) / tot
        gpShare = (Number.isFinite(b) ? b : 0) / tot
      }
    }
    return {
      type: promoteBasisToHurdleType(h.basis),
      hurdleRate: (Number(String(h.rate).replace(/[%,\s]/g, "")) || 0) / 100,
      lpShare,
      gpShare,
    }
  })
}

/**
 * Stage-met map for the distribution simulator (keys = hurdle number 1..n).
 * Uses calculated metrics when evaluable; otherwise leaves the key unset
 * so a manual override can fill the gap (e.g. IRR without cash-flow history).
 */
export function computeStageMetFromHurdles(
  promote: {
    hurdles: Array<{ rate: string; basis: string }>
    shares?: Record<string, string[]>
  },
  input: WaterfallInput,
  manualOverrides: Record<number, boolean> = {},
): {
  stageMet: Record<number, boolean>
  evaluations: HurdleEvaluation[]
} {
  const hurdles = hurdlesFromPromote(promote)
  const { evaluations } = evaluateWaterfallHurdles(hurdles, input)
  const stageMet: Record<number, boolean> = {}

  evaluations.forEach((ev, i) => {
    const stage = i + 1
    if (manualOverrides[stage] != null) {
      stageMet[stage] = manualOverrides[stage]!
      return
    }
    if (ev.canEvaluate) {
      stageMet[stage] = ev.hurdleMet
    }
  })

  // Manual keys for hurdles we couldn't evaluate
  Object.entries(manualOverrides).forEach(([k, v]) => {
    const stage = Number(k)
    if (Number.isFinite(stage) && stageMet[stage] == null) {
      stageMet[stage] = v
    }
  })

  return { stageMet, evaluations }
}

/** Build minimal dated cash flows: −investment at start, then listed distributions. */
export function buildCashFlows(params: {
  investmentAmount: number
  investmentDate: Date
  distributions: Array<{ amount: number; date: Date }>
}): HurdleCashFlow[] {
  const flows: HurdleCashFlow[] = [
    { date: params.investmentDate, amount: -Math.abs(params.investmentAmount) },
  ]
  for (const d of params.distributions) {
    if (!Number.isFinite(d.amount) || d.amount === 0) continue
    flows.push({ date: d.date, amount: d.amount })
  }
  return flows
}

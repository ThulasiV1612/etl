/**
 * Distribution period helpers — monthly / quarterly / yearly windows
 * and remaining dues after prior payments in the same window.
 */

export type DistributionPeriod = "monthly" | "quarterly" | "annual"

export type PeriodWindow = {
  period: DistributionPeriod
  /** Inclusive start YYYY-MM-DD */
  start: string
  /** Inclusive end YYYY-MM-DD */
  end: string
  label: string
}

export function periodFromFactor(periodFactor: number): DistributionPeriod {
  const n = Math.round(1 / (periodFactor > 0 ? periodFactor : 0.25))
  if (n === 12) return "monthly"
  if (n === 1) return "annual"
  return "quarterly"
}

export function factorFromPeriod(period: DistributionPeriod): number {
  if (period === "monthly") return 1 / 12
  if (period === "annual") return 1
  return 0.25
}

export function periodsPerYear(period: DistributionPeriod): number {
  if (period === "monthly") return 12
  if (period === "annual") return 1
  return 4
}

export function periodLabel(period: DistributionPeriod): string {
  if (period === "monthly") return "Monthly"
  if (period === "annual") return "Annual"
  return "Quarterly"
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function toIsoDate(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`
}

function parseIso(iso: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!m) return null
  return {
    y: Number(m[1]),
    m0: Number(m[2]) - 1,
    d: Number(m[3]),
  }
}

function lastDayOfMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate()
}

/** Calendar window for the distribution date under the selected period. */
export function getPeriodWindow(
  asOfIso: string,
  period: DistributionPeriod,
): PeriodWindow {
  const p = parseIso(asOfIso) ?? parseIso(new Date().toISOString())!
  const { y, m0 } = p

  if (period === "monthly") {
    const endD = lastDayOfMonth(y, m0)
    return {
      period,
      start: toIsoDate(y, m0, 1),
      end: toIsoDate(y, m0, endD),
      label: `${periodLabel(period)} · ${toIsoDate(y, m0, 1).slice(0, 7)}`,
    }
  }

  if (period === "annual") {
    return {
      period,
      start: toIsoDate(y, 0, 1),
      end: toIsoDate(y, 11, 31),
      label: `${periodLabel(period)} · ${y}`,
    }
  }

  // Quarterly — calendar quarters
  const q = Math.floor(m0 / 3)
  const startM = q * 3
  const endM = startM + 2
  return {
    period,
    start: toIsoDate(y, startM, 1),
    end: toIsoDate(y, endM, lastDayOfMonth(y, endM)),
    label: `${periodLabel(period)} · Q${q + 1} ${y}`,
  }
}

export function dateInWindow(iso: string, window: PeriodWindow): boolean {
  const d = iso.trim().slice(0, 10)
  return d >= window.start && d <= window.end
}

export type PriorCashLike = {
  id?: string
  amount: number | string
  date: string
}

function toAmount(v: number | string): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const n = Number(String(v).replace(/[$,%\s,]/g, ""))
  return Number.isFinite(n) ? n : 0
}

/** Sum prior distribution cash that falls in the same period window. */
export function sumPriorCashInPeriod(params: {
  priors: PriorCashLike[]
  asOfIso: string
  period: DistributionPeriod
  /** Exclude this completed-run id (when re-simulating a specific record). */
  excludeId?: string
  /** When set, use this window instead of deriving from as-of + period. */
  windowOverride?: Pick<PeriodWindow, "start" | "end"> & { label?: string }
}): { window: PeriodWindow; priorCash: number; priorCount: number } {
  const period = params.period
  const window: PeriodWindow = params.windowOverride
    ? {
        period,
        start: params.windowOverride.start.slice(0, 10),
        end: params.windowOverride.end.slice(0, 10),
        label:
          params.windowOverride.label?.trim() ||
          `${periodLabel(period)} · ${params.windowOverride.start.slice(0, 10)} → ${params.windowOverride.end.slice(0, 10)}`,
      }
    : getPeriodWindow(params.asOfIso, period)
  let priorCash = 0
  let priorCount = 0
  for (const row of params.priors) {
    if (params.excludeId && row.id && row.id === params.excludeId) continue
    const date = String(row.date ?? "").slice(0, 10)
    if (!dateInWindow(date, window)) continue
    // Only count priors on or before as-of (same-day earlier runs still count by id order handled by caller)
    if (date > params.asOfIso.slice(0, 10)) continue
    const amt = toAmount(row.amount)
    if (!(amt > 0)) continue
    priorCash += amt
    priorCount += 1
  }
  return { window, priorCash, priorCount }
}

/**
 * Full period obligation for a preferred-style tier:
 * capital × annualRate ÷ periodsPerYear
 */
export function periodPreferredDue(
  capital: number,
  annualRateDecimal: number,
  period: DistributionPeriod,
): number {
  const ppy = periodsPerYear(period)
  if (!(ppy > 0) || !(capital > 0) || !(annualRateDecimal > 0)) return 0
  return capital * (annualRateDecimal / ppy)
}

/**
 * Apply prior same-period cash against preferred dues in waterfall order.
 * Returns remaining due for this row after absorbing prior cash.
 */
export function remainingDueAfterPriorPool(
  fullDue: number,
  priorPoolRemaining: number,
): { remainingDue: number; poolLeft: number; appliedFromPrior: number } {
  const due = Math.max(0, fullDue)
  const applied = Math.min(priorPoolRemaining, due)
  return {
    remainingDue: Math.max(0, due - applied),
    poolLeft: Math.max(0, priorPoolRemaining - applied),
    appliedFromPrior: applied,
  }
}

/**
 * Cash-on-cash for the selected period using all cash in that window
 * (priors in window + current run), annualized:
 * CoC = (cashInPeriod / investedCapital) × periodsPerYear
 */
export function calculatePeriodCashOnCash(params: {
  cashInPeriod: number
  investedCapital: number
  period: DistributionPeriod
}): number | null {
  const { cashInPeriod, investedCapital, period } = params
  if (!(investedCapital > 0)) return null
  if (!Number.isFinite(cashInPeriod)) return null
  return (cashInPeriod / investedCapital) * periodsPerYear(period)
}

/**
 * Excel-style monthly CoC / preferred accrual ledger.
 * Accrues capital × annualRate / 12 each month, then nets distributions.
 * Allows negative balance after large distributions (like the sheet).
 */
export function monthlyAccruedBalance(params: {
  capital: number
  annualRateDecimal: number
  investmentDateIso: string
  asOfIso: string
  distributions: Array<{ amount: number; date: string }>
}): number {
  const capital = params.capital
  const rate = params.annualRateDecimal
  if (!(capital > 0) || !(rate > 0)) return 0

  const start = parseIso(params.investmentDateIso)
  const end = parseIso(params.asOfIso)
  if (!start || !end) return 0

  const monthly = capital * (rate / 12)
  let balance = 0

  // Accrue starting the month after investment (or same month if mid-month — accrue full month for simplicity)
  let y = start.y
  let m0 = start.m0

  const endKey = end.y * 12 + end.m0
  let key = y * 12 + m0

  const dists = [...params.distributions]
    .map((d) => ({
      amount: toAmount(d.amount),
      date: String(d.date).slice(0, 10),
    }))
    .filter((d) => d.amount !== 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => a.date.localeCompare(b.date))

  while (key <= endKey) {
    balance += monthly
    const monthStart = toIsoDate(y, m0, 1)
    const monthEnd = toIsoDate(y, m0, lastDayOfMonth(y, m0))
    for (const d of dists) {
      if (d.date >= monthStart && d.date <= monthEnd) {
        balance -= d.amount
      }
    }
    m0 += 1
    if (m0 > 11) {
      m0 = 0
      y += 1
    }
    key = y * 12 + m0
  }

  return balance
}

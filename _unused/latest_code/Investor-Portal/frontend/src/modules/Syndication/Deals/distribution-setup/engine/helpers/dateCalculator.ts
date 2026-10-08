/**
 * Day-count helpers for preferred / CoC accrual (portal parity: actual/365).
 */

const MS_PER_DAY = 86_400_000

/** Inclusive day count between two ISO dates (YYYY-MM-DD). */
export function inclusiveDayCount(params: {
  startIso: string
  endIso: string
}): number {
  const start = parseIsoDate(params.startIso)
  const end = parseIsoDate(params.endIso)
  if (!start || !end || end.getTime() < start.getTime()) return 0
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1
}

export function parseIsoDate(iso: string): Date | null {
  const t = String(iso ?? "").trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const d = new Date(`${t}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function maxIsoDate(a: string, b: string): string {
  return a >= b ? a : b
}

/**
 * Accrual window for a distribution period:
 * later of (accrualStart, periodStart) through periodEnd (inclusive).
 */
export function accrualDayCount(params: {
  accrualStartIso: string
  periodStartIso: string
  periodEndIso: string
}): number {
  const start = maxIsoDate(
    params.accrualStartIso.slice(0, 10),
    params.periodStartIso.slice(0, 10),
  )
  return inclusiveDayCount({
    startIso: start,
    endIso: params.periodEndIso.slice(0, 10),
  })
}

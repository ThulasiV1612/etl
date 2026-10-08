const ONE_MILLION = 1_000_000
const ONE_BILLION = 1_000_000_000

/** Full USD for tooltips (always 2 fraction digits). */
export function formatCardCompactUsdExact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0)
}

function formatFullUsdBelowCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatFullUsdTable(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatScaledCompact(
  n: number,
  divisor: number,
  suffix: "M" | "B",
): string {
  const scaled = Math.abs(n) / divisor
  const rounded = Math.round(scaled * 100) / 100
  const [whole, fracRaw = ""] = rounded.toFixed(2).split(".")
  const frac = fracRaw.replace(/0+$/, "")
  const core = frac ? `${whole}.${frac}` : whole
  const prefix = n < 0 ? "-$" : "$"
  return `${prefix}${core}${suffix}`
}

export type CompactUsdDisplayMode = "default" | "table"

function formatCompactUsdDisplay(n: number, mode: CompactUsdDisplayMode): string {
  if (!Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  if (abs >= ONE_BILLION) return formatScaledCompact(n, ONE_BILLION, "B")
  if (abs >= ONE_MILLION) return formatScaledCompact(n, ONE_MILLION, "M")
  return mode === "table" ? formatFullUsdTable(n) : formatFullUsdBelowCompact(n)
}

/**
 * Read-only display: full amount below $1M; `$1M`, `$1.5M`, `$2.3B` at/above $1M.
 */
export function formatCardCompactUsdDisplay(n: number): string {
  return formatCompactUsdDisplay(n, "default")
}

/** Datatable cells: always 2 fraction digits below $1M. */
export function formatTableCompactUsdDisplay(n: number): string {
  return formatCompactUsdDisplay(n, "table")
}

/** True when letter abbreviation is used (show exact amount in tooltip). */
export function shouldShowCardCompactUsdTooltip(n: number): boolean {
  if (!Number.isFinite(n)) return false
  return Math.abs(n) >= ONE_MILLION
}

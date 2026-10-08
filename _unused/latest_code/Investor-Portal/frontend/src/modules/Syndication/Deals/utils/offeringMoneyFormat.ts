import type { DealInvestorRow } from "../types/deal-investors.types"
import { investorRowIsFundApproved } from "./dealInvestorTableDisplay"

/** Parse a money-ish string (with $, commas) to a number. */
export function parseMoneyDigits(s: string): number {
  if (s == null || !String(s).trim()) return NaN
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : NaN
}

/**
 * USD for deal investor / member tables: always two fraction digits (e.g. $1,234.00).
 */
export function formatCurrencyTableDisplay(raw: string | undefined | null): string {
  const t = String(raw ?? "").trim()
  if (!t || t === "—") return "—"
  const n = parseMoneyDigits(t)
  if (!Number.isFinite(n)) return t
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/**
 * CSV / Excel-friendly amount: plain digits with two decimals, no `$` or commas
 * (e.g. 1234.00) so spreadsheet apps treat the cell as a number.
 */
export function formatAmountNumberExport(
  raw: string | number | null | undefined,
): string {
  if (raw == null) return ""
  const t = String(raw).trim()
  if (!t || t === "—") return ""
  const n = typeof raw === "number" ? raw : parseMoneyDigits(t)
  if (!Number.isFinite(n)) return ""
  return (Math.round(n * 100) / 100).toFixed(2)
}

/** USD $0.00 for committed amount when none or zero (matches table column). */
export function formatCommittedZeroUsd(): string {
  return formatCurrencyTableDisplay("0")
}

/**
 * Sum commitment + extra amounts (same idea as backend `formatCommitted`) for display
 * when the API omits a pre-formatted `committed` string but sends raw amounts.
 */
export function formatCommittedFromRawParts(
  commitmentAmount: string,
  extras: string[],
): string {
  const raw = [commitmentAmount, ...extras.map(String)]
  const nums = raw
    .map((s) => parseFloat(String(s).replace(/[^0-9.-]/g, "")))
    .filter((n) => Number.isFinite(n))
  if (nums.length === 0) return "—"
  const sum = nums.reduce((a, b) => a + b, 0)
  return formatCurrencyTableDisplay(String(sum))
}

/**
 * Committed column: use API `committed` when set; otherwise derive from
 * `commitmentAmountRaw` + `extraContributionAmounts` (same as table normalization).
 */
export function displayInvestorCommittedAmount(row: DealInvestorRow): string {
  const c = String(row.committed ?? "").trim()
  if (c && c !== "—") return formatCurrencyTableDisplay(c)
  const fromParts = formatCommittedFromRawParts(
    String(row.commitmentAmountRaw ?? "").trim(),
    row.extraContributionAmounts ?? [],
  )
  if (fromParts !== "—") return fromParts
  return formatCommittedZeroUsd()
}

/**
 * When fund is not yet re-approved after an LP increase: last approved total vs additional commitment.
 * Used for Committed column split display.
 */
export function investorCommittedPendingSplit(row: DealInvestorRow): {
  snapshot: number
  incremental: number
} | null {
  if (investorRowIsFundApproved(row)) return null
  const snapRaw = String(row.fundApprovedCommitmentSnapshot ?? "").trim()
  if (!snapRaw) return null
  const snapshot = parseMoneyDigits(snapRaw)
  if (!Number.isFinite(snapshot) || snapshot <= 0) return null
  const total = parseMoneyDigits(displayInvestorCommittedAmount(row))
  if (!Number.isFinite(total)) return null
  const incremental = Math.round((total - snapshot) * 100) / 100
  if (incremental <= 0.009) return null
  return { snapshot, incremental }
}

/** Plain text / CSV when split applies: `100.00 + 50.00`. */
export function displayInvestorCommittedAmountExport(row: DealInvestorRow): string {
  const split = investorCommittedPendingSplit(row)
  if (!split) return formatAmountNumberExport(displayInvestorCommittedAmount(row))
  return `${formatAmountNumberExport(split.snapshot)} + ${formatAmountNumberExport(split.incremental)}`
}

/**
 * Statuses that count toward Total Funded even when Funded column is Not Approved
 * (legacy / imported rows, e.g. “Funds partially received”).
 */
function investmentStatusCountsTowardFunded(
  status: string | undefined | null,
): boolean {
  const raw = String(status ?? "").trim()
  if (!raw || raw === "—") return false
  if (/funds?\s+fully\s+received/i.test(raw)) return true
  if (/funds?\s+partially\s+received/i.test(raw)) return true
  return false
}

/**
 * Dollars for the “Total Funded” KPI / class actually-funded.
 * Full commitment when fund-approved or funds received (fully / partially);
 * pending re-approval after an LP increase counts only the last approved snapshot.
 */
export function fundedAmountForTotalFundedKpi(row: DealInvestorRow): number {
  const total = parseMoneyDigits(displayInvestorCommittedAmount(row))
  if (!Number.isFinite(total) || total < 0) return 0
  if (investorRowIsFundApproved(row) || investmentStatusCountsTowardFunded(row.status))
    return total
  const split = investorCommittedPendingSplit(row)
  if (split) return split.snapshot
  return 0
}

/** Numeric committed total — same basis as syndication Investors tab Committed column. */
export function investorRowCommittedAmountNumeric(row: DealInvestorRow): number {
  const n = parseMoneyDigits(displayInvestorCommittedAmount(row))
  return Number.isFinite(n) ? n : 0
}

/** True when total committed (same basis as the Committed column) is zero. */
export function investorRowCommittedAmountIsZero(row: DealInvestorRow): boolean {
  return investorRowCommittedAmountNumeric(row) === 0
}

/** Deal Members: committed total from other investors this member added (see API field). */
export function displayAddedInvestorsCommittedAmount(row: DealInvestorRow): string {
  const c = String(row.addedInvestorsCommitted ?? "").trim()
  if (c && c !== "—") return formatCurrencyTableDisplay(c)
  return "—"
}

/** CSV export for Deal Members “Investors added” column. */
export function displayAddedInvestorsCommittedAmountExport(
  row: DealInvestorRow,
): string {
  const c = String(row.addedInvestorsCommitted ?? "").trim()
  if (c && c !== "—") return formatAmountNumberExport(c)
  return ""
}

/** Format for KPI / read-only display: $1,234 or $1,234.56 */
export function formatMoneyFieldDisplay(raw: string | undefined | null): string {
  if (raw == null || !String(raw).trim()) return "—"
  const n = parseMoneyDigits(String(raw))
  if (!Number.isFinite(n)) return String(raw).trim()
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

/** Normalize user input on blur to a consistent currency string. */
export function blurFormatMoneyInput(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  const n = parseMoneyDigits(t)
  if (!Number.isFinite(n)) return raw
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

/** Blur-format USD with commas and exactly two fraction digits (e.g. $1,234.00). */
export function blurFormatMoneyInputTwoDecimals(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  const n = parseMoneyDigits(t)
  if (!Number.isFinite(n)) return raw
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/**
 * While typing in amount fields: keep only digits and one decimal point.
 * This prevents alphabet/special chars before blur-formatting runs.
 */
export function sanitizeMoneyTypingInput(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "")
  if (!cleaned) return ""
  const [whole = "", ...rest] = cleaned.split(".")
  if (rest.length === 0) return whole
  return `${whole}.${rest.join("")}`
}

/** Percent typing: digits + one decimal point, max two fraction digits. */
export function sanitizePercentTypingInput(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "")
  if (!cleaned) return ""
  const [whole = "", ...rest] = cleaned.split(".")
  if (rest.length === 0) return whole
  const fractional = rest.join("").slice(0, 2)
  return `${whole}.${fractional}`
}

/** Percent blur format: always `NN.NN%` when value is present. */
export function blurFormatPercentTwoDecimalsInput(raw: string): string {
  const t = sanitizePercentTypingInput(raw)
  if (!t) return ""
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return ""
  return `${n.toFixed(2)}%`
}

/**
 * Money fields while typing: format $ and commas as digits are entered
 * (same end result as blur, but applied on every keystroke).
 */
export function formatCurrencyUsdTypeInput(raw: string): string {
  const t = String(raw ?? "").trim()
  if (!t) return ""

  const digits = t.replace(/[^0-9.]/g, "")
  if (!digits) return ""
  if (digits === ".") return "$."

  const endsWithDot = digits.endsWith(".")
  const [wholeRaw, fracRaw = ""] = digits.split(".")
  const wholeN = parseFloat(wholeRaw || "0")
  if (!Number.isFinite(wholeN)) return ""

  const wholeFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(wholeN)

  if (endsWithDot) return `${wholeFmt}.`

  if (digits.includes(".")) {
    const frac = fracRaw.slice(0, 2)
    if (!frac) return wholeFmt
    return `${wholeFmt}.${frac}`
  }

  return blurFormatMoneyInput(digits)
}

/**
 * Percent fields while typing: digits only (up to two decimals). No trailing `%`
 * so the caret stays on the number while editing.
 */
export function formatPercentTypeInputBare(raw: string, max?: number): string {
  let sanitized = sanitizePercentTypingInput(raw)
  if (!sanitized) return ""

  const n = parseFloat(sanitized)
  if (max !== undefined && Number.isFinite(n) && n > max) sanitized = String(max)

  const cap = (value: number) =>
    max === undefined ? value : Math.min(max, Math.max(0, value))

  if (sanitized.endsWith(".")) {
    const whole = sanitized.slice(0, -1)
    const wholeN = parseFloat(whole || "0")
    if (!Number.isFinite(wholeN)) return ""
    return `${cap(wholeN)}.`
  }

  if (sanitized.includes(".")) {
    const [w, f = ""] = sanitized.split(".")
    const wholeN = cap(parseFloat(w || "0"))
    const frac = f.slice(0, 2)
    return frac ? `${wholeN}.${frac}` : `${wholeN}`
  }

  const clamped = cap(parseFloat(sanitized))
  if (!Number.isFinite(clamped)) return ""
  return `${clamped}`
}

/**
 * Percent fields while typing: digits with a trailing % (up to two decimals).
 * Prefer {@link formatPercentTypeInputBare} for editable inputs (caret stays usable).
 */
export function formatPercentTypeInput(raw: string, max?: number): string {
  const bare = formatPercentTypeInputBare(raw, max)
  if (!bare) return ""
  return `${bare}%`
}

/** Percent blur format without trailing `%` — pairs with {@link formatPercentTypeInputBare}. */
export function blurFormatPercentTwoDecimalsInputBare(raw: string): string {
  const t = sanitizePercentTypingInput(raw)
  if (!t) return ""
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return ""
  return n.toFixed(2)
}

export function parseNumberOfUnitsDigits(raw: string): number {
  const t = String(raw ?? "").replace(/,/g, "").trim()
  if (!t) return NaN
  const n = parseFloat(t.replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) ? n : NaN
}

function formatUnitsWholeWithCommas(wholeDigits: string): string {
  if (!wholeDigits) return ""
  const n = parseInt(wholeDigits, 10)
  if (!Number.isFinite(n)) return wholeDigits
  return n.toLocaleString("en-US")
}

/** Strip to digits and at most one decimal point; whole part gets comma grouping. */
export function formatNumberOfUnitsTypingInput(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "")
  if (!cleaned) return ""
  const dot = cleaned.indexOf(".")
  if (dot === -1) return formatUnitsWholeWithCommas(cleaned)
  const whole = cleaned.slice(0, dot)
  const frac = cleaned.slice(dot + 1).replace(/\./g, "")
  const wholeFmt = formatUnitsWholeWithCommas(whole)
  if (!frac && cleaned.endsWith(".")) return `${wholeFmt}.`
  if (!frac) return wholeFmt
  return `${wholeFmt}.${frac}`
}

/** Unit count with comma grouping (no currency symbol). */
export function blurFormatNumberOfUnitsInput(raw: string): string {
  const n = parseNumberOfUnitsDigits(raw)
  if (!Number.isFinite(n) || n < 0) return ""
  const rounded =
    Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9
      ? Math.max(0, Math.round(n))
      : Math.round(n * 1e6) / 1e6
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(
    rounded,
  )
}

export function formatNumberOfUnitsDisplay(raw: string | undefined): string {
  const t = blurFormatNumberOfUnitsInput(String(raw ?? ""))
  return t || "—"
}

function stripLeadingUsdSymbol(formatted: string): string {
  return formatted.startsWith("$") ? formatted.slice(1) : formatted
}

/** Live-format without `$` — for inputs that show a separate currency prefix. */
export function formatCurrencyUsdTypeInputBare(raw: string): string {
  return stripLeadingUsdSymbol(formatCurrencyUsdTypeInput(raw))
}

/** Blur-format without `$` — pairs with {@link formatCurrencyUsdTypeInputBare}. */
export function blurFormatMoneyInputBare(raw: string): string {
  return stripLeadingUsdSymbol(blurFormatMoneyInput(raw))
}

/** Use on `onChange` for any USD amount field (formats $ and commas while typing). */
export function moneyAmountOnChange(raw: string): string {
  return formatCurrencyUsdTypeInput(raw)
}

/** Use on `onBlur` for any USD amount field. */
export function moneyAmountOnBlur(raw: string): string {
  return blurFormatMoneyInput(raw)
}

/** Use on `onBlur` when the field must always show two decimal places. */
export function moneyAmountOnBlurTwoDecimals(raw: string): string {
  return blurFormatMoneyInputTwoDecimals(raw)
}

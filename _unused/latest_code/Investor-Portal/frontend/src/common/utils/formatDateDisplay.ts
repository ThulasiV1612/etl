const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

function formatFromDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0")
  const mon = MONTH_SHORT[d.getMonth()] ?? "Jan"
  const y = d.getFullYear()
  return `${day}-${mon}-${y}`
}

/**
 * Application-wide calendar display: **DD-MMM-YYYY** (e.g. `03-Apr-2026`).
 * Accepts ISO strings, `Date`, common `m/d/y` inputs, and `YYYY-MM-DD` (uses local noon to avoid TZ shift).
 */
export function formatDateDdMmmYyyy(
  raw: string | Date | null | undefined,
): string {
  if (raw == null || raw === "") return "—"
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return "—"
    return formatFromDate(raw)
  }

  const s = String(raw).trim()
  if (s === "" || s === "—") return "—"

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return formatFromDate(d)
  }

  const isoTry = Date.parse(s)
  if (!Number.isNaN(isoTry)) {
    const d = new Date(isoTry)
    return formatFromDate(d)
  }

  const mdy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (mdy) {
    let month = Number(mdy[1])
    let day = Number(mdy[2])
    let year = Number(mdy[3])
    if (year < 100) year += year >= 70 ? 1900 : 2000
    if (month > 12 && day <= 12) {
      const t = month
      month = day
      day = t
    }
    const d = new Date(year, month - 1, day)
    if (!Number.isNaN(d.getTime())) return formatFromDate(d)
  }

  return s
}

/** Investors tab Signed column: workflow label or calendar date. */
export function formatInvestorSignedColumn(
  raw: string | null | undefined,
): string {
  const s = String(raw ?? "").trim()
  if (!s || s === "—") return "—"
  const lower = s.toLowerCase()
  if (lower === "sent" || lower === "pending") return "Sent"
  if (lower === "viewed") return "Viewed"
  if (lower === "signed") return "Signed"
  if (lower === "completed") return "Completed"
  return formatDateDdMmmYyyy(s)
}

/** Numeric sort key for values passed through {@link formatDateDdMmmYyyy}. */
export function dateSortValue(raw: string | undefined): number {
  if (raw == null) return 0
  const s = String(raw).trim()
  if (s === "" || s === "—") return 0
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`)
    return Number.isNaN(d.getTime()) ? 0 : d.getTime()
  }
  const t = Date.parse(s)
  if (!Number.isNaN(t)) return t
  const mdy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (mdy) {
    let month = Number(mdy[1])
    let day = Number(mdy[2])
    let year = Number(mdy[3])
    if (year < 100) year += year >= 70 ? 1900 : 2000
    if (month > 12 && day <= 12) {
      const t2 = month
      month = day
      day = t2
    }
    const d = new Date(year, month - 1, day)
    return d.getTime()
  }
  return 0
}

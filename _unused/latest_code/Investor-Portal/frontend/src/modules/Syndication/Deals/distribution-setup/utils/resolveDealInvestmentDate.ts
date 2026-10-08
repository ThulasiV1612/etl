import type { DealInvestorRow } from "../../types/deal-investors.types"

/** Normalize various date strings to `YYYY-MM-DD` for `<input type="date">`. */
export function toIsoDateOnly(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim()
  if (!t || t === "—") return null
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Deal-level investment date for waterfall / IRR simulation:
 * prefer deal close date, else earliest investor funded / invested date.
 */
export function resolveDealInvestmentDateIso(params: {
  closeDate?: string | null
  investors?: DealInvestorRow[]
}): string | null {
  const fromClose = toIsoDateOnly(params.closeDate)
  if (fromClose) return fromClose

  let earliest: string | null = null
  for (const inv of params.investors ?? []) {
    const candidate =
      toIsoDateOnly(inv.investedAtIso) ?? toIsoDateOnly(inv.fundedDate)
    if (!candidate) continue
    if (!earliest || candidate < earliest) earliest = candidate
  }
  return earliest
}

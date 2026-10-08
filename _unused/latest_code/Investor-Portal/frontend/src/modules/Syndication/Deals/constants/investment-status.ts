/**
 * Investment workflow statuses (Add Investment + investor Status column).
 * Includes deal-style offering states and post-signature / terminal workflow states.
 */
export const INVESTMENT_STATUS_SELECT_OPTIONS = [
  { value: "", label: "Select status" },
  {
    value: "Draft (hidden to investors)",
    label: "Draft (hidden to investors)",
  },
  {
    value: "Coming soon (no new investments allowed)",
    label: "Coming soon (no new investments allowed)",
  },
  { value: "Open to soft commitment", label: "Open to soft commitment" },
  { value: "Open to hard commitment", label: "Open to hard commitment" },
  { value: "Open to investment", label: "Open to investment" },
  {
    value: "Waitlist (new investments require approval)",
    label: "Waitlist (new investments require approval)",
  },
  {
    value: "Closed (no new investments allowed)",
    label: "Closed (no new investments allowed)",
  },
  { value: "Past (hidden)", label: "Past (hidden)" },
  { value: "Soft committed", label: "Soft committed" },
  { value: "Investment started", label: "Investment started" },
  {
    value: "Document signing started",
    label: "Document signing started",
  },
  { value: "Signed", label: "Signed" },
  { value: "Counter-signed", label: "Counter-signed" },
  {
    value: "Funding instructions sent",
    label: "Funding instructions sent",
  },
  {
    value: "Funds fully received (complete)",
    label: "Funds fully received (complete)",
  },
  {
    value: "Inactive (bought out, assigned, or sold)",
    label: "Inactive (bought out, assigned, or sold)",
  },
  {
    value: "Canceled (did not complete)",
    label: "Canceled (did not complete)",
  },
] as const

/** Status applied when a sponsor uses Approve fund on the Investors tab (kebab). */
export const INVESTMENT_STATUS_APPROVE_FUND = "Funding instructions sent" as const

export function investmentStatusLabel(value: string): string {
  if (!value?.trim()) return "—"
  const row = INVESTMENT_STATUS_SELECT_OPTIONS.find((o) => o.value === value)
  return row?.label ?? value
}

/**
 * Map API / table stored status to a select `value` for {@link INVESTMENT_STATUS_SELECT_OPTIONS}.
 */
export function resolveInvestmentStatusSelectValue(stored: string): string {
  const t = String(stored ?? "").trim()
  if (!t || t === "—") return ""
  const exact = INVESTMENT_STATUS_SELECT_OPTIONS.find((o) => o.value === t)
  if (exact) return exact.value
  const byLabel = INVESTMENT_STATUS_SELECT_OPTIONS.find(
    (o) => o.label.toLowerCase() === t.toLowerCase(),
  )
  if (byLabel) return byLabel.value
  const byValueLoose = INVESTMENT_STATUS_SELECT_OPTIONS.find(
    (o) => o.value.toLowerCase() === t.toLowerCase(),
  )
  return byValueLoose?.value ?? ""
}

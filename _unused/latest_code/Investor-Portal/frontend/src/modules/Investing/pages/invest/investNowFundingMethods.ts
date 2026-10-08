export const INVEST_NOW_FUNDING_METHOD_OPTIONS = [
  // Investor contributions: workflow (Stripe Checkout) — disabled for now
  // {
  //   value: "stripe_checkout",
  //   label: "Card or ACH (Stripe Checkout)",
  // },
  { value: "wire_transfer", label: "Wire transfer" },
  { value: "check", label: "Check" },
] as const

export type InvestNowFundingMethod =
  (typeof INVEST_NOW_FUNDING_METHOD_OPTIONS)[number]["value"]

export function investNowFundingMethodLabel(
  value: string | undefined,
): string {
  const v = String(value ?? "").trim()
  const row = INVEST_NOW_FUNDING_METHOD_OPTIONS.find((o) => o.value === v)
  return row?.label ?? (v || "—")
}

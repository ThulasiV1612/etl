/** LP invest-now wizard (`/deals/:dealId/invest`). */
export function dealInvestNowPath(dealId: string): string {
  const id = String(dealId ?? "").trim()
  if (!id) return "/deals"
  return `/deals/${encodeURIComponent(id)}/invest`
}

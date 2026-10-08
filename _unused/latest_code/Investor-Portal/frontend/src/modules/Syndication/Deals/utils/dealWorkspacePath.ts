/** LP / investing deal workspace (`/deals/:dealId`) — Invest now opens the modal here. */
export function dealWorkspacePath(dealId: string): string {
  const id = String(dealId ?? "").trim()
  if (!id) return "/deals"
  return `/deals/${encodeURIComponent(id)}`
}

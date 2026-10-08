import { useEffect } from "react"
import { formatTotalInvestmentUsd } from "./sponsorTotalsApi"

export interface UserManagementTotalInvestmentColumnProps {
  /** `users.id` from the member row */
  userId: string | undefined | null
  totalsByUserId: Map<string, number>
  loading?: boolean
}

/**
 * Presentational cell for **Total Investment** column.
 * Use with {@link useSponsorInvestmentTotals}. Non–sponsor users are not in the map → "—".
 */
export function UserManagementTotalInvestmentCell({
  userId,
  totalsByUserId,
  loading,
}: UserManagementTotalInvestmentColumnProps) {
  const id = String(userId ?? "").trim().toLowerCase()
  const hasTotal = Boolean(id && totalsByUserId.has(id))
  const n = hasTotal ? (totalsByUserId.get(id) ?? 0) : null
  const displayLabel = loading
    ? "loading"
    : !id || !hasTotal
      ? "—"
      : formatTotalInvestmentUsd(n ?? 0)

  useEffect(() => {
    console.log("[SponsorTotalInvestment] Total Investment cell", {
      userId: userId ?? null,
      normalizedId: id || null,
      loading: Boolean(loading),
      inTotalsMap: hasTotal,
      rawTotal: n,
      displayed: displayLabel,
    })
  }, [userId, id, loading, hasTotal, n, displayLabel])

  if (loading) {
    return <span className="um_status_muted">…</span>
  }
  if (!id || !hasTotal) {
    return <span className="um_status_muted">—</span>
  }
  return (
    <span className="um_total_investment_cell" title="Sum of LP investments added by this sponsor">
      {formatTotalInvestmentUsd(n ?? 0)}
    </span>
  )
}

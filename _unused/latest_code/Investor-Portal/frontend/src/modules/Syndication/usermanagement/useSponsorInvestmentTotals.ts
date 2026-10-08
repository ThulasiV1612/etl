import { useCallback, useEffect, useState } from "react"
import {
  buildTotalsMapByUserId,
  fetchSponsorTotalInvestments,
  type SponsorTotalInvestmentRow,
} from "./sponsorTotalsApi"

export interface UseSponsorInvestmentTotalsResult {
  loading: boolean
  error: string
  rows: SponsorTotalInvestmentRow[]
  totalsByUserId: Map<string, number>
  refresh: () => Promise<void>
}

/**
 * Loads sponsor totals for the current admin context.
 * Pass `organizationId` when platform admin is drilling into a company (same as GET /users?organizationId=).
 */
export function useSponsorInvestmentTotals(
  organizationId?: string | null,
  enabled = true,
): UseSponsorInvestmentTotalsResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [rows, setRows] = useState<SponsorTotalInvestmentRow[]>([])
  const [totalsByUserId, setTotalsByUserId] = useState<Map<string, number>>(
    () => new Map(),
  )

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    const res = await fetchSponsorTotalInvestments(organizationId ?? undefined)
    if (!res.ok) {
      setError(res.message)
      setRows([])
      setTotalsByUserId(new Map())
      setLoading(false)
      return
    }
    const map = buildTotalsMapByUserId(res.users)
    setRows(res.users)
    setTotalsByUserId(map)
    console.log("[SponsorTotalInvestment] useSponsorInvestmentTotals loaded", {
      organizationId: organizationId ?? null,
      totalsByUserId: Object.fromEntries(map),
    })
    setLoading(false)
  }, [enabled, organizationId])

  useEffect(() => {
    void load()
  }, [load])

  return {
    loading,
    error,
    rows,
    totalsByUserId,
    refresh: load,
  }
}

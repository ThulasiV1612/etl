import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { setAppDocumentTitle } from "@/common/utils/appDocumentTitle"
import {
  fetchMyDistributions,
  type MyDistributionPaymentRow,
} from "@/modules/Syndication/Deals/distribution-setup/api/myDistributionsApi"
import { MyDistributionsTable } from "./investments/components/MyDistributionsTable"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "./investments/investment-detail.css"

/**
 * Investor-scoped cashflows: distribution payments across accessible deals.
 */
export default function InvestorCashflowsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<MyDistributionPaymentRow[]>([])
  const [totalPayment, setTotalPayment] = useState("0")

  useEffect(() => {
    setAppDocumentTitle("Cashflows")
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchMyDistributions()
      .then((pack) => {
        if (cancelled) return
        setRows(pack.distributions)
        setTotalPayment(pack.totalPayment)
      })
      .catch((err) => {
        if (cancelled) return
        setRows([])
        setTotalPayment("0")
        setError(
          err instanceof Error ? err.message : "Could not load cashflows.",
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="um_page deals_list_page deals_detail_page investment_detail_page">
      <Link to="/investing/investments" className="investment_detail_back">
        <ArrowLeft size={18} strokeWidth={2} aria-hidden />
        Back to investments
      </Link>
      <h1 className="investment_detail_title">Cashflows</h1>
      <p className="investment_detail_lead">
        Your distribution payments across deals you can access.
      </p>

      <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel deal_dist_panel">
        <MyDistributionsTable
          rows={rows}
          loading={loading}
          showDeal
          totalPayment={totalPayment}
          emptyLabel={
            error ??
            "No distribution payments yet. Completed deal distributions will appear here."
          }
        />
      </div>
    </div>
  )
}

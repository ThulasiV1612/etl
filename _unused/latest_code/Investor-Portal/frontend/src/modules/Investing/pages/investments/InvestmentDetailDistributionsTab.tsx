import { useEffect, useState } from "react"
import {
  fetchMyDealDistributions,
  type MyDistributionPaymentRow,
} from "@/modules/Syndication/Deals/distribution-setup/api/myDistributionsApi"
import { MyDistributionsTable } from "./components/MyDistributionsTable"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "./investment-detail.css"

type InvestmentDetailDistributionsTabProps = {
  dealId: string
  /** List / route investment id (may be runtime-…); used for detail links. */
  investmentId?: string
}

/**
 * Deal-scoped distributions for the signed-in investor on this investment.
 */
export function InvestmentDetailDistributionsTab({
  dealId,
  investmentId,
}: InvestmentDetailDistributionsTabProps) {
  const id = dealId.trim()
  const linkInvestmentId = (investmentId?.trim() || id).trim()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<MyDistributionPaymentRow[]>([])
  const [totalPayment, setTotalPayment] = useState("0")
  const [dealName, setDealName] = useState("")

  useEffect(() => {
    if (!id) {
      setRows([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchMyDealDistributions(id)
      .then((pack) => {
        if (cancelled) return
        setRows(pack.distributions)
        setTotalPayment(pack.totalPayment)
        setDealName(pack.dealName)
      })
      .catch((err) => {
        if (cancelled) return
        setRows([])
        setTotalPayment("0")
        setError(
          err instanceof Error ? err.message : "Could not load distributions.",
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div
      id="inv-detail-panel-distributions"
      role="tabpanel"
      aria-labelledby="inv-detail-tab-distributions"
      className="investment_detail_tab_panel"
    >
      <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel deal_dist_panel">
        <div
          className="um_toolbar um_toolbar_export_then_search deal_dist_toolbar"
          role="toolbar"
          aria-label="Your distributions"
        >
          <div className="deal_dist_toolbar_copy">
            <h2 className="deal_dist_heading">Your distributions</h2>
            <p className="deal_dist_lead">
              {dealName
                ? `Payments credited to you on ${dealName}.`
                : "Payments credited to you on this deal."}
            </p>
          </div>
        </div>
        <MyDistributionsTable
          rows={rows}
          loading={loading}
          totalPayment={totalPayment}
          investmentId={linkInvestmentId}
          emptyLabel={
            error ??
            "No distributions have been completed for your investment yet."
          }
        />
      </div>
    </div>
  )
}

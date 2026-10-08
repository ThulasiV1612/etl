import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import {
  DataTable,
  type DataTableColumn,
} from "@/common/components/data-table/DataTable"
import { TableCompactAmountCell } from "@/common/components/card-compact-amount/CardCompactAmount"
import { setAppDocumentTitle } from "@/common/utils/appDocumentTitle"
import { formatDateDdMmmYyyy } from "@/common/utils/formatDateDisplay"
import {
  fetchMyDealDistributionDetail,
  type MyDistributionDetail,
} from "@/modules/Syndication/Deals/distribution-setup/api/myDistributionsApi"
import { resolveInvestmentDealId } from "./utils/resolveInvestmentDealId"
import { loadInvestmentDetailFromDeal } from "./investmentsListFromDeals"
import { getInvestmentDetail } from "./investmentsRuntimeData"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "@/modules/Syndication/Deals/tabs/distributions/distributions-tab.css"
import "./investment-detail.css"

function formatDistributionDate(iso: string): string {
  return formatDateDdMmmYyyy(iso)
}

function sourceLabel(source: string | undefined): string {
  const s = (source ?? "").trim().toLowerCase()
  if (s === "capital" || s === "capital_event") return "Capital event"
  if (s === "operating") return "Operating"
  return "—"
}

type PaymentRow = MyDistributionDetail["payments"][number]

/**
 * Investor-facing distribution details (their payment lines only).
 * Route: /investing/investments/:investmentId/distributions/:distributionId
 */
export default function InvestorDistributionDetailsPage() {
  const { investmentId = "", distributionId = "" } = useParams<{
    investmentId: string
    distributionId: string
  }>()
  const navigate = useNavigate()
  const decodedInvestmentId = decodeURIComponent(investmentId.trim())
  const decodedDistId = decodeURIComponent(distributionId.trim())

  const [dealId, setDealId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<MyDistributionDetail | null>(null)

  const backHref = `/investing/investments/${encodeURIComponent(decodedInvestmentId)}?tab=distributions`

  useEffect(() => {
    setAppDocumentTitle("Distribution details")
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!decodedInvestmentId || !decodedDistId) {
        setDealId("")
        return
      }
      const local = getInvestmentDetail(decodedInvestmentId)
      if (local) {
        const id = resolveInvestmentDealId(local)
        if (id && !cancelled) setDealId(id)
        return
      }
      try {
        const fromApi = await loadInvestmentDetailFromDeal(decodedInvestmentId)
        if (cancelled) return
        if (fromApi) {
          setDealId(resolveInvestmentDealId(fromApi) || decodedInvestmentId)
        } else {
          setDealId(decodedInvestmentId)
        }
      } catch {
        if (!cancelled) setDealId(decodedInvestmentId)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [decodedInvestmentId])

  useEffect(() => {
    if (!dealId || !decodedDistId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchMyDealDistributionDetail(dealId, decodedDistId)
      .then((pack) => {
        if (cancelled) return
        setDetail(pack)
        setAppDocumentTitle(
          pack.distribution.name?.trim() ||
            `Distribution · ${formatDistributionDate(pack.distribution.date)}`,
        )
      })
      .catch((err) => {
        if (cancelled) return
        setDetail(null)
        setError(
          err instanceof Error
            ? err.message
            : "Could not load distribution details.",
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dealId, decodedDistId])

  const columns: DataTableColumn<PaymentRow>[] = useMemo(
    () => [
      {
        id: "class",
        header: "Class",
        colWidth: "10rem",
        sortValue: (row) => row.className,
        cell: (row) => row.className || "—",
      },
      {
        id: "capital",
        header: "Your capital",
        align: "right",
        colWidth: "9.5rem",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        cell: (row) => <TableCompactAmountCell amount={row.capital} />,
      },
      {
        id: "pct",
        header: "% of class",
        align: "right",
        colWidth: "7rem",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        cell: (row) => {
          const n = Number(row.percentOfClass)
          if (!Number.isFinite(n)) return "—"
          return `${(Math.round(n * 10) / 10).toLocaleString("en-US", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}%`
        },
      },
      {
        id: "payment",
        header: "Your payment",
        align: "right",
        colWidth: "9.5rem",
        thClassName: "deals_th_align_right deal_dist_th_amount",
        tdClassName: "um_td_numeric deals_td_align_right deal_dist_td_amount",
        cell: (row) => <TableCompactAmountCell amount={row.payment} />,
      },
    ],
    [],
  )

  if (!decodedInvestmentId || !decodedDistId) {
    return (
      <div className="um_page deals_list_page deals_detail_page investment_detail_page">
        <p className="deals_list_not_found">Missing distribution.</p>
      </div>
    )
  }

  return (
    <div className="um_page deals_list_page deals_detail_page investment_detail_page">
      <Link to={backHref} className="investment_detail_back">
        <ArrowLeft size={18} strokeWidth={2} aria-hidden />
        Back to distributions
      </Link>

      {loading ? (
        <p className="deals_list_not_found" role="status">
          Loading distribution…
        </p>
      ) : error || !detail ? (
        <p className="deals_list_not_found">{error ?? "Distribution not found."}</p>
      ) : (
        <>
          <h1 className="investment_detail_title">
            {detail.distribution.name?.trim() ||
              formatDistributionDate(detail.distribution.date)}
          </h1>
          <p className="investment_detail_lead">
            {detail.dealName ? `${detail.dealName} · ` : ""}
            Your payment on this distribution
          </p>

          <div className="um_panel um_members_tab_panel deals_list_card_surface deal_dist_panel">
            <div className="deal_dist_summary" aria-live="polite">
              <div className="deal_dist_summary_item">
                <span className="deal_dist_summary_label">Date</span>
                <span className="deal_dist_summary_value">
                  {formatDistributionDate(detail.distribution.date)}
                </span>
              </div>
              <div className="deal_dist_summary_item">
                <span className="deal_dist_summary_label">Waterfall</span>
                <span className="deal_dist_summary_value">
                  <span className="deal_dist_wf_badge">
                    {sourceLabel(detail.distribution.source)}
                  </span>
                </span>
              </div>
              <div className="deal_dist_summary_item">
                <span className="deal_dist_summary_label">Your total</span>
                <span className="deal_dist_summary_value deal_dist_summary_value_money">
                  <TableCompactAmountCell amount={detail.totalPayment} />
                </span>
              </div>
            </div>

            <DataTable
              visualVariant="members"
              membersTableClassName="um_table_members deal_inv_table deal_dist_table"
              columns={columns}
              rows={detail.payments}
              getRowKey={(row, i) => `${row.classId}:${row.payment}:${i}`}
              emptyLabel="No payment lines for your investment on this distribution."
            />

            <div className="um_toolbar deal_dist_toolbar">
              <button
                type="button"
                className="um_toolbar_export_btn"
                onClick={() => navigate(backHref)}
              >
                Back to list
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

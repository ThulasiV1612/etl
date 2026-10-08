import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  DataTable,
  type DataTableColumn,
} from "../../../../../common/components/data-table/DataTable"
import { TableCompactAmountCell } from "../../../../../common/components/card-compact-amount/CardCompactAmount"
import { setAppDocumentTitle } from "../../../../../common/utils/appDocumentTitle"
import { formatDateDdMmmYyyy } from "../../../../../common/utils/formatDateDisplay"
import {
  fetchDistributionPayouts,
  type DistributionPayout,
} from "@/modules/Investing/api/stripeInvestorPaymentsApi"
import { fetchDealInvestors } from "../../api/dealsApi"
import { fetchDistributionSetup } from "../../distribution-setup/api/distributionSetupApi"
import type { PriorDistributionRecord } from "../../distribution-setup/types/distribution-setup.types"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import {
  displayInvestorCommittedAmount,
  parseMoneyDigits,
} from "../../utils/offeringMoneyFormat"
import { buildDealDetailReturnSearch } from "../../utils/offeringDetailsSectionNav"
import { parseStoredClassPercent } from "../distributions/utils/investorDistributionAllocation"
import {
  distributionDisplayName,
  formatPaymentDateLabel,
  resolvePeriodWindow,
  sourceDisplayLabel,
  typeDisplayLabel,
} from "../distributions/utils/distributionListDisplay"
import {
  buildInvestorPaymentMatchKeys,
  investorMatchesPayment,
} from "./investorDistributionHistory"
import "../../../../../common/components/work_in_progress_page.css"
import "../../../usermanagement/user_management.css"
import "../../deals-list.css"
import "../../deal-investors-tab.css"
import "../../distribution-setup/distribution-setup.css"
import "../distributions/distributions-tab.css"
import "../distributions/distribution-details.css"
import "./deal-investor-distributions-page.css"

export interface InvestorDistributionHistoryRow {
  key: string
  distributionId: string
  memo: string
  distributionLabel: string
  className: string
  type: string
  method: string
  payee: string
  status: string
  paymentDate: string
  paymentSent: string
  paymentReceiveDate: string
  payment: number
  dateSort: string
}

function formatLongPeriodRange(startIso: string, endIso: string): string {
  return `${formatDateDdMmmYyyy(startIso)} - ${formatDateDdMmmYyyy(endIso)}`
}

function memoLabel(row: PriorDistributionRecord): string {
  const named = String(row.name ?? "").trim()
  if (named) return named
  const window = resolvePeriodWindow(row)
  const period = row.period ?? "quarterly"
  if (period === "quarterly") {
    const m = /^(\d{4})-(\d{2})/.exec(window.start)
    if (m) {
      const q = Math.floor((Number(m[2]) - 1) / 3) + 1
      return `Q${q} - ${m[1]}`
    }
  }
  return distributionDisplayName(row)
}

function distributionDescription(row: PriorDistributionRecord): string {
  const window = resolvePeriodWindow(row)
  const source = sourceDisplayLabel(row.source)
  const range = formatLongPeriodRange(window.start, window.end)
  if (source === "—") return range
  return `${source} (${range})`
}

function formatIsoDateDisplay(iso: string | null | undefined): string {
  return formatDateDdMmmYyyy(iso)
}

function statusLabel(raw: string): string {
  const s = raw.trim().toLowerCase()
  if (!s || s === "not sent" || s === "not_sent") return "Not sent"
  if (s === "paid" || s === "completed" || s === "succeeded") return "Completed"
  if (s === "pending" || s === "processing") return "Processing"
  if (s === "failed" || s === "canceled" || s === "reversed")
    return s.charAt(0).toUpperCase() + s.slice(1)
  return raw.trim() || "—"
}

function statusTone(raw: string): "neutral" | "info" | "success" | "danger" {
  const s = raw.trim().toLowerCase()
  if (s === "paid" || s === "completed" || s === "succeeded") return "success"
  if (s === "pending" || s === "processing") return "info"
  if (s === "failed" || s === "canceled" || s === "reversed") return "danger"
  return "neutral"
}


function ownershipPercentLabel(row: DealInvestorRow | null): string {
  if (!row) return "—"
  const n =
    parseStoredClassPercent(row.percentOfClassDistributions) ??
    parseStoredClassPercent(row.percentOfClassOwnership)
  if (n == null) return "—"
  return `${(Math.round(n * 100) / 100).toFixed(2)}%`
}

/**
 * Sponsor view: one investor’s full distribution history on a deal.
 * Route: /deals/:dealId/investors/:investorId/distributions
 */
export function DealInvestorDistributionsPage() {
  const { dealId: dealIdParam, investorId: investorIdParam } = useParams()
  const navigate = useNavigate()
  const dealId = (dealIdParam ?? "").trim()
  const investorId = (investorIdParam ?? "").trim()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dealName, setDealName] = useState("")
  const [investor, setInvestor] = useState<DealInvestorRow | null>(null)
  const [rows, setRows] = useState<InvestorDistributionHistoryRow[]>([])

  const investorsHref = `/deals/${encodeURIComponent(dealId)}${buildDealDetailReturnSearch(
    { tab: "investors" },
  )}`
  const dealsHref = "/deals"

  const load = useCallback(async () => {
    if (!dealId || !investorId) {
      setError("Missing deal or investor.")
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [bundle, invPack] = await Promise.all([
        fetchDistributionSetup(dealId),
        fetchDealInvestors(dealId),
      ])
      setDealName(String(bundle.dealName ?? "").trim())
      const investors = invPack.investors ?? []
      const inv =
        investors.find((r) => r.id === investorId) ??
        investors.find(
          (r) =>
            String(r.id ?? "")
              .trim()
              .toLowerCase() === investorId.toLowerCase(),
        ) ??
        null
      if (!inv) {
        setInvestor(null)
        setRows([])
        setError("Investor not found on this deal.")
        return
      }
      setInvestor(inv)

      const matchKeys = buildInvestorPaymentMatchKeys({
        investor: inv,
        dealInvestors: investors,
      })
      const priors = bundle.priorDistributions ?? []
      const matched: Array<{
        prior: PriorDistributionRecord
        payment: NonNullable<PriorDistributionRecord["investorPayments"]>[number]
      }> = []
      for (const prior of priors) {
        for (const payment of prior.investorPayments ?? []) {
          if (investorMatchesPayment(matchKeys, payment))
            matched.push({ prior, payment })
        }
      }

      const payoutByDist = new Map<string, DistributionPayout | null>()
      await Promise.all(
        matched.map(async ({ prior }) => {
          const distId = String(prior.id ?? "").trim()
          if (!distId || payoutByDist.has(distId)) return
          try {
            const list = await fetchDistributionPayouts(dealId, distId)
            const hit =
              list.find(
                (p) =>
                  String(p.investmentId ?? "")
                    .trim()
                    .toLowerCase() ===
                  String(inv.id ?? "")
                    .trim()
                    .toLowerCase(),
              ) ?? null
            payoutByDist.set(distId, hit)
          } catch {
            payoutByDist.set(distId, null)
          }
        }),
      )

      const nextRows: InvestorDistributionHistoryRow[] = matched.map(
        ({ prior, payment }, index) => {
          const distId = String(prior.id ?? "").trim()
          const payout = payoutByDist.get(distId) ?? null
          const payAmt = parseMoneyDigits(payment.payment) || 0
          const window = resolvePeriodWindow(prior)
          return {
            key: `${distId}:${payment.classId}:${index}`,
            distributionId: distId,
            memo: memoLabel(prior),
            distributionLabel: distributionDescription(prior),
            className: String(payment.className ?? "").trim() || "—",
            type: typeDisplayLabel(prior),
            method: payout ? "ACH" : "—",
            payee: "—",
            status: statusLabel(payout?.status ?? "not sent"),
            paymentDate: formatPaymentDateLabel(
              prior.paymentDate || prior.date || window.end,
            ),
            paymentSent: formatIsoDateDisplay(payout?.initiatedAt),
            paymentReceiveDate: formatIsoDateDisplay(payout?.paidAt),
            payment: payAmt,
            dateSort: String(prior.paymentDate || prior.date || "").slice(0, 10),
          }
        },
      )
      nextRows.sort((a, b) => b.dateSort.localeCompare(a.dateSort))
      setRows(nextRows)
    } catch (err) {
      setInvestor(null)
      setRows([])
      setError(
        err instanceof Error
          ? err.message
          : "Could not load investor distributions.",
      )
    } finally {
      setLoading(false)
    }
  }, [dealId, investorId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const name = investor?.displayName?.trim()
    setAppDocumentTitle(
      name ? `${name} · Distributions` : "Investor distributions",
    )
  }, [investor])

  const totalDistributed = useMemo(
    () => rows.reduce((sum, r) => sum + (Number.isFinite(r.payment) ? r.payment : 0), 0),
    [rows],
  )

  const investedAmount = investor
    ? displayInvestorCommittedAmount(investor)
    : "—"

  const columns: DataTableColumn<InvestorDistributionHistoryRow>[] = useMemo(
    () => [
      {
        id: "memo",
        header: (
          <span className="deal_inv_dist_th_stack">
            <span>Memo</span>
          </span>
        ),
        colWidth: "8.5rem",
        thClassName: "deal_inv_dist_th_memo",
        tdClassName: "deal_inv_dist_td_memo",
        sortValue: (row) => row.dateSort,
        cell: (row) => (
          <Link
            to={`/deals/${encodeURIComponent(dealId)}/distributions/${encodeURIComponent(row.distributionId)}`}
            className="deals_table_name_link deal_dist_row_link"
            onClick={(e) => e.stopPropagation()}
          >
            {row.memo}
          </Link>
        ),
      },
      {
        id: "distribution",
        header: (
          <span className="deal_inv_dist_th_stack">
            <span>Distribution</span>
          </span>
        ),
        colWidth: "16rem",
        thClassName: "deal_inv_dist_th_distribution",
        tdClassName: "deal_inv_dist_td_distribution",
        sortValue: (row) => row.distributionLabel.toLowerCase(),
        cell: (row) => (
          <span className="deal_inv_dist_distribution_text" title={row.distributionLabel}>
            {row.distributionLabel}
          </span>
        ),
      },
      {
        id: "class",
        header: "Class",
        colWidth: "9rem",
        sortValue: (row) => row.className.toLowerCase(),
        cell: (row) => row.className,
      },
      {
        id: "type",
        header: "Type",
        colWidth: "9rem",
        sortValue: (row) => row.type.toLowerCase(),
        cell: (row) => row.type,
      },
      {
        id: "method",
        header: "Method",
        align: "center",
        colWidth: "6.5rem",
        thClassName: "deals_th_align_center deal_inv_dist_th_center",
        tdClassName: "deal_inv_dist_td_center",
        sortValue: (row) => row.method.toLowerCase(),
        cell: (row) => row.method,
      },
      {
        id: "payee",
        header: (
          <span className="deal_inv_dist_th_stack">
            <span>Payee account</span>
            <span>/ address</span>
          </span>
        ),
        colWidth: "12rem",
        sortValue: (row) => row.payee.toLowerCase(),
        cell: (row) => row.payee,
      },
      {
        id: "status",
        header: "Status",
        align: "center",
        colWidth: "8rem",
        thClassName: "deals_th_align_center deal_inv_dist_th_center",
        tdClassName: "deal_inv_dist_td_center",
        sortValue: (row) => row.status.toLowerCase(),
        cell: (row) => (
          <span
            className={`deal_dist_ach_badge deal_dist_ach_badge--${statusTone(row.status)}`}
          >
            {row.status}
          </span>
        ),
      },
      {
        id: "paymentDate",
        header: (
          <span className="deal_inv_dist_th_stack">
            <span>Payment</span>
            <span>date</span>
          </span>
        ),
        colWidth: "7.5rem",
        sortValue: (row) => row.dateSort,
        cell: (row) => row.paymentDate,
      },
      {
        id: "paymentSent",
        header: (
          <span className="deal_inv_dist_th_stack">
            <span>Payment</span>
            <span>sent</span>
          </span>
        ),
        colWidth: "7.5rem",
        sortValue: (row) => row.paymentSent,
        cell: (row) => row.paymentSent,
      },
      {
        id: "paymentReceive",
        header: (
          <span className="deal_inv_dist_th_stack">
            <span>Payment</span>
            <span>receive date</span>
          </span>
        ),
        colWidth: "8.5rem",
        sortValue: (row) => row.paymentReceiveDate,
        cell: (row) => row.paymentReceiveDate,
      },
      {
        id: "payment",
        header: "Payment",
        align: "right",
        colWidth: "8.5rem",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        sortValue: (row) => row.payment,
        cell: (row) => <TableCompactAmountCell amount={row.payment} />,
      },
    ],
    [dealId],
  )

  if (!dealId || !investorId) {
    return (
      <div className="um_page deals_list_page deals_detail_page deal_inv_dist_page">
        <p className="deals_list_not_found">Missing deal or investor.</p>
      </div>
    )
  }

  const investorName = investor?.displayName?.trim() || "Investor"

  return (
    <div className="um_page deals_list_page deals_detail_page deal_inv_dist_page">
      <nav className="wip_breadcrumb deal_inv_dist_breadcrumb" aria-label="Breadcrumb">
        <Link to={dealsHref}>Deals</Link>
        <span className="wip_breadcrumb_sep" aria-hidden>
          /
        </span>
        <Link to={investorsHref}>
          {dealName.trim() || "Deal"}
        </Link>
        <span className="wip_breadcrumb_sep" aria-hidden>
          /
        </span>
        <Link to={investorsHref}>Investors</Link>
        <span className="wip_breadcrumb_sep" aria-hidden>
          /
        </span>
        <span aria-current="page">{investorName}</span>
      </nav>

      <header className="deal_inv_dist_header">
        <h1 className="deal_inv_dist_title">{investorName}</h1>
        <p className="deal_inv_dist_lead">
          Distributions for this investor on{" "}
          {dealName.trim() || "this deal"}
        </p>
      </header>

      {loading ? (
        <div className="deal_inv_dist_loading" role="status" aria-live="polite">
          <div className="data_table_loader_spinner" aria-hidden />
          <span>Loading distributions…</span>
        </div>
      ) : error ? (
        <p className="deals_list_not_found">{error}</p>
      ) : (
        <div className="um_panel um_members_tab_panel deals_list_card_surface deal_dist_panel deal_inv_dist_panel">
          <div className="deal_dist_summary deal_inv_dist_summary" aria-live="polite">
            <div className="deal_dist_summary_item">
              <span className="deal_dist_summary_label">Ownership %</span>
              <span className="deal_dist_summary_value">
                {ownershipPercentLabel(investor)}
              </span>
            </div>
            <div className="deal_dist_summary_item">
              <span className="deal_dist_summary_label">Invested amount</span>
              <span className="deal_dist_summary_value deal_dist_summary_value_money">
                <TableCompactAmountCell amount={investedAmount} />
              </span>
            </div>
            <div className="deal_dist_summary_item">
              <span className="deal_dist_summary_label">
                Total distributed amount
              </span>
              <span className="deal_dist_summary_value deal_dist_summary_value_money">
                <TableCompactAmountCell amount={totalDistributed} />
              </span>
            </div>
          </div>

          <div className="deal_inv_dist_table_scroll">
            <DataTable
              visualVariant="members"
              membersTableClassName="um_table_members deal_inv_table deal_dist_table deal_inv_dist_history_table"
              forceHorizontalScroll
              columns={columns}
              rows={rows}
              getRowKey={(row) => row.key}
              emptyLabel="This investor is not included in any completed distributions yet."
              initialSort={{ columnId: "memo", direction: "desc" }}
              onBodyRowClick={(row) =>
                navigate(
                  `/deals/${encodeURIComponent(dealId)}/distributions/${encodeURIComponent(row.distributionId)}`,
                )
              }
              getRowClassName={() => "deal_dist_table_row"}
            />
          </div>
        </div>
      )}
    </div>
  )
}

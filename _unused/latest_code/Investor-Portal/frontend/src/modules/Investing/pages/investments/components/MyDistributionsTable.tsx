import { useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  DataTable,
  type DataTableColumn,
} from "@/common/components/data-table/DataTable"
import { TableCompactAmountCell } from "@/common/components/card-compact-amount/CardCompactAmount"
import { formatDateDdMmmYyyy } from "@/common/utils/formatDateDisplay"
import type { MyDistributionPaymentRow } from "@/modules/Syndication/Deals/distribution-setup/api/myDistributionsApi"
import { parseMoneyDigits } from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"
import "@/modules/Syndication/Deals/tabs/distributions/distributions-tab.css"

function formatDistributionDate(iso: string): string {
  return formatDateDdMmmYyyy(iso)
}

function sourceLabel(source: string | undefined): string {
  const s = (source ?? "").trim().toLowerCase()
  if (s === "capital" || s === "capital_event") return "Capital event"
  if (s === "operating") return "Operating"
  return "—"
}

function detailPath(row: MyDistributionPaymentRow, investmentId?: string): string {
  const inv = (investmentId?.trim() || row.dealId).trim()
  return `/investing/investments/${encodeURIComponent(inv)}/distributions/${encodeURIComponent(row.distributionId)}`
}

export type MyDistributionsTableProps = {
  rows: MyDistributionPaymentRow[]
  loading?: boolean
  emptyLabel?: string
  /** When true, show Deal column and link to investment/deal. */
  showDeal?: boolean
  totalPayment?: string
  /**
   * Investment list id for detail links (runtime-… or deal id).
   * Defaults to each row's dealId.
   */
  investmentId?: string
}

/**
 * Investor-scoped distribution payment lines (deal or cross-deal).
 */
export function MyDistributionsTable({
  rows,
  loading = false,
  emptyLabel = "No distributions yet.",
  showDeal = false,
  totalPayment,
  investmentId,
}: MyDistributionsTableProps) {
  const navigate = useNavigate()
  const total = useMemo(() => {
    if (totalPayment != null && totalPayment !== "") {
      const n = parseMoneyDigits(totalPayment)
      if (Number.isFinite(n)) return n
    }
    return rows.reduce((sum, r) => {
      const n = parseMoneyDigits(r.payment)
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)
  }, [rows, totalPayment])

  const columns: DataTableColumn<MyDistributionPaymentRow>[] = useMemo(() => {
    const cols: DataTableColumn<MyDistributionPaymentRow>[] = [
      {
        id: "date",
        header: "Date",
        colWidth: "9.5rem",
        thClassName: "deal_dist_th_date",
        tdClassName: "deal_dist_td_date",
        sortValue: (row) => row.date,
        cell: (row) => (
          <Link
            to={detailPath(row, investmentId)}
            className="deals_table_name_link deal_dist_row_link"
            onClick={(e) => e.stopPropagation()}
          >
            {formatDistributionDate(row.date)}
          </Link>
        ),
      },
    ]
    if (showDeal) {
      cols.push({
        id: "deal",
        header: "Deal",
        colWidth: "14rem",
        sortValue: (row) => row.dealName || row.dealId,
        cell: (row) => {
          const label = row.dealName.trim() || "Deal"
          return (
            <Link
              to={`/investing/investments/${encodeURIComponent(row.dealId)}?tab=distributions`}
              className="deals_table_name_link"
              onClick={(e) => e.stopPropagation()}
            >
              {label}
            </Link>
          )
        },
      })
    }
    cols.push(
      {
        id: "class",
        header: "Class",
        colWidth: "9rem",
        sortValue: (row) => row.className,
        cell: (row) => row.className || "—",
      },
      {
        id: "source",
        header: "Waterfall",
        colWidth: "9rem",
        thClassName: "deal_dist_th_source",
        tdClassName: "deal_dist_td_source",
        sortValue: (row) => sourceLabel(row.source),
        cell: (row) => (
          <span className="deal_dist_wf_badge">{sourceLabel(row.source)}</span>
        ),
      },
      {
        id: "payment",
        header: "Your payment",
        align: "right",
        colWidth: "9.5rem",
        thClassName: "deals_th_align_right deal_dist_th_amount",
        tdClassName: "um_td_numeric deals_td_align_right deal_dist_td_amount",
        sortValue: (row) => {
          const n = parseMoneyDigits(row.payment)
          return Number.isFinite(n) ? n : 0
        },
        cell: (row) => <TableCompactAmountCell amount={row.payment} />,
      },
    )
    return cols
  }, [showDeal, investmentId])

  return (
    <div className="deal_dist_tab" role="region" aria-label="Your distributions">
      <div className="deal_dist_summary" aria-live="polite">
        <div className="deal_dist_summary_item">
          <span className="deal_dist_summary_label">Payments</span>
          <span className="deal_dist_summary_value">
            {loading ? "—" : rows.length}
          </span>
        </div>
        <div className="deal_dist_summary_item">
          <span className="deal_dist_summary_label">Total received</span>
          <span className="deal_dist_summary_value deal_dist_summary_value_money">
            {loading ? (
              "—"
            ) : (
              <TableCompactAmountCell amount={String(total)} />
            )}
          </span>
        </div>
      </div>

      <DataTable
        visualVariant="members"
        membersTableClassName="um_table_members deal_inv_table deal_dist_table"
        columns={columns}
        rows={loading ? [] : rows}
        getRowKey={(row) =>
          `${row.distributionId}:${row.classId}:${row.payment}:${row.date}`
        }
        emptyLabel={loading ? "Loading distributions…" : emptyLabel}
        initialSort={{ columnId: "date", direction: "desc" }}
        onBodyRowClick={(row) => navigate(detailPath(row, investmentId))}
        getRowClassName={() => "deal_dist_table_row"}
      />
    </div>
  )
}

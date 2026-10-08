import { Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DataTable,
  type DataTableColumn,
} from "../../../../../common/components/data-table/DataTable"
import { TableCompactAmountCell } from "../../../../../common/components/card-compact-amount/CardCompactAmount"
import { FormTooltip } from "../../../../../common/components/form-tooltip/FormTooltip"
import {
  fetchDistributionPayouts,
  type DistributionPayout,
} from "@/modules/Investing/api/stripeInvestorPaymentsApi"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import type {
  DistributionSetupBundle,
  DistributionSetupClass,
  PriorDistributionRecord,
} from "../../distribution-setup/types/distribution-setup.types"
import { DistributionNameClassMenu } from "./DistributionNameClassMenu"
import { DistributionClassInvestorsPanel } from "./DistributionClassInvestorsPanel"
import { CLASS_TYPE_TONE } from "../../distribution-setup/types/distribution-setup.types"
import {
  investorRowsForDistributionClass,
  type DistributionClassTableRow,
} from "./utils/distributionListDisplay"

function classTypeTone(classType: string | undefined): string {
  const t = String(classType ?? "").trim().toLowerCase()
  return CLASS_TYPE_TONE[t] || "lp"
}

type DistributionClassesPanelProps = {
  dealId: string
  distributionName: string
  distribution: PriorDistributionRecord
  setupClasses: DistributionSetupClass[]
  investors: DealInvestorRow[]
  rows: DistributionClassTableRow[]
  fundingReady: boolean
  onSaved: (
    saved: DistributionSetupBundle,
    investorId: string,
    nextPct?: number,
    nextDealPct?: number,
  ) => void
  onReload: () => void
}

function ColumnHeader({
  label,
  hint,
}: {
  label: string
  hint: string
}) {
  return (
    <span className="deals_table_col_header">
      <span>{label}</span>
      <span
        className="deals_table_header_tooltip_anchor"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <FormTooltip
          label={`More information: ${label}`}
          content={<p className="deals_table_header_tooltip_p">{hint}</p>}
          placement="bottom"
          panelAlign="start"
          nativeButtonTrigger={false}
        />
      </span>
    </span>
  )
}

function formatSharePct(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return `${(Math.round(n * 100) / 100).toFixed(2)}%`
}

/**
 * Per-class totals for one completed distribution run.
 */
export function DistributionClassesPanel({
  dealId,
  distributionName,
  distribution,
  setupClasses,
  investors,
  rows,
  fundingReady,
  onSaved,
  onReload,
}: DistributionClassesPanelProps) {
  const [query, setQuery] = useState("")
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null)
  const [payouts, setPayouts] = useState<DistributionPayout[]>([])

  const loadPayouts = useCallback(async () => {
    if (!dealId || !distribution.id) {
      setPayouts([])
      return
    }
    try {
      const list = await fetchDistributionPayouts(dealId, distribution.id)
      setPayouts(list)
    } catch {
      setPayouts([])
    }
  }, [dealId, distribution.id])

  useEffect(() => {
    void loadPayouts()
  }, [loadPayouts])

  const handleReload = useCallback(() => {
    onReload()
    void loadPayouts()
  }, [onReload, loadPayouts])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      [
        row.name,
        row.typeLabel,
        String(row.investorCount),
        String(row.capital),
        String(row.payment),
        String(row.required),
        String(row.unpaid),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
  }, [rows, query])

  useEffect(() => {
    if (
      expandedClassId &&
      !filtered.some((row) => row.id === expandedClassId)
    ) {
      setExpandedClassId(null)
    }
  }, [filtered, expandedClassId])

  const columns: DataTableColumn<DistributionClassTableRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: (
          <ColumnHeader
            label="Class"
            hint="Investor class that received this distribution."
          />
        ),
        colWidth: "14rem",
        thClassName: "deal_classes_col_name",
        tdClassName: "um_td_user deal_classes_col_name",
        sortValue: (row) => row.name.toLowerCase(),
        cell: (row) => (
          <DistributionNameClassMenu
            name={row.name || "—"}
            expanded={expandedClassId === row.id}
            revealLabel="investors"
            onToggle={() =>
              setExpandedClassId((prev) => (prev === row.id ? null : row.id))
            }
          />
        ),
      },
      {
        id: "type",
        header: (
          <ColumnHeader
            label="Type"
            hint="LP, GP, preferred equity, or mezzanine."
          />
        ),
        colWidth: "5rem",
        align: "center",
        thClassName: "deal_dist_th_type deal_dist_th_class_type",
        tdClassName: "deal_dist_td_type deal_dist_td_class_type",
        sortValue: (row) => row.typeLabel.toLowerCase(),
        cell: (row) => {
          const label = row.typeLabel.trim()
          if (!label || label === "—") return "—"
          const tone = classTypeTone(row.classType)
          return (
            <span
              className={`deal_dist_class_type_chip deal_dist_class_type_chip--${tone}`}
            >
              {label}
            </span>
          )
        },
      },
      {
        id: "investors",
        header: (
          <ColumnHeader
            label="Investors"
            hint="Investors in this class on this distribution."
          />
        ),
        colWidth: "5.75rem",
        align: "center",
        thClassName: "deal_dist_th_investors",
        tdClassName: "deal_dist_td_investors",
        sortValue: (row) => row.investorCount,
        cell: (row) => {
          const tone = classTypeTone(row.classType)
          return (
            <span
              className={`deal_dist_investor_count deal_dist_investor_count--${tone}`}
            >
              {row.investorCount}
            </span>
          )
        },
      },
      {
        id: "capital",
        header: (
          <ColumnHeader
            label="Capital"
            hint="Invested capital used to allocate this class’s share."
          />
        ),
        align: "right",
        thClassName: "deals_th_align_right",
        sortValue: (row) => row.capital,
        cell: (row) => <TableCompactAmountCell amount={row.capital} />,
      },
      {
        id: "required",
        header: (
          <ColumnHeader
            label="Accumulated Pref"
            hint="Preferred due for this class in the distribution period (actual/365)."
          />
        ),
        align: "right",
        thClassName: "deals_th_align_right",
        sortValue: (row) => row.required,
        cell: (row) => <TableCompactAmountCell amount={row.required} />,
      },
      {
        id: "payment",
        header: (
          <ColumnHeader
            label="Payment"
            hint="Cash paid to this class in this distribution."
          />
        ),
        align: "right",
        thClassName: "deals_th_align_right",
        sortValue: (row) => row.payment,
        cell: (row) => (
          <div className="deal_dist_pay_card">
            <span className="deal_dist_pay_card_amt">
              <TableCompactAmountCell amount={row.payment} />
            </span>
            <span className="deal_dist_pay_card_pct">
              ({formatSharePct(row.sharePct)})
            </span>
          </div>
        ),
      },
      {
        id: "unpaid",
        header: (
          <ColumnHeader
            label="Unpaid"
            hint="Accumulated Pref minus payment for this class on this run."
          />
        ),
        align: "right",
        thClassName: "deals_th_align_right",
        sortValue: (row) => row.unpaid,
        cell: (row) => <TableCompactAmountCell amount={row.unpaid} />,
      },
    ],
    [expandedClassId],
  )

  return (
    <div
      id="deal-dist-classes-panel"
      className="deal_dist_classes_panel"
      role="region"
      aria-label={`Distribution classes in ${distributionName}`}
    >
      <div className="deal_dist_classes_panel_head">
        <h3 className="deal_dist_classes_panel_title">
          Class distributions
        </h3>
        <FormTooltip
          label="More information: Class distributions"
          content={
            <p className="deals_table_header_tooltip_p">
              How {distributionName} was allocated across investor classes.
              Open a class to edit investor percent of class and payment, then send ACH.
            </p>
          }
          panelAlign="start"
          nativeButtonTrigger={false}
        />
      </div>
      <div
        className="um_toolbar um_toolbar_export_then_search deal_offering_section_toolbar deal_dist_classes_toolbar"
        role="toolbar"
        aria-label="Class distributions"
      >
        <div className="um_search_wrap">
          <Search className="um_search_icon" size={18} aria-hidden />
          <input
            type="search"
            className="um_search_input"
            placeholder="Search classes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search class distributions"
            autoComplete="off"
          />
        </div>
      </div>
      <DataTable
        visualVariant="members"
        membersTableClassName="um_table_members deal_inv_table deal_dist_table"
        columns={columns}
        rows={filtered}
        getRowKey={(row) => row.id}
        emptyLabel={
          query.trim()
            ? "No classes match your search."
            : "No class allocations for this distribution."
        }
        initialSort={{ columnId: "payment", direction: "desc" }}
        stickyFirstColumn={false}
        forceHorizontalScroll
        getRowClassName={(row) =>
          expandedClassId === row.id ? "deal_dist_table_row_expanded" : undefined
        }
        renderExpandedContent={(row) =>
          expandedClassId === row.id ? (
            <DistributionClassInvestorsPanel
              classLabel={row.name}
              rows={investorRowsForDistributionClass({
                row: distribution,
                classId: row.id,
                className: row.name,
                setupClasses,
                investors,
              })}
              dealId={dealId}
              distributionId={distribution.id}
              fundingReady={fundingReady}
              payouts={payouts}
              onPayoutsChange={setPayouts}
              onSaved={onSaved}
              onReload={handleReload}
            />
          ) : null
        }
      />
    </div>
  )
}

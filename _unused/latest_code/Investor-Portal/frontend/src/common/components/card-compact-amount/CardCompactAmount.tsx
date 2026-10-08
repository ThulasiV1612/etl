import type { ReactNode } from "react"
import { FormTooltip } from "../form-tooltip/FormTooltip"
import { parseMoneyDigits } from "../../../modules/Syndication/Deals/utils/offeringMoneyFormat"
import {
  formatCardCompactUsdDisplay,
  formatCardCompactUsdExact,
  formatTableCompactUsdDisplay,
  shouldShowCardCompactUsdTooltip,
  type CompactUsdDisplayMode,
} from "../../utils/cardCompactUsdAmount"
import "./card-compact-amount.css"

type Props = {
  amount: number | string | null | undefined
  className?: string
  valueClassName?: string
  /** Tooltip panel alignment (default `end` for right-aligned table cells). */
  tooltipPanelAlign?: "start" | "center" | "end"
  /** `table` always shows 2 decimal places below $1M. */
  displayMode?: CompactUsdDisplayMode
}

function parseAmount(amount: number | string | null | undefined): number {
  if (typeof amount === "number") return amount
  return parseMoneyDigits(String(amount ?? ""))
}

function CompactAmountValue({
  display,
  exact,
  showTooltip,
  className,
  valueClassName,
  tooltipPanelAlign = "end",
}: {
  display: string
  exact: string
  showTooltip: boolean
  className?: string
  valueClassName?: string
  tooltipPanelAlign?: "start" | "center" | "end"
}) {
  return (
    <span className={["card_compact_amount", className].filter(Boolean).join(" ")}>
      <span
        className={["card_compact_amount_value", valueClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {display}
      </span>
      {showTooltip ? (
        <FormTooltip
          label={`Exact amount: ${exact}`}
          content={
            <p className="card_compact_amount_tooltip_p">{exact}</p>
          }
          placement="top"
          panelAlign={tooltipPanelAlign}
          openOnHover
          className="card_compact_amount_info"
        />
      ) : null}
    </span>
  )
}

export function CardCompactAmount({
  amount,
  className,
  valueClassName,
  tooltipPanelAlign,
  displayMode = "default",
}: Props) {
  const raw = String(amount ?? "").trim()
  if (!raw || raw === "—") {
    return <span className={valueClassName ?? className}>—</span>
  }

  const n = parseAmount(amount)
  if (!Number.isFinite(n)) {
    return <span className={valueClassName ?? className}>{raw}</span>
  }

  const display =
    displayMode === "table"
      ? formatTableCompactUsdDisplay(n)
      : formatCardCompactUsdDisplay(n)
  const exact = formatCardCompactUsdExact(n)
  const showTooltip = shouldShowCardCompactUsdTooltip(n)

  return (
    <CompactAmountValue
      display={display}
      exact={exact}
      showTooltip={showTooltip}
      className={className}
      valueClassName={valueClassName}
      tooltipPanelAlign={tooltipPanelAlign}
    />
  )
}

/** KPI / metric cards: compact amount with optional info tooltip, or em dash. */
export function cardCompactAmountOrDash(
  raw: string | number | null | undefined,
): ReactNode {
  const text = String(raw ?? "").trim()
  if (!text || text === "—") return "—"
  return <CardCompactAmount amount={raw} />
}

/** Datatable cells: compact USD with 2 decimals below $1M, right-aligned. */
export function TableCompactAmountCell({
  amount,
  className,
}: {
  amount: string | number | null | undefined
  className?: string
}) {
  const text = String(amount ?? "").trim()
  if (!text || text === "—") {
    return <span className={className}>—</span>
  }
  return (
    <span
      className={["table_compact_amount_cell", className]
        .filter(Boolean)
        .join(" ")}
    >
      <CardCompactAmount
        amount={amount}
        displayMode="table"
        tooltipPanelAlign="end"
      />
    </span>
  )
}

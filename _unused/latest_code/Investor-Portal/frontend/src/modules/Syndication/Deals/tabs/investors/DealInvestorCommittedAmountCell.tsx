import {
  CardCompactAmount,
  TableCompactAmountCell,
} from "../../../../../common/components/card-compact-amount/CardCompactAmount"
import { formatCardCompactUsdExact } from "../../../../../common/utils/cardCompactUsdAmount"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import {
  displayInvestorCommittedAmount,
  investorCommittedPendingSplit,
  parseMoneyDigits,
} from "../../utils/offeringMoneyFormat"

type Props = { row: DealInvestorRow; alignEnd?: boolean }

/**
 * Committed column — compact USD (same as Remaining / Total Funded KPI cards).
 */
export function DealInvestorCommittedAmountCell({
  row,
  alignEnd = true,
}: Props) {
  const split = investorCommittedPendingSplit(row)
  const wrapClass = `deal_inv_ellipsis_text${alignEnd ? " deal_inv_ellipsis_text_end" : ""}`.trim()

  if (!split) {
    const amount = parseMoneyDigits(displayInvestorCommittedAmount(row))
    if (!Number.isFinite(amount)) {
      return <span className={wrapClass}>—</span>
    }
    return (
      <span className={wrapClass}>
        <TableCompactAmountCell amount={amount} />
      </span>
    )
  }

  const title = `${formatCardCompactUsdExact(split.snapshot)} + ${formatCardCompactUsdExact(split.incremental)}`
  return (
    <span className={wrapClass} title={title}>
      <span className="inline-flex items-center justify-end gap-0.5 flex-nowrap min-w-0 w-full">
        <CardCompactAmount amount={split.snapshot} displayMode="table" />
        <span aria-hidden> + </span>
        <CardCompactAmount amount={split.incremental} displayMode="table" />
      </span>
    </span>
  )
}

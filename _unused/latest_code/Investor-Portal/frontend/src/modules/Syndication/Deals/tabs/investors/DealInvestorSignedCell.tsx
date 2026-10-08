import type { DealInvestorRow } from "../../types/deal-investors.types"
import {
  investorRowShowsEsignStatusLink,
  investorSignedColumnDisplay,
  resolveInvestorRowEsignStatus,
} from "../../utils/investorEsignStatus"

export interface DealInvestorSignedCellProps {
  row: DealInvestorRow
  onOpenEsignStatus?: (row: DealInvestorRow) => void
}

function signedColumnButtonClass(display: string): string {
  const value = display.trim().toLowerCase()
  if (value === "sent" || value === "pending") {
    return "deal_inv_signed_btn deal_inv_signed_btn--sent"
  }
  if (value === "viewed") return "deal_inv_signed_btn deal_inv_signed_btn--viewed"
  if (value === "signed") return "deal_inv_signed_btn deal_inv_signed_btn--signed"
  if (value === "completed") return "deal_inv_signed_btn deal_inv_signed_btn--completed"
  return "deal_inv_signed_btn"
}

export function DealInvestorSignedCell({
  row,
  onOpenEsignStatus,
}: DealInvestorSignedCellProps) {
  const display = investorSignedColumnDisplay(row)
  const hasEsignWorkflow =
    Boolean(resolveInvestorRowEsignStatus(row)?.sentAt?.trim()) ||
    investorRowShowsEsignStatusLink(row)
  const clickable = hasEsignWorkflow && Boolean(onOpenEsignStatus)

  if (import.meta.env.DEV && display === "—" && row.docSignedDateIso) {
    console.debug("[DealInvestorSignedCell] row has docSignedDateIso but column is —", {
      id: row.id,
      docSignedDateIso: row.docSignedDateIso,
      signedDate: row.signedDate,
      esignStatus: row.esignStatus,
      esignStatusBundleJson: row.esignStatusBundleJson?.slice?.(0, 80),
    })
  }

  if (!clickable) {
    return (
      <span
        className="deal_inv_ellipsis_text"
        title={display !== "—" ? display : undefined}
      >
        {display}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={signedColumnButtonClass(display)}
      title={`eSign status: ${display}. Click for details.`}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        const targetRow = row
        queueMicrotask(() => onOpenEsignStatus?.(targetRow))
      }}
    >
      <span className="deal_inv_ellipsis_text">{display}</span>
    </button>
  )
}

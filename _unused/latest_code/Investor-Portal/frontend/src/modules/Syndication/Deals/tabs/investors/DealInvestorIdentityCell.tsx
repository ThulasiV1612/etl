import { FilePenLine } from "lucide-react"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import {
  EMAIL_UNAVAILABLE_LABEL,
  displayEmail,
  isDisplayableEmail,
} from "../../../../../common/utils/displayEmail"

function investorInitials(r: DealInvestorRow): string {
  const name = investorNameLabel(r)
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2)
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  if (name.length >= 2 && name !== "—") return name.slice(0, 2).toUpperCase()
  const e = String(r.userEmail ?? "").trim()
  if (isDisplayableEmail(e) && e.length >= 2) return e.slice(0, 2).toUpperCase()
  return "?"
}

/** Investor name: first + last when set, otherwise display name. */
function investorNameLabel(row: DealInvestorRow): string {
  const first = String(row.firstName ?? "").trim()
  const last = String(row.lastName ?? "").trim()
  const fromParts = [first, last].filter(Boolean).join(" ").trim()
  if (fromParts) return fromParts
  const display = String(row.displayName ?? "").trim()
  return display || "—"
}

export function DealInvestorIdentityCell({
  row,
  isDraft,
  onNameClick,
}: {
  row: DealInvestorRow
  isDraft?: boolean
  /** When set, the investor name opens details (e.g. view popup). */
  onNameClick?: (row: DealInvestorRow) => void
}) {
  const initials = investorInitials(row)
  const investorName = investorNameLabel(row)
  const email = String(row.userEmail ?? "").trim()
  const emailUsable = isDisplayableEmail(email)
  const entitySubtitle = String(row.entitySubtitle ?? "").trim()
  const emailLine = emailUsable
    ? email
    : email || !entitySubtitle
      ? displayEmail(email)
      : entitySubtitle
  const emailIsMuted =
    emailLine === "—" || emailLine === EMAIL_UNAVAILABLE_LABEL
  const emailTitle =
    emailUsable && entitySubtitle
      ? `${email} · ${entitySubtitle}`
      : !emailIsMuted
        ? emailLine
        : undefined

  const isClickable = Boolean(onNameClick && investorName !== "—")
  const nameClass = `deal_inv_identity_line1${
    investorName === "—" ? " um_status_muted" : ""
  }${isClickable ? " deal_inv_identity_name_btn" : ""}`

  return (
    <div className="deal_inv_identity_cell">
      <div className="um_user_avatar_ring" aria-hidden>
        <span className="um_user_initials">{initials}</span>
      </div>
      <div className="deal_inv_identity_text">
        <div className="deal_inv_identity_line1_row">
          {isClickable ? (
            <button
              type="button"
              className={nameClass}
              title={`View details for ${investorName}`}
              aria-label={`View details for ${investorName}`}
              onClick={(e) => {
                e.stopPropagation()
                onNameClick?.(row)
              }}
            >
              {investorName}
            </button>
          ) : (
            <span
              className={nameClass}
              title={investorName !== "—" ? investorName : undefined}
            >
              {investorName}
            </span>
          )}
          {isDraft ? (
            <span
              className="deals_list_draft_icon deals_list_draft_icon--draft"
              title="Unsaved draft"
            >
              <FilePenLine size={14} strokeWidth={2} aria-hidden />
              <span className="deals_list_sr_only">Draft</span>
            </span>
          ) : null}
        </div>
        <span
          className={`deal_inv_identity_line2 deal_inv_identity_ellipsis${
            emailIsMuted ? " um_status_muted" : ""
          }`}
          title={emailTitle}
        >
          {emailLine}
        </span>
      </div>
    </div>
  )
}

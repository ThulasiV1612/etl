import { CircleDot, Clock, TrendingUp } from "lucide-react"
import { useState } from "react"
import type { InvestorDealStatusBadgeVariant } from "@/modules/Syndication/Deals/constants/deal-lifecycle/investor-offering-status-ui"
import { InvestorOfferingStatusInfoModal } from "./InvestorOfferingStatusInfoModal"
import "./investor-deal-status-badge.css"

interface InvestorDealStatusBadgeProps {
  statusLabel: string
  badgeClassName: string
  hideStatusIcon?: boolean
  statusBadgeVariant?: InvestorDealStatusBadgeVariant
  statusInfo?: { message: string; tooltip?: string } | null
  labelClassName?: string
}

export function InvestorDealStatusBadge({
  statusLabel,
  badgeClassName,
  hideStatusIcon = false,
  statusBadgeVariant = "default",
  statusInfo = null,
  labelClassName = "",
}: InvestorDealStatusBadgeProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const infoMessage = statusInfo?.message?.trim()
  const hasModal = Boolean(infoMessage)
  const resolvedBadgeClassName = [
    badgeClassName,
    statusBadgeVariant === "invest_now"
      ? "investor_deal_status_badge--invest_now"
      : "",
    statusBadgeVariant === "coming_soon"
      ? "investor_deal_status_badge--coming_soon"
      : "",
  ]
    .filter(Boolean)
    .join(" ")

  const badgeInner = (
    <>
      {!hideStatusIcon ? (
        <span className="deals_list_stage_badge_icon" aria-hidden>
          {statusBadgeVariant === "invest_now" ? (
            <TrendingUp size={12} strokeWidth={2.25} />
          ) : statusBadgeVariant === "coming_soon" ? (
            <Clock size={12} strokeWidth={2} />
          ) : (
            <CircleDot size={12} strokeWidth={2} />
          )}
        </span>
      ) : null}
      <span
        className={["deal_card_status_label", labelClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {statusLabel}
      </span>
    </>
  )

  if (!hasModal) {
    return (
      <span className={resolvedBadgeClassName} title={`Stage: ${statusLabel}`}>
        {badgeInner}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        className={`investor_deal_status_badge_btn ${resolvedBadgeClassName}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setModalOpen(true)
        }}
        aria-label={`${statusLabel}. Click for details.`}
      >
        {badgeInner}
      </button>
      <InvestorOfferingStatusInfoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={statusLabel}
        statusLabel={statusLabel}
        message={infoMessage!}
        detail={statusInfo?.tooltip}
      />
    </>
  )
}

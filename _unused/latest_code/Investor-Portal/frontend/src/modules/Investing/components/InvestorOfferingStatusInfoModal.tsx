import { X } from "lucide-react"
import { useEffect, useId } from "react"
import { createPortal } from "react-dom"
import "@/modules/Syndication/Deals/tabs/investors/add-investment-modal.css"
import "@/modules/Syndication/usermanagement/user_management.css"
import "./investor-offering-status-info-modal.css"

interface InvestorOfferingStatusInfoModalProps {
  open: boolean
  onClose: () => void
  title: string
  statusLabel: string
  message: string
  detail?: string | null
}

export function InvestorOfferingStatusInfoModal({
  open,
  onClose,
  title,
  statusLabel,
  message,
  detail,
}: InvestorOfferingStatusInfoModalProps) {
  const titleId = useId()
  const detailText = detail?.trim()
  const showDetail = Boolean(detailText && detailText !== message.trim())

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="um_modal_overlay portal_modal_z_boost investor_offering_status_modal_overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel investor_offering_status_modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="um_modal_head">
          <h3 id={titleId} className="um_modal_title">
            {title}
          </h3>
          <button
            type="button"
            className="um_modal_close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="investor_offering_status_modal_body">
          <span
            className="investor_offering_status_modal_badge"
            aria-hidden
          >
            {statusLabel}
          </span>
          <p className="um_modal_desc investor_offering_status_modal_message">
            {message}
          </p>
          {showDetail ? (
            <p className="um_modal_desc investor_offering_status_modal_detail">
              {detailText}
            </p>
          ) : null}
        </div>

        <div className="um_modal_actions um_modal_actions_view investor_offering_status_modal_actions">
          <button type="button" className="um_btn_primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

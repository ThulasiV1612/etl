import { AlertCircle, FilePenLine, X } from "lucide-react"
import { useEffect, useId } from "react"
import { createPortal } from "react-dom"
import {
  OPEN_INVESTMENT_ESIGN_REQUIRED_MESSAGE,
  OPEN_INVESTMENT_ESIGN_REQUIRED_TITLE,
} from "../utils/canActivateOpenInvestment"
import "./open-investment-esign-required-modal.css"

interface OpenInvestmentEsignRequiredModalProps {
  open: boolean
  onGoToEsignTemplates: () => void
  onCancel: () => void
}

export function OpenInvestmentEsignRequiredModal({
  open,
  onGoToEsignTemplates,
  onCancel,
}: OpenInvestmentEsignRequiredModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="open_inv_esign_modal_overlay portal_modal_z_boost"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="open_inv_esign_modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="open_inv_esign_modal_head">
          <span className="open_inv_esign_modal_icon" aria-hidden>
            <AlertCircle size={22} strokeWidth={2} />
          </span>
          <div className="open_inv_esign_modal_head_text">
            <h2 id={titleId} className="open_inv_esign_modal_title">
              {OPEN_INVESTMENT_ESIGN_REQUIRED_TITLE}
            </h2>
          </div>
          <button
            type="button"
            className="open_inv_esign_modal_close"
            aria-label="Close"
            onClick={onCancel}
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>
        <div className="open_inv_esign_modal_body">
          <p className="open_inv_esign_modal_message">
            {OPEN_INVESTMENT_ESIGN_REQUIRED_MESSAGE}
          </p>
        </div>
        <footer className="open_inv_esign_modal_actions">
          <button
            type="button"
            className="open_inv_esign_modal_btn open_inv_esign_modal_btn--secondary"
            onClick={onCancel}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          <button
            type="button"
            className="open_inv_esign_modal_btn open_inv_esign_modal_btn--primary"
            onClick={onGoToEsignTemplates}
          >
            <FilePenLine size={16} strokeWidth={2} aria-hidden />
            Go to E-Sign Templates
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

import { Landmark, X } from "lucide-react"
import { useEffect, useId } from "react"
import { createPortal } from "react-dom"
import {
  ModalCancelButton,
  ModalFooterActions,
  ModalFooterTrailing,
  ModalSendButton,
} from "@/common/components/modal/ModalFooterButtons"

export type AchPayoutConfirmModalProps = {
  open: boolean
  title: string
  eyebrow?: string
  summaryRows?: Array<{ label: string; value: string }>
  message: string
  warning?: string
  confirmLabel?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Portal confirm dialog for ACH sends — matches deal list / contact modal chrome. */
export function AchPayoutConfirmModal({
  open,
  title,
  eyebrow = "ACH distribution",
  summaryRows,
  message,
  warning = "ACH payments cannot be edited after they are submitted.",
  confirmLabel = "Send ACH payment",
  busy = false,
  onCancel,
  onConfirm,
}: AchPayoutConfirmModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onKey)
    }
  }, [open, busy, onCancel])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_dist_ach_confirm_overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deals_suspend_all_modal_panel deal_dist_ach_confirm_modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="um_modal_head add_contact_modal_head">
          <div className="deal_dist_ach_confirm_head_main">
            <div className="deal_dist_ach_confirm_icon" aria-hidden>
              <Landmark size={18} strokeWidth={1.75} />
            </div>
            <div className="deal_dist_ach_confirm_head_text">
              <p className="deal_dist_ach_confirm_eyebrow">{eyebrow}</p>
              <h3
                id={titleId}
                className="um_modal_title add_contact_modal_title"
              >
                {title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            className="um_modal_close"
            onClick={() => !busy && onCancel()}
            disabled={busy}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="deals_add_inv_modal_scroll deal_dist_ach_confirm_body">
          {summaryRows && summaryRows.length > 0 ? (
            <dl className="deal_dist_ach_confirm_summary">
              {summaryRows.map((row) => (
                <div key={row.label} className="deal_dist_ach_confirm_summary_row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="deals_suspend_all_modal_message">{message}</p>
          {warning ? (
            <p className="deal_dist_ach_confirm_warning" role="note">
              {warning}
            </p>
          ) : null}
        </div>

        <ModalFooterActions>
          <ModalFooterTrailing>
            <ModalCancelButton onClick={onCancel} disabled={busy} />
            <ModalSendButton
              onClick={() => void onConfirm()}
              disabled={busy}
              busy={busy}
              busyLabel="Submitting…"
            >
              {confirmLabel}
            </ModalSendButton>
          </ModalFooterTrailing>
        </ModalFooterActions>
      </div>
    </div>,
    document.body,
  )
}

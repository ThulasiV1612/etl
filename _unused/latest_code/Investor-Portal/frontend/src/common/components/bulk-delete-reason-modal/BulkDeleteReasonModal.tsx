import { AlertTriangle, ClipboardList, Loader2, Trash2, X } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import "./bulk-delete-reason-modal.css"

export interface BulkDeleteReasonModalProps {
  open: boolean
  title: string
  description: string
  reasonLabel?: string
  reasonPlaceholder?: string
  confirmLabel?: string
  busy?: boolean
  onClose: () => void
  onConfirm: (reason: string) => void | Promise<void>
}

export function BulkDeleteReasonModal({
  open,
  title,
  description,
  reasonLabel = "Reason for deletion",
  reasonPlaceholder = "e.g. Sent in error, duplicate entry…",
  confirmLabel = "Delete",
  busy = false,
  onClose,
  onConfirm,
}: BulkDeleteReasonModalProps) {
  const titleId = useId()
  const descId = useId()
  const [reason, setReason] = useState("")
  const [err, setErr] = useState("")

  useEffect(() => {
    if (!open) {
      setReason("")
      setErr("")
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, busy, onClose])

  if (!open || typeof document === "undefined") return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setErr("Please enter a reason for deletion.")
      return
    }
    setErr("")
    await Promise.resolve(onConfirm(trimmed))
  }

  return createPortal(
    <div
      className="um_modal_overlay contacts_suspend_overlay bulk_delete_reason_overlay portal_modal_z_boost"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="um_modal contacts_suspend_modal bulk_delete_reason_modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="um_modal_head">
          <h3 id={titleId} className="um_modal_title um_title_with_icon">
            <AlertTriangle
              className="um_title_icon contacts_suspend_title_icon contacts_suspend_title_icon_warn"
              size={22}
              strokeWidth={2}
              aria-hidden
            />
            <span>{title}</span>
          </h3>
          <button
            type="button"
            className="um_modal_close"
            aria-label="Close"
            disabled={busy}
            onClick={() => !busy && onClose()}
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <p
          id={descId}
          className="contacts_suspend_modal_desc contacts_suspend_modal_desc_warn"
        >
          <AlertTriangle
            className="contacts_suspend_modal_desc_icon"
            size={18}
            strokeWidth={2}
            aria-hidden
          />
          <span>{description}</span>
        </p>

        <form className="bulk_delete_reason_form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="um_field contacts_suspend_reason_field">
            <label className="um_field_label_row" htmlFor={`${titleId}-reason`}>
              <ClipboardList
                className="um_field_label_icon"
                size={17}
                strokeWidth={2}
                aria-hidden
              />
              <span>
                {reasonLabel}{" "}
                <span className="contacts_required" aria-hidden>
                  *
                </span>
              </span>
            </label>
            <textarea
              id={`${titleId}-reason`}
              className="um_field_textarea contacts_suspend_reason_textarea"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (err) setErr("")
              }}
              placeholder={reasonPlaceholder}
              rows={3}
              disabled={busy}
              aria-required
            />
          </div>
          {err ? (
            <p className="um_msg_error um_modal_form_error" role="alert">
              {err}
            </p>
          ) : null}
          <div className="um_modal_actions add_contact_modal_actions contacts_suspend_modal_actions">
            <button
              type="button"
              className="um_btn_secondary"
              onClick={onClose}
              disabled={busy}
            >
              <X size={16} strokeWidth={2} aria-hidden />
              Close
            </button>
            <div className="add_contact_modal_actions_trailing">
              <button
                type="submit"
                className="um_btn_primary bulk_delete_reason_confirm_btn"
                disabled={busy}
              >
              {busy ? (
                <>
                  <Loader2 size={16} strokeWidth={2} aria-hidden />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 size={16} strokeWidth={2} aria-hidden />
                  {confirmLabel}
                </>
              )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

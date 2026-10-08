import { X } from "lucide-react"
import { useEffect, useId } from "react"
import { createPortal } from "react-dom"
import {
  ModalCancelButton,
  ModalFooterActions,
  ModalFooterTrailing,
  ModalSaveButton,
} from "../../../../../common/components/modal/ModalFooterButtons"

interface UnsavedChangesModalProps {
  open: boolean
  busy?: boolean
  title?: string
  message?: string
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}

export function UnsavedChangesModal({
  open,
  busy = false,
  title = "Unsaved changes",
  message = "You have unsaved changes on Distribution Setup. Save them before leaving, or discard them.",
  onCancel,
  onDiscard,
  onSave,
}: UnsavedChangesModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, busy, onCancel])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_member_delete_overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_member_delete_modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="um_modal_head add_contact_modal_head">
          <h3 id={titleId} className="um_modal_title add_contact_modal_title">
            {title}
          </h3>
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
        <div className="deals_add_inv_modal_scroll">
          <p className="deals_suspend_all_modal_message">{message}</p>
        </div>
        <ModalFooterActions>
          <ModalFooterTrailing>
            <ModalCancelButton onClick={onCancel} disabled={busy}>
              Cancel
            </ModalCancelButton>
            <button
              type="button"
              className="um_btn_secondary"
              disabled={busy}
              onClick={onDiscard}
            >
              Don&apos;t save
            </button>
            <ModalSaveButton
              onClick={() => void onSave()}
              disabled={busy}
              busy={busy}
              busyLabel="Saving…"
            >
              Save
            </ModalSaveButton>
          </ModalFooterTrailing>
        </ModalFooterActions>
      </div>
    </div>,
    document.body,
  )
}

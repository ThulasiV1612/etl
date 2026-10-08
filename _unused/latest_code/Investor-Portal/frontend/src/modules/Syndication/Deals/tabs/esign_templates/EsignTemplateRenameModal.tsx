import { Loader2, Pencil, Save, X } from "lucide-react"
import { useCallback, useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import "./esign-template-upload-modal.css"

export interface EsignTemplateRenameModalProps {
  open: boolean
  initialName: string
  busy: boolean
  onClose: () => void
  onSave: (templateName: string) => void | Promise<void>
}

export function EsignTemplateRenameModal({
  open,
  initialName,
  busy,
  onClose,
  onSave,
}: EsignTemplateRenameModalProps) {
  const titleId = useId()
  const inputId = useId()
  const [templateName, setTemplateName] = useState(initialName)

  useEffect(() => {
    if (!open) return
    setTemplateName(initialName)
  }, [open, initialName])

  const handleSubmit = useCallback(() => {
    const name = templateName.trim()
    if (!name) return
    void onSave(name)
  }, [onSave, templateName])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, busy, onClose])

  if (!open || typeof document === "undefined") return null

  const canSave = Boolean(templateName.trim()) && !busy

  return createPortal(
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_esign_upload_overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_esign_upload_modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="um_modal_head add_contact_modal_head">
          <h3 id={titleId} className="um_modal_title add_contact_modal_title um_title_with_icon">
            <Pencil size={18} aria-hidden />
            <span>Edit template name</span>
          </h3>
          <button
            type="button"
            className="um_modal_close"
            onClick={() => !busy && onClose()}
            disabled={busy}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {/* <p className="deal_esign_upload_modal_desc">
          This template is ready for investors. You can change the display name only; signature
          fields cannot be edited here.
        </p> */}
        <div className="deals_add_inv_modal_scroll">
          <div className="um_field" style={{ margin: "0 1.25rem" }}>
            <label className="um_label" htmlFor={inputId}>
              Template name
            </label>
            <input
              id={inputId}
              type="text"
              className="um_input"
              value={templateName}
              disabled={busy}
              autoFocus
              placeholder="e.g. Subscription agreement"
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
          </div>
        </div>
        <div className="um_modal_actions add_contact_modal_actions">
          <button
            type="button"
            className="um_btn_secondary"
            onClick={onClose}
            disabled={busy}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          <button
            type="button"
            className="um_btn_primary"
            onClick={handleSubmit}
            disabled={!canSave}
          >
            {busy ? (
              <>
                <Loader2
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                  className="add_contact_modal_btn_spin"
                />
                Saving…
              </>
            ) : (
              <>
                <Save size={16} strokeWidth={2} aria-hidden />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

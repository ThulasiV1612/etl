import {
  Archive,
  Building2,
  FilePenLine,
  HandCoins,
  Loader2,
  Save,
  X,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useId } from "react"
import { createPortal } from "react-dom"
import type { DealStage } from "../constants/deal-lifecycle/deal-stage"
import type { DealStageModalPayload } from "../constants/deal-stage-modal-config"
import "./deal-stage-change-modal.css"

const STAGE_ICONS: Record<DealStage, LucideIcon> = {
  draft: FilePenLine,
  capital_raising: HandCoins,
  asset_managing: Building2,
  liquidated: Archive,
}

interface DealStageChangeConfirmModalProps {
  open: boolean
  content: DealStageModalPayload
  confirming?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DealStageChangeConfirmModal({
  open,
  content,
  confirming = false,
  onConfirm,
  onCancel,
}: DealStageChangeConfirmModalProps) {
  const titleId = useId()
  const { stage, stageLabel, title, description, confirmText } = content
  const StageIcon = STAGE_ICONS[stage]

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirming) onCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [open, confirming, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="deal_stage_modal_overlay portal_modal_z_boost"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirming) onCancel()
      }}
    >
      <div
        className={`deal_stage_modal deal_stage_modal--${stage}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="deal_stage_modal_head">
          <div className="deal_stage_modal_icon_wrap" aria-hidden>
            <StageIcon size={22} strokeWidth={2} />
          </div>
          <div className="deal_stage_modal_head_text">
            <p className="deal_stage_modal_eyebrow">Change deal stage</p>
            <h2 id={titleId} className="deal_stage_modal_title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="deal_stage_modal_close"
            aria-label="Close"
            disabled={confirming}
            onClick={onCancel}
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="deal_stage_modal_body">
          <span className="deal_stage_modal_badge">Moving to {stageLabel}</span>
          <p className="deal_stage_modal_desc">{description}</p>
        </div>

        <footer className="deal_stage_modal_actions">
          <button
            type="button"
            className="deal_stage_modal_btn deal_stage_modal_btn--cancel"
            disabled={confirming}
            onClick={onCancel}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          <button
            type="button"
            className="deal_stage_modal_btn deal_stage_modal_btn--confirm"
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? (
              <>
                <Loader2
                  size={16}
                  strokeWidth={2}
                  className="deals_create_btn_spin"
                  aria-hidden
                />
                Saving…
              </>
            ) : (
              <>
                <Save size={16} strokeWidth={2} aria-hidden />
                {confirmText}
              </>
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

import { BadgeDollarSign, CircleCheck, ClipboardList, Loader2, X } from "lucide-react"
import { useEffect, useId } from "react"
import { createPortal } from "react-dom"
import { normalizeDealStageCanonical } from "../constants/deal-lifecycle/deal-stage"
import "./deal-stage-change-modal.css"

function stageLabel(raw: string | null | undefined): string {
  const stage = normalizeDealStageCanonical(raw)
  if (stage === "asset_managing") return "Asset Managing"
  return "Capital Raising"
}

export type DealBillableStageNoticeMode = "complete_deal" | "billing"

export function DealBillableStageNoticeModal({
  open,
  dealStage,
  mode = "billing",
  confirming = false,
  onOk,
  onClose,
}: {
  open: boolean
  dealStage: string | null | undefined
  mode?: DealBillableStageNoticeMode
  confirming?: boolean
  onOk: () => void
  onClose: () => void
}) {
  const titleId = useId()
  const label = stageLabel(dealStage)
  const completeDeal = mode === "complete_deal"

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirming) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose, confirming])

  if (!open) return null

  return createPortal(
    <div
      className="deal_stage_modal_overlay portal_modal_z_boost"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirming) onClose()
      }}
    >
      <div
        className={`deal_stage_modal${
          completeDeal
            ? " deal_stage_modal--complete_deal"
            : " deal_stage_modal--saas_paywall"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="deal_stage_modal_head">
          <div className="deal_stage_modal_icon_wrap" aria-hidden>
            {completeDeal ? (
              <ClipboardList size={22} strokeWidth={2} />
            ) : (
              <BadgeDollarSign size={22} strokeWidth={2} />
            )}
          </div>
          <div className="deal_stage_modal_head_text">
            <p className="deal_stage_modal_eyebrow">
              {completeDeal ? "Add deal" : "Monthly billing"}
            </p>
            <h2 id={titleId} className="deal_stage_modal_title">
              {completeDeal
                ? "Complete creating this deal"
                : "This stage needs a paid plan"}
            </h2>
          </div>
          <button
            type="button"
            className="deal_stage_modal_close"
            aria-label="Close"
            disabled={confirming}
            onClick={onClose}
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="deal_stage_modal_body">
          <span className="deal_stage_modal_badge">{label}</span>
          {completeDeal ? (
            <p className="deal_stage_modal_desc">
              Fill in the required fields on the add deal form first — deal
              name, SEC type, owning entity, and the Yes/No questions. After
              those are complete, choose Capital Raising or Asset Managing
              again to pick a plan.
            </p>
          ) : (
            <>
              <p className="deal_stage_modal_desc">
                Billing starts when you start raising capital or asset managing.
                This deal stays in Draft until payment is complete. After you
                pay, the stage changes to {label}. You can keep working at no
                charge until 10 September 2026. After that date, the lead
                sponsor needs to pay so the deal stays open to view and edit.
              </p>
              <p
                className="deal_stage_modal_desc"
                style={{ marginTop: "0.65rem" }}
              >
                No charge while in Draft mode. No charge for archived deals.
                Click OK to choose a plan on the Pricing tab.
              </p>
            </>
          )}
        </div>

        <footer className="deal_stage_modal_actions">
          <button
            type="button"
            className="deal_stage_modal_btn deal_stage_modal_btn--confirm"
            disabled={confirming}
            onClick={onOk}
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
                <CircleCheck size={16} strokeWidth={2} aria-hidden />
                OK
              </>
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

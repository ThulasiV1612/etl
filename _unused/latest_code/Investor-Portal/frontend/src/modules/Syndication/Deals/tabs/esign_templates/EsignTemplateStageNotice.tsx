import { Check, Info } from "lucide-react"
import type { EsignTemplateStageNoticeVariant } from "../../utils/esignTemplateStageNotice"

interface EsignTemplateStageNoticeProps {
  variant: EsignTemplateStageNoticeVariant
}

export function EsignTemplateStageNotice({ variant }: EsignTemplateStageNoticeProps) {
  if (variant === "onboarding_active") {
    return (
      <div
        className="deal_esign_stage_notice deal_esign_stage_notice--active"
        role="note"
      >
        <span className="deal_esign_stage_notice_icon" aria-hidden>
          <Check size={18} strokeWidth={2.5} />
        </span>
        <div className="deal_esign_stage_notice_body">
          <p className="deal_esign_stage_notice_lead">
            E-sign onboarding is now active.
          </p>
          <p className="deal_esign_stage_notice_detail">
            Investors will receive documents for review, signature, and
            completion of their investment.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="deal_esign_stage_notice deal_esign_stage_notice--info"
      role="note"
    >
      <span className="deal_esign_stage_notice_icon" aria-hidden>
        <Info size={18} strokeWidth={2} />
      </span>
      <div className="deal_esign_stage_notice_body">
        <p className="deal_esign_stage_notice_lead">
          You can create and configure e-sign templates at this stage.
        </p>
        <p className="deal_esign_stage_notice_detail">
          However, documents will not be sent to investors yet.
        </p>
        <p className="deal_esign_stage_notice_detail">
          E-sign onboarding will start once the deal is moved to{" "}
          <strong>Open to Investment</strong>.
        </p>
      </div>
    </div>
  )
}

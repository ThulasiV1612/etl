import { Info } from "lucide-react"
import {
  getInvestorOfferingStatusUi,
  type InvestorOfferingStatusUi,
} from "@/modules/Syndication/Deals/constants/deal-lifecycle"
import "./investor-offering-preview-notice.css"

interface InvestorOfferingPreviewNoticeProps {
  offeringStatus: string | null | undefined
  className?: string
}

export function resolveInvestorPreviewNotice(
  offeringStatus: string | null | undefined,
): Pick<InvestorOfferingStatusUi, "previewMessage" | "previewTooltip" | "isPreviewOnly"> {
  const ui = getInvestorOfferingStatusUi(offeringStatus)
  return {
    isPreviewOnly: ui.isPreviewOnly,
    previewMessage: ui.previewMessage,
    previewTooltip: ui.previewTooltip,
  }
}

export function InvestorOfferingPreviewNotice({
  offeringStatus,
  className,
}: InvestorOfferingPreviewNoticeProps) {
  const { isPreviewOnly, previewMessage, previewTooltip } =
    resolveInvestorPreviewNotice(offeringStatus)

  if (!isPreviewOnly || !previewMessage?.trim()) return null

  return (
    <div
      className={["investor_offering_preview_notice", className]
        .filter(Boolean)
        .join(" ")}
      role="note"
      title={previewTooltip ?? undefined}
    >
      <Info
        size={16}
        strokeWidth={2}
        className="investor_offering_preview_notice_icon"
        aria-hidden
      />
      <p className="investor_offering_preview_notice_text">{previewMessage}</p>
    </div>
  )
}

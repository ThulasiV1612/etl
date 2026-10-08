import { ArrowLeft } from "lucide-react"
import { useCallback, useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import type { DealDetailApi } from "@/modules/Syndication/Deals/api/dealsApi"
import { DealOfferingPreviewInner } from "@/modules/Syndication/Deals/DealOfferingPreviewInner"
import { dealInvestNowPath } from "@/modules/Syndication/Deals/utils/dealInvestNowPath"
import type { DealInvestorsPayload } from "@/modules/Syndication/Deals/types/deal-investors.types"
import type { DealInvestorClass } from "@/modules/Syndication/Deals/types/deal-investor-class.types"
import { InvestorOfferingPreviewNotice } from "@/modules/Investing/components/InvestorOfferingPreviewNotice"
import type { InvestNowLocationState } from "@/modules/Investing/pages/invest/investNowLocationState"
import type { InvestNowStepperPhase } from "@/modules/Investing/pages/invest/investNowFlowSteps"
import { investNowDraftSnapshotForViewer } from "@/modules/Investing/pages/invest/investNowDraftUtils"
import { canLpInvestNowOnDeal } from "@/modules/Investing/utils/lpInvestNowEligibility"
import { LpDealStickyCta } from "../components/lp-deal-sticky-cta"
import { LpDealOfferingDocumentsPanel } from "../components/lp-deal-offering-documents-panel"
import "@/modules/Syndication/Deals/deal-offering-portfolio.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "../lp-deal-details.css"

export interface LpDealDetailsPageProps {
  deal: DealDetailApi
  classes: DealInvestorClass[]
  investorsPayload: DealInvestorsPayload
  onInvestNow: () => void
  backTo: string
  viewerRoleLabel?: string | null
}

/** Investing deal workspace — same bento offering layout as sponsor preview / shared link. */
export function LpDealDetailsPage({
  deal,
  classes,
  investorsPayload,
  onInvestNow,
  backTo,
}: LpDealDetailsPageProps) {
  const navigate = useNavigate()
  const showInvestNowCta = canLpInvestNowOnDeal(deal)
  const draftSnapshot = useMemo(
    () => investNowDraftSnapshotForViewer(investorsPayload.investors),
    [investorsPayload.investors],
  )

  const openInvestNowResume = useCallback(
    (phaseId?: InvestNowStepperPhase["id"]) => {
      const id = deal.id.trim()
      if (!id || !draftSnapshot) return
      navigate(dealInvestNowPath(id), {
        state: {
          returnTo: backTo,
          mode: "resume",
          phaseId: phaseId ?? draftSnapshot.progress.phaseId,
          investmentId: draftSnapshot.resumeScope.investmentId,
          userInvestorProfileId: draftSnapshot.resumeScope.userInvestorProfileId,
          profileId: draftSnapshot.resumeScope.profileId,
        } satisfies InvestNowLocationState,
      })
    },
    [backTo, deal.id, draftSnapshot, navigate],
  )

  return (
    <div className="lpdd deal_offer_pf_page">
      <div className="deal_offer_pf lpdd_shell">
        <div className="lpdd_back_row">
          <Link className="deals_list_inline_back" to={backTo}>
            <ArrowLeft size={18} strokeWidth={2} aria-hidden />
            Back to deals
          </Link>
        </div>

        <InvestorOfferingPreviewNotice offeringStatus={deal.offeringStatus} />

        <DealOfferingPreviewInner
          detail={deal}
          classes={classes}
          investorsPayload={investorsPayload}
          applyInvestorLinkVisibility
          isPublicOfferingRoute={false}
          isLpDealWorkspace
          showDocumentsSection={false}
          documentsSection={
            <LpDealOfferingDocumentsPanel
              dealId={deal.id.trim()}
              embedded
            />
          }
          showInvestNowCta={showInvestNowCta}
          onInvestNow={showInvestNowCta ? onInvestNow : undefined}
          investNowDraftProgress={draftSnapshot?.progress ?? null}
          onInvestNowPhaseClick={
            draftSnapshot ? openInvestNowResume : undefined
          }
          galleryUsesPersistedSourcesOnly={false}
        />

      </div>

      {showInvestNowCta ? (
        <LpDealStickyCta label="Invest now" onInvest={onInvestNow} />
      ) : draftSnapshot ? (
        <LpDealStickyCta
          label="Continue onboarding"
          onInvest={() => openInvestNowResume()}
        />
      ) : null}
    </div>
  )
}

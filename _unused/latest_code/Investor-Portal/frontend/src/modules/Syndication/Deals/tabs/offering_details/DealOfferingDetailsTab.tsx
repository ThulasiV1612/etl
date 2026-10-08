import { ChevronDown, Eye } from "lucide-react"
import { FormTooltip } from "../../../../../common/components/form-tooltip/FormTooltip"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import type { DealDetailApi } from "../../api/dealsApi"
import type { ViewerDealMemberRole } from "../../utils/dealDetailTabVisibility"
import { CoSponsorEmailInterceptCard } from "./CoSponsorEmailInterceptCard"
import {
  OFFERING_DETAILS_ACCORDION_SECTION_ORDER,
  offeringSectionHasInvestorPreviewTarget,
  readOfferingPreviewInvestorVisibility,
  writeOfferingPreviewInvestorVisibility,
  type OfferingDetailsSectionId,
} from "../../utils/offeringPreviewInvestorVisibility"
import { OFFERING_DETAILS_SECTION_INFO } from "../../utils/offeringDetailsSectionInfo"
import {
  applyOfferingInvestorPreviewJsonFromServer,
  scheduleOfferingInvestorPreviewServerSync,
} from "../../utils/offeringPreviewServerState"
import { isOfferingPreviewHydrated } from "../../utils/offeringPreviewRuntimeStore"
import {
  clearOverviewExcludedAssetIds,
  dispatchOverviewAssetsMergeEvent,
  markOverviewAssetsMergePending,
} from "../../utils/offeringOverviewAssetSync"
import { InvestorSummarySection } from "./InvestorSummarySection"
import { OfferingGallerySection } from "./OfferingGallerySection"
import "../../deal-offering-details.css"
import { AssetsSection } from "./AssetsSection"
import { KeyHighlightsSection } from "./KeyHighlightsSection"
import { FundingInfoSection } from "./FundingInfoSection"
import { OfferingAnnouncementSection } from "./OfferingAnnouncementSection"
import { OfferingInformationSection } from "./OfferingInformationSection"
import { OfferingOverviewSection } from "./OfferingOverviewSection"
import {
  DEAL_DETAIL_TAB_QUERY_PARAM,
  isOfferingDetailsSectionId,
  OFFERING_SECTION_QUERY_PARAM,
  offeringSectionElementId,
  openSectionsFromUrlSection,
  scrollToOfferingSection,
} from "../../utils/offeringDetailsSectionNav"
import "../deal_members/add-investment/add_deal_modal.css"
interface DealOfferingDetailsTabProps {
  detail: DealDetailApi
  onDealUpdated?: (deal: DealDetailApi) => void
  viewerDealMemberRole?: ViewerDealMemberRole
}

export function DealOfferingDetailsTab({
  detail,
  onDealUpdated,
  viewerDealMemberRole = null,
}: DealOfferingDetailsTabProps) {
  const onDealUpdatedRef = useRef(onDealUpdated)
  onDealUpdatedRef.current = onDealUpdated
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const baseId = useId()
  const [openSections, setOpenSections] = useState(() =>
    openSectionsFromUrlSection(
      searchParams.get(OFFERING_SECTION_QUERY_PARAM),
    ),
  )
  const [previewHydrated, setPreviewHydrated] = useState(false)
  const [investorPreviewVisibility, setInvestorPreviewVisibility] = useState(
    () => readOfferingPreviewInvestorVisibility(detail.id),
  )
  const prevAssetsInvestorVisibleRef = useRef(
    readOfferingPreviewInvestorVisibility(detail.id).assets,
  )

  useEffect(() => {
    const id = detail.id.trim()
    if (!id) {
      setPreviewHydrated(false)
      return
    }
    applyOfferingInvestorPreviewJsonFromServer(
      id,
      detail.offeringInvestorPreviewJson,
    )
    setInvestorPreviewVisibility(readOfferingPreviewInvestorVisibility(id))
    prevAssetsInvestorVisibleRef.current =
      readOfferingPreviewInvestorVisibility(id).assets
    setPreviewHydrated(isOfferingPreviewHydrated(id))
  }, [detail.id, detail.offeringInvestorPreviewJson])

  useEffect(() => {
    if (!previewHydrated || !detail.id.trim()) return
    writeOfferingPreviewInvestorVisibility(detail.id, investorPreviewVisibility)
    scheduleOfferingInvestorPreviewServerSync(detail.id, {
      onSuccess: (d) => onDealUpdatedRef.current?.(d),
    })
  }, [detail.id, investorPreviewVisibility, previewHydrated])

  useEffect(() => {
    const nowVisible = investorPreviewVisibility.assets
    const wasVisible = prevAssetsInvestorVisibleRef.current
    prevAssetsInvestorVisibleRef.current = nowVisible
    if (!nowVisible || wasVisible) return
    clearOverviewExcludedAssetIds(detail.id)
    markOverviewAssetsMergePending(detail.id)
    dispatchOverviewAssetsMergeEvent(detail.id)
  }, [detail.id, investorPreviewVisibility.assets])

  useEffect(() => {
    const fromUrl = searchParams.get(OFFERING_SECTION_QUERY_PARAM)
    if (!isOfferingDetailsSectionId(fromUrl)) return
    setOpenSections((prev) => {
      const next = openSectionsFromUrlSection(fromUrl)
      const unchanged = OFFERING_DETAILS_ACCORDION_SECTION_ORDER.every(
        ({ id }) => prev[id] === next[id],
      )
      return unchanged ? prev : next
    })
    scrollToOfferingSection(fromUrl)
  }, [searchParams])

  const setSectionExpanded = useCallback(
    (sectionId: OfferingDetailsSectionId, expanded: boolean) => {
      setOpenSections((prev) => ({ ...prev, [sectionId]: expanded }))
      setSearchParams(
        (prevParams) => {
          const next = new URLSearchParams(prevParams)
          if (expanded) {
            next.set(OFFERING_SECTION_QUERY_PARAM, sectionId)
            if (!next.get(DEAL_DETAIL_TAB_QUERY_PARAM)?.trim())
              next.set(DEAL_DETAIL_TAB_QUERY_PARAM, "offering_details")
          } else if (next.get(OFFERING_SECTION_QUERY_PARAM) === sectionId) {
            next.delete(OFFERING_SECTION_QUERY_PARAM)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const handleSectionSaved = useCallback(
    (sectionId: OfferingDetailsSectionId, deal: DealDetailApi) => {
      onDealUpdatedRef.current?.(deal)
      setSectionExpanded(sectionId, true)
      scrollToOfferingSection(sectionId)
    },
    [setSectionExpanded],
  )

  function sectionBody(id: OfferingDetailsSectionId) {
    switch (id) {
      case "make_announcement":
        return (
          <OfferingAnnouncementSection
            dealId={detail.id}
            initialTitle={detail.dealAnnouncementTitle}
            initialMessage={detail.dealAnnouncementMessage}
            onSaved={(d) => handleSectionSaved("make_announcement", d)}
          />
        )
      case "overview":
        return (
          <OfferingOverviewSection
            detail={detail}
            onSaved={(d) => handleSectionSaved("overview", d)}
          />
        )
      case "offering_information":
        return (
          <OfferingInformationSection
            dealId={detail.id}
            dealName={detail.dealName}
            dealOfferingStatus={detail.offeringStatus}
            dealOfferingVisibility={detail.offeringVisibility}
          />
        )
      case "gallery":
        return (
          <OfferingGallerySection
            detail={detail}
            onDealUpdated={(d) => onDealUpdatedRef.current?.(d)}
            onUserSaved={(d) => handleSectionSaved("gallery", d)}
          />
        )
      case "summary":
        return (
          <InvestorSummarySection
            dealId={detail.id}
            initialStoredHtml={detail.investorSummaryHtml}
            onSaved={(d) => handleSectionSaved("summary", d)}
          />
        )
      case "assets":
        return <AssetsSection key={detail.id} detail={detail} />
      case "key_highlights":
        return (
          <KeyHighlightsSection
            dealId={detail.id}
            initialStoredJson={detail.keyHighlightsJson}
            onSaved={(d) => handleSectionSaved("key_highlights", d)}
          />
        )
      case "funding_instructions":
        return (
          <FundingInfoSection
            dealId={detail.id}
            initialStoredJson={detail.fundingInstructionsJson}
            onSaved={(d) => handleSectionSaved("funding_instructions", d)}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="deal_offering_root">
      <div className="deal_offering_top">
        <div className="deal_offering_top_row">
          <div className="deal_offering_intro_block">
            <p className="deal_offering_intro">
              Configure sections below, then open the investor-facing preview to
              see how this offering reads end-to-end. Upload deal files on the{" "}
              <strong>Documents</strong> tab (workspace sections control what
              investors see on the offering link and LP portal). Each section’s{" "}
              <strong>Make it visible to Investors</strong> control sets what
              appears in <strong>Preview offering</strong> and on the{" "}
              <strong>shared investor link</strong>.
            </p>
          </div>
          <button
            type="button"
            className="um_btn_primary deal_offering_preview_btn"
            onClick={() =>
              navigate(
                `/deals/${encodeURIComponent(detail.id)}/offering-portfolio`,
              )
            }
          >
            <Eye size={18} strokeWidth={2} aria-hidden />
            <span>Preview offering</span>
          </button>
        </div>
        {viewerDealMemberRole === "co_sponsor" ? (
          <CoSponsorEmailInterceptCard dealId={detail.id} />
        ) : null}
        {/* <dl
          className="deal_offering_metrics"
          aria-label="Key offering figures"
        >
          <div className="deal_offering_metric">
            <dt>Offering size</dt>
            <dd>{offeringSizeDisplay}</dd>
          </div>
          <div className="deal_offering_metric">
            <dt>Raise target</dt>
            <dd>{raiseTargetDisplay}</dd>
          </div>
          <div className="deal_offering_metric">
            <dt>Investors</dt>
            <dd title="Total number of investors">
              {investorsDisplay}
            </dd>
          </div>
          <div className="deal_offering_metric">
            <dt>Total accepted</dt>
            <dd>{totalAcceptedDisplay}</dd>
          </div>
        </dl> */}
      </div>
      <div className="deal_offering_stack" role="list">
        {OFFERING_DETAILS_ACCORDION_SECTION_ORDER.map(({ id, label }) => {
          const expanded = Boolean(openSections[id])
          const panelId = `${baseId}-${id}`
          const sectionInfo = OFFERING_DETAILS_SECTION_INFO[id]
          const investorToggle = (
            <label
              className={`deal_offering_investor_preview_toggle${offeringSectionHasInvestorPreviewTarget(id) ? "" : " deal_offering_investor_preview_toggle--muted"}`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              title={
                offeringSectionHasInvestorPreviewTarget(id)
                  ? "When checked, this block appears in Preview offering and on the shared investor link. Uncheck to hide it in both."
                  : "This section is not mapped to the offering preview page yet; the toggle is reserved for when it is."
              }
            >
              <input
                type="checkbox"
                checked={investorPreviewVisibility[id]}
                onChange={(e) => {
                  e.stopPropagation()
                  setInvestorPreviewVisibility((p) => ({
                    ...p,
                    [id]: e.target.checked,
                  }))
                }}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Make ${label} visible to investors in preview and shared link`}
              />
              <span className="deal_offering_investor_preview_toggle_text">
                Make it visible to Investors
              </span>
            </label>
          )
          return (
            <div
              key={id}
              id={offeringSectionElementId(id)}
              className={`deal_offering_section${expanded ? " deal_offering_section_expanded" : ""}`}
              role="listitem"
            >
              <div className="deal_offering_trigger_row">
                <button
                  type="button"
                  id={`${panelId}-trigger`}
                  className="deal_offering_trigger_toggle"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setSectionExpanded(id, !expanded)}
                >
                  <span className="deal_offering_trigger_label_row">
                    <span className="deal_offering_trigger_label">{label}</span>
                    {sectionInfo ? (
                      <span
                        className="deal_offering_trigger_info"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <FormTooltip
                          label={`More information: ${label}`}
                          content={
                            <p className="form_heading_with_info_tooltip_inner">
                              {sectionInfo}
                            </p>
                          }
                          panelAlign="start"
                          nativeButtonTrigger={false}
                          openOnHover={false}
                        />
                      </span>
                    ) : null}
                  </span>
                </button>
                {investorToggle}
                <button
                  type="button"
                  className="deal_offering_trigger_chevron_btn"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  aria-label={
                    expanded ? `Collapse ${label}` : `Expand ${label}`
                  }
                  onClick={() => setSectionExpanded(id, !expanded)}
                >
                  <ChevronDown
                    size={20}
                    strokeWidth={2}
                    aria-hidden
                    className={`deal_offering_chevron${expanded ? " deal_offering_chevron_open" : ""}`}
                  />
                </button>
              </div>
              <div
                id={panelId}
                role="region"
                aria-labelledby={`${panelId}-trigger`}
                hidden={!expanded}
                className="deal_offering_panel"
              >
                {expanded ? sectionBody(id) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

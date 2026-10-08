import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  Eye,
  FileText,
  Map,
  TrendingUp,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
  type ReactNode,
} from "react"
import DOMPurify from "dompurify"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import type { DealDetailApi } from "./api/dealsApi"
import { DealAnnouncementBanner } from "./components/DealAnnouncementBanner"
import type { DealInvestorsPayload } from "./types/deal-investors.types"
import type { DealInvestorClass } from "./types/deal-investor-class.types"
import {
  listWorkspaceDocumentsForOfferingPreview,
  OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT,
} from "./utils/offeringPreviewDocSections"
import {
  OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT,
  readInvestorVisibilityForOfferingPreview,
} from "./utils/offeringPreviewInvestorVisibility"
import { buildOfferingPreviewAssetBlocks } from "./utils/offeringPreviewAssets"
import { orderedGalleryUrlsForOffering } from "./utils/offeringGalleryUrls"
import type { DealStatusRules } from "./constants/deal-lifecycle"
import { getDealStatusRules } from "./constants/deal-lifecycle"
import {
  buildOfferingSidebarSummaryRows,
  firstCreatedInvestorClassName,
  hasMeaningfulInvestorSummaryHtml,
  formatOfferingPortfolioLocationLine,
  hasOfferingPortfolioLocationLine,
  keyHighlightRowsForOfferingPreview,
} from "./dealOfferingPreviewShared"
import { OfferingPreviewKeyHighlightsTable } from "./components/OfferingPreviewKeyHighlightsTable"
import {
  buildDealLocationQuery,
  OfferingOverviewLocationMap,
} from "./tabs/offering_details/OfferingOverviewLocationMap"
import { DealOfferingGalleryImage } from "./components/DealOfferingGalleryImage"
import { DealCardMediaCarousel } from "@/common/components/deal-card/DealCardMediaCarousel"
import { DealOfferingPreviewBentoLayout } from "./components/DealOfferingPreviewBentoLayout"
import { DealOfferingPreviewBentoAdaptiveGrid } from "./components/DealOfferingPreviewBentoAdaptiveGrid"
import { OfferingPreviewAssetBentoCard } from "./components/OfferingPreviewAssetBentoCard"
import { InvestNowDraftProgressBar } from "@/modules/Investing/pages/invest/InvestNowDraftProgressBar"
import type { InvestNowDraftProgress } from "@/modules/Investing/pages/invest/investNowDraftProgress"
import type { InvestNowStepperPhase } from "@/modules/Investing/pages/invest/investNowFlowSteps"
import "./tabs/deal_members/add-investment/add_deal_modal.css"
import "./deal-offering-portfolio.css"
import "./deal-offering-details.css"
import "./deals-list.css"
import "@/common/components/deal-card/deal-card.css"

function safeDownloadFilename(name: string): string {
  const base = name.trim() || "document"
  return base.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 200)
}

export type DealOfferingPreviewInnerProps = {
  detail: DealDetailApi
  classes: DealInvestorClass[]
  investorsPayload: DealInvestorsPayload
  /** When true, gallery / summary / documents / assets / etc. follow “Make it visible to Investors” (database). */
  applyInvestorLinkVisibility: boolean
  isPublicOfferingRoute: boolean
  /** Logged-in LP on the deal workspace (investing deal page). */
  isLpDealWorkspace?: boolean
  /** False on syndicated “Preview offering” — show only on shared link + investing deal view. */
  showInvestNowCta: boolean
  /**
   * When set (authenticated preview only), “Invest now” opens this handler instead of
   * in-page anchor navigation — e.g. navigate to `/deals/:dealId/invest` (wizard step 1).
   */
  onInvestNow?: () => void
  /** Saved Invest Now wizard progress for the signed-in LP (investing deal workspace). */
  investNowDraftProgress?: InvestNowDraftProgress | null
  /** Navigate to a specific Invest Now onboarding phase (resume mode). */
  onInvestNowPhaseClick?: (phaseId: InvestNowStepperPhase["id"]) => void
  /** Public shared link: sign-in redirect returns to the authenticated offering portfolio. */
  publicOfferingSignInState?: { from: string }
  onPersistSharedOfferingAuthIntent?: (dealId: string) => void
  /** When omitted, derived from `detail.offeringStatus`. */
  offeringStatusRules?: DealStatusRules
  /**
   * When true, gallery URLs are API-only (matches anonymous shared links).
   * When false, the same sources as Offering details → Gallery are used (local asset previews in this browser).
   */
  galleryUsesPersistedSourcesOnly?: boolean
  /** Encrypted `?preview=` token for anonymous `/uploads/` gallery access. */
  publicPreviewUploadToken?: string | null
  /** When false, the bento Documents block is omitted (e.g. sectioned list shown elsewhere). */
  showDocumentsSection?: boolean
  /** Replaces the default bento Documents block (e.g. LP investing sectioned list). */
  documentsSection?: ReactNode
  /** Parent page renders Portfolio Overview–style hero (deal name + eyebrow). */
  suppressTitlebar?: boolean
}

export function DealOfferingPreviewInner({
  detail,
  classes,
  investorsPayload,
  applyInvestorLinkVisibility,
  isPublicOfferingRoute,
  isLpDealWorkspace = false,
  showInvestNowCta,
  onInvestNow,
  investNowDraftProgress = null,
  onInvestNowPhaseClick,
  publicOfferingSignInState,
  onPersistSharedOfferingAuthIntent,
  galleryUsesPersistedSourcesOnly = false,
  publicPreviewUploadToken = null,
  offeringStatusRules: offeringStatusRulesProp,
  showDocumentsSection = true,
  documentsSection,
  suppressTitlebar = false,
}: DealOfferingPreviewInnerProps) {
  const statusRules = useMemo(
    () =>
      offeringStatusRulesProp ??
      getDealStatusRules(detail.offeringStatus),
    [offeringStatusRulesProp, detail.offeringStatus],
  )
  const galleryDialogTitleId = useId()
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  useEffect(() => {
    setGalleryOpen(false)
  }, [detail.id])

  /* `overflow-x: hidden` on html/body and scroll parents breaks sidebar `position: sticky` */
  useEffect(() => {
    const html = document.documentElement
    const appMain = document.querySelector(".app_main_section")
    const appContent = document.querySelector(".app_main_content")
    html.classList.add("deal_offer_pf_sticky_scroll")
    appMain?.classList.add("deal_offer_pf_sticky_scroll")
    appContent?.classList.add("deal_offer_pf_sticky_scroll")
    return () => {
      html.classList.remove("deal_offer_pf_sticky_scroll")
      appMain?.classList.remove("deal_offer_pf_sticky_scroll")
      appContent?.classList.remove("deal_offer_pf_sticky_scroll")
    }
  }, [])

  const title =
    detail.dealName?.trim() ||
    detail.propertyName?.trim() ||
    "Offering"

  /** Offering details → Summary (rich text saved as `investor_summary_html`). */
  const summaryHtml = detail.investorSummaryHtml?.trim() ?? ""
  const hasSummaryContent = hasMeaningfulInvestorSummaryHtml(summaryHtml)

  const [investorVisibilityRevision, setInvestorVisibilityRevision] =
    useState(0)
  const [workspaceDocumentsRevision, setWorkspaceDocumentsRevision] =
    useState(0)

  useEffect(() => {
    const dealId = detail.id?.trim()
    if (!dealId) return
    const bump = () => setWorkspaceDocumentsRevision((n) => n + 1)
    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<{ dealId?: string }>).detail
      if (d?.dealId === dealId) bump()
    }
    window.addEventListener(
      OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT,
      onCustom,
    )
    return () => {
      window.removeEventListener(
        OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT,
        onCustom,
      )
    }
  }, [detail.id])

  useEffect(() => {
    if (!applyInvestorLinkVisibility) return
    const dealId = detail.id?.trim()
    if (!dealId) return
    const bump = () => setInvestorVisibilityRevision((n) => n + 1)
    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<{ dealId?: string }>).detail
      if (d?.dealId === dealId) bump()
    }
    window.addEventListener(
      OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT,
      onCustom,
    )
    return () => {
      window.removeEventListener(
        OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT,
        onCustom,
      )
    }
  }, [applyInvestorLinkVisibility, detail.id])

  const openGalleryAt = useCallback((index: number) => {
    setGalleryIndex(index)
    setGalleryOpen(true)
  }, [])

  const closeGallery = useCallback(() => {
    setGalleryOpen(false)
  }, [])

  const galleryUrlsAll = useMemo(
    () =>
      orderedGalleryUrlsForOffering(detail, {
        persistedOnly: galleryUsesPersistedSourcesOnly,
        previewToken: isPublicOfferingRoute ? publicPreviewUploadToken : null,
      }),
    [
      detail,
      galleryUsesPersistedSourcesOnly,
      isPublicOfferingRoute,
      publicPreviewUploadToken,
    ],
  )
  const investorPreviewVisibility = useMemo(
    () =>
      readInvestorVisibilityForOfferingPreview(
        detail.id ?? "",
        detail.offeringInvestorPreviewJson,
        { preferServerOnly: isPublicOfferingRoute },
      ),
    [
      detail.id,
      detail.offeringInvestorPreviewJson,
      isPublicOfferingRoute,
      investorVisibilityRevision,
    ],
  )
  const galleryUrls = useMemo(() => {
    if (!applyInvestorLinkVisibility) return galleryUrlsAll
    if (investorPreviewVisibility.gallery === false) return []
    return galleryUrlsAll
  }, [
    applyInvestorLinkVisibility,
    galleryUrlsAll,
    investorPreviewVisibility.gallery,
  ])
  const previewAssetBlocks = useMemo(
    () => buildOfferingPreviewAssetBlocks(detail),
    [detail],
  )
  const previewDocuments = useMemo(() => {
    const suppressForOfferingLink =
      applyInvestorLinkVisibility &&
      investorPreviewVisibility.documents === false &&
      !isLpDealWorkspace
    if (suppressForOfferingLink) {
      return []
    }
    return listWorkspaceDocumentsForOfferingPreview(detail.id ?? "", {
      isPublicAnonymousOffering: isPublicOfferingRoute,
      isLpDealWorkspace: Boolean(isLpDealWorkspace),
    })
  }, [
    detail.id,
    applyInvestorLinkVisibility,
    investorPreviewVisibility.documents,
    isPublicOfferingRoute,
    isLpDealWorkspace,
    workspaceDocumentsRevision,
  ])
  const publicGallerySuppressed =
    applyInvestorLinkVisibility &&
    investorPreviewVisibility.gallery === false &&
    galleryUrlsAll.length > 0
  const showInvestorPreviewAnnouncement =
    !applyInvestorLinkVisibility ||
    investorPreviewVisibility.make_announcement !== false
  const showInvestorPreviewOverviewKv =
    !applyInvestorLinkVisibility ||
    investorPreviewVisibility.overview !== false
  const galleryTouchXRef = useRef<number | null>(null)
  const galleryModalThumbsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!galleryOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [galleryOpen])

  useEffect(() => {
    if (!galleryOpen || galleryUrls.length < 2) return
    const len = galleryUrls.length
    const safe = Math.min(Math.max(0, galleryIndex), len - 1)
    const root = galleryModalThumbsRef.current
    if (!root) return
    const active = root.querySelector(
      `[data-gallery-thumb-index="${safe}"]`,
    )
    active?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    })
  }, [galleryOpen, galleryIndex, galleryUrls.length])

  useEffect(() => {
    if (!galleryOpen || galleryUrls.length === 0) return
    const len = galleryUrls.length
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        setGalleryOpen(false)
        return
      }
      if (len < 2) return
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        setGalleryIndex((i) => (i - 1 + len) % len)
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        setGalleryIndex((i) => (i + 1) % len)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [galleryOpen, galleryUrls.length])

  const goGalleryPrev = useCallback(() => {
    setGalleryIndex((i) => {
      const len = galleryUrls.length
      if (len < 2) return i
      return (i - 1 + len) % len
    })
  }, [galleryUrls.length])

  const goGalleryNext = useCallback(() => {
    setGalleryIndex((i) => {
      const len = galleryUrls.length
      if (len < 2) return i
      return (i + 1) % len
    })
  }, [galleryUrls.length])

  const onGalleryCarouselTouchStart = useCallback((e: TouchEvent) => {
    galleryTouchXRef.current = e.touches[0]?.clientX ?? null
  }, [])

  const onGalleryCarouselTouchEnd = useCallback(
    (e: TouchEvent) => {
      const start = galleryTouchXRef.current
      galleryTouchXRef.current = null
      const len = galleryUrls.length
      if (start == null || len < 2) return
      const end = e.changedTouches[0]?.clientX
      if (end === undefined) return
      const dx = end - start
      if (Math.abs(dx) < 56) return
      if (dx > 0) {
        setGalleryIndex((i) => (i - 1 + len) % len)
      } else {
        setGalleryIndex((i) => (i + 1) % len)
      }
    },
    [galleryUrls.length],
  )

  const dealLocationLine = formatOfferingPortfolioLocationLine(detail)
  const dealMapQuery = useMemo(() => buildDealLocationQuery(detail), [detail])

  const sidebarSummaryRows = useMemo(() => {
    if (
      applyInvestorLinkVisibility &&
      investorPreviewVisibility.overview === false
    ) {
      return []
    }
    return buildOfferingSidebarSummaryRows(detail, classes, investorsPayload)
  }, [
    applyInvestorLinkVisibility,
    investorPreviewVisibility.overview,
    detail,
    classes,
    investorsPayload,
  ])
  const keyHighlightPreviewRows = useMemo(
    () =>
      keyHighlightRowsForOfferingPreview(detail.keyHighlightsJson, {
        includeEmptyClassValues: !applyInvestorLinkVisibility,
      }),
    [detail.keyHighlightsJson, applyInvestorLinkVisibility],
  )
  const keyHighlightsClassColumnHeader = useMemo(
    () => firstCreatedInvestorClassName(classes),
    [classes],
  )
  const summarySection = useMemo(() => {
    const summaryVisible =
      !applyInvestorLinkVisibility ||
      investorPreviewVisibility.summary !== false
    if (!summaryVisible) return null
    if (!hasSummaryContent && applyInvestorLinkVisibility) return null
    return (
      <section
        className="deal_offer_pf_wireframe_block deal_offer_pf_panel deal_offer_pf_summary_section"
        aria-labelledby="deal-pf-summary"
      >
        <h2 id="deal-pf-summary" className="deal_offer_pf_section_heading">
          Summary
        </h2>
        {hasSummaryContent ? (
          <div
            className="deal_offer_pf_summary_prose deal_offer_pf_summary_prose--compact"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(summaryHtml),
            }}
          />
        ) : (
          <p className="deal_offer_pf_muted deal_offer_pf_muted--compact">
            Add a summary in Offering details → Summary.
          </p>
        )}
      </section>
    )
  }, [
    applyInvestorLinkVisibility,
    investorPreviewVisibility.summary,
    hasSummaryContent,
    summaryHtml,
  ])

  const keyHighlightsSection = useMemo(() => {
    const highlightsVisible =
      !applyInvestorLinkVisibility ||
      investorPreviewVisibility.key_highlights !== false
    if (!highlightsVisible) return null
    const hasRows = keyHighlightPreviewRows.length > 0
    if (!hasRows && applyInvestorLinkVisibility) return null
    return (
      <section
        className="deal_offer_pf_wireframe_block deal_offer_pf_panel deal_offer_pf_key_highlights_section"
        aria-labelledby="deal-pf-key-highlights"
      >
        <h2
          id="deal-pf-key-highlights"
          className="deal_offer_pf_section_heading"
        >
          Key highlights
        </h2>
        {hasRows ? (
          <OfferingPreviewKeyHighlightsTable
            rows={keyHighlightPreviewRows}
            classColumnHeader={keyHighlightsClassColumnHeader}
          />
        ) : (
          <p className="deal_offer_pf_muted deal_offer_pf_muted--compact">
            Add key highlights in Offering details → Key Highlights.
          </p>
        )}
      </section>
    )
  }, [
    applyInvestorLinkVisibility,
    investorPreviewVisibility.key_highlights,
    keyHighlightPreviewRows,
    keyHighlightsClassColumnHeader,
  ])

  const locationSection = useMemo(() => {
    if (!showInvestorPreviewOverviewKv) return null
    const hasCityState = hasOfferingPortfolioLocationLine(dealLocationLine)
    const hasMap = Boolean(dealMapQuery.trim())
    if (!hasCityState && !hasMap) return null
    return (
      <section
        className="deal_offer_pf_wireframe_block deal_offer_pf_panel deal_offer_pf_location_section"
        aria-labelledby="deal-pf-location"
      >
        <h2 id="deal-pf-location" className="deal_offer_pf_section_heading">
          Location
        </h2>
        {hasCityState ? (
          <p className="deal_offer_pf_location_city_state">{dealLocationLine}</p>
        ) : null}
        <OfferingOverviewLocationMap detail={detail} compact />
      </section>
    )
  }, [showInvestorPreviewOverviewKv, dealLocationLine, dealMapQuery, detail])
  const announcementTitle = detail.dealAnnouncementTitle?.trim() ?? ""
  const announcementMessage = detail.dealAnnouncementMessage?.trim() ?? ""
  const galleryLen = galleryUrls.length
  const gallerySafeIndex = galleryLen
    ? Math.min(galleryIndex, galleryLen - 1)
    : 0

  return (
    <>
        <div className="deal_offer_pf_card" id="deal-offer-pf-card">
          {suppressTitlebar ? null : (
            <div
              className={[
                "deal_offer_pf_titlebar",
                investNowDraftProgress && onInvestNowPhaseClick
                  ? " deal_offer_pf_titlebar--with_onboarding"
                  : "",
              ]
                .join("")
                .trim()}
            >
              <div className="deal_offer_pf_titlebar_main">
                <h1 className="deal_offer_pf_page_title">{title}</h1>
                {hasOfferingPortfolioLocationLine(dealLocationLine) ? (
                  <p className="deal_offer_pf_property_line">{dealLocationLine}</p>
                ) : null}
              </div>
              {investNowDraftProgress && onInvestNowPhaseClick ? (
                <div
                  className="deal_offer_pf_titlebar_onboarding"
                  aria-label="Onboarding progress"
                >
                  <div className="invest_now_onboarding_panel deal_offer_pf_onboarding_panel deal_offer_pf_onboarding_panel--compact">
                    <div className="invest_now_onboarding_panel_body">
                      <InvestNowDraftProgressBar
                        embedded
                        cardHead
                        progress={investNowDraftProgress}
                        phaseNav={{
                          onPhaseClick: onInvestNowPhaseClick,
                          currentStepOnly: true,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              {/* {detail.dealStage?.trim() ? (
                <span
                  className={`deal_offer_pf_stage_badge ${dealStageChipCompactClassName(detail.dealStage)}`}
                >
                  {dealStageLabel(detail.dealStage)}
                </span>
              ) : null} */}
            </div>
          )}

          {statusRules.showClosedBanner ? (
            <p
              className="um_toolbar_notice deal_offer_pf_status_banner"
              role="status"
            >
              This offering is closed. New investments are no longer accepted.
            </p>
          ) : null}

          {/*
          <nav
            className="deal_offer_pf_subnav"
            aria-label="Preview"
          >
            <span
              className="deal_offer_pf_subnav_link deal_offer_pf_subnav_link_active"
              aria-current="page"
            >
              Offering overview
            </span>
          </nav>
          */}

          <DealOfferingPreviewBentoLayout
            summaryRows={sidebarSummaryRows}
            keyHighlights={keyHighlightsSection}
            summary={summarySection}
            location={locationSection}
            classesRow={null}
            gallery={
              <div className="deal_offer_pf_media_card deal_offer_pf_media_card--wireframe">
                {publicGallerySuppressed ? (
                      <div className="deal_offer_pf_hero deal_offer_pf_hero--clean">
                        <div className="deal_offer_pf_media_empty">
                          <p className="deal_offer_pf_media_empty_text">
                            Gallery not on this preview link
                          </p>
                          <p className="deal_offer_pf_media_empty_hint">
                            The sponsor chose not to include the photo gallery on
                            the shared investor preview.
                          </p>
                        </div>
                      </div>
                    ) : galleryUrls.length === 0 ? (
                      <div className="deal_offer_pf_hero deal_offer_pf_hero--clean">
                        <div className="deal_offer_pf_media_empty">
                          <p className="deal_offer_pf_media_empty_text">
                            No gallery images yet
                          </p>
                          <p className="deal_offer_pf_media_empty_hint">
                            {applyInvestorLinkVisibility
                              ? "The sponsor has not added photos to this offering yet."
                              : "Add photos in Offering details → Gallery"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="deal_offer_pf_carousel_hero">
                        <DealCardMediaCarousel
                          imageUrls={galleryUrls}
                          title={title}
                          onImageClick={openGalleryAt}
                        />
                      </div>
                    )}

                {galleryLen > 0 ? (
                      <>
                        <div
                          className="deal_offer_pf_media_toolbar"
                          role="toolbar"
                          aria-label="Gallery tools"
                        >
                          <button
                            type="button"
                            className="deal_offer_pf_media_tool deal_offer_pf_media_tool--active"
                            onClick={() => openGalleryAt(0)}
                            aria-label="Open photo gallery"
                          >
                            <Compass size={18} strokeWidth={2} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="deal_offer_pf_media_tool"
                            disabled
                            title="Map view is not available in preview"
                            aria-label="Map (not available)"
                          >
                            <Map size={18} strokeWidth={2} aria-hidden />
                          </button>
                        </div>
                        {/*
                        deal_offer_pf_gallery_manage_strip (hidden):
                        {applyInvestorLinkVisibility ? (
                          <p className="deal_offer_pf_gallery_manage_strip">
                            {galleryLen}{" "}
                            {galleryLen === 1 ? "photo" : "photos"} in this
                            gallery.
                            {galleryLen > 4
                              ? " Cover above; row shows the next 3 photos (+N if more). Tap any to browse all."
                              : galleryLen > 1
                                ? " Cover above; tap smaller previews or the cover to open the gallery."
                                : null}
                          </p>
                        ) : null}

                        Authenticated preview caption (was commented / not shown):
                        Gallery images are managed in Offering details → Gallery.
                        Cover above; tap smaller previews or the cover to open the gallery.
                        (Previously also used galleryLen branches for +3 photos / tap any, same as public.)
                        */}
                      </>
                    ) : null}
                </div>
            }
            sidebar={
              <>
                {statusRules.requireSponsorApproval ? (
                <div className="deal_offer_pf_side_invest_cta_wrap">
                  <p
                    className="deal_offer_pf_waitlist_notice"
                    role="status"
                  >
                    This offering is on a waitlist. New investors need sponsor
                    approval before investing.
                  </p>
                </div>
              ) : null}

              {showInvestNowCta ? (
                <div className="deal_offer_pf_side_invest_cta_wrap">
                  {isPublicOfferingRoute ? (
                    onInvestNow ? (
                      <button
                        type="button"
                        className="um_btn_primary deal_offer_pf_invest_cta deal_offer_pf_invest_cta_side_top"
                        onClick={onInvestNow}
                      >
                        <TrendingUp size={18} strokeWidth={2} aria-hidden />
                        <span>Invest now</span>
                      </button>
                    ) : (
                      <Link
                        to="/signin"
                        state={
                          publicOfferingSignInState ?? {
                            from: `${typeof window !== "undefined" ? window.location.pathname + window.location.search : "/offering_portfolio"}`,
                          }
                        }
                        onClick={() => {
                          const id = detail.id?.trim()
                          if (id) onPersistSharedOfferingAuthIntent?.(id)
                        }}
                        className="um_btn_primary deal_offer_pf_invest_cta deal_offer_pf_invest_cta_side_top"
                      >
                        <TrendingUp size={18} strokeWidth={2} aria-hidden />
                        <span>Invest now</span>
                      </Link>
                    )
                  ) : onInvestNow ? (
                    <button
                      type="button"
                      className="um_btn_primary deal_offer_pf_invest_cta deal_offer_pf_invest_cta_side_top"
                      onClick={onInvestNow}
                    >
                      <TrendingUp size={18} strokeWidth={2} aria-hidden />
                      <span>Invest now</span>
                    </button>
                  ) : (
                    <a
                      href={
                        applyInvestorLinkVisibility &&
                        investorPreviewVisibility.assets === false
                          ? "#deal-offer-pf-card"
                          : "#deal-pf-assets"
                      }
                      className="um_btn_primary deal_offer_pf_invest_cta deal_offer_pf_invest_cta_side_top"
                    >
                      <TrendingUp size={18} strokeWidth={2} aria-hidden />
                      <span>Invest now</span>
                    </a>
                  )}
                </div>
              ) : null}

              {showInvestorPreviewAnnouncement ? (
                <DealAnnouncementBanner
                  title={announcementTitle}
                  message={announcementMessage}
                  variant="preview"
                />
              ) : null}

              {/* {showInvestorPreviewFundingInstructions ? (
                <section
                  className="deal_offer_pf_panel"
                  aria-labelledby="deal-pf-funding-info"
                >
                  <PanelHeader titleId="deal-pf-funding-info">
                    Funding info
                  </PanelHeader>
                  <dl className="deal_offer_pf_kv_grid">
                    <div className="deal_offer_pf_kv">
                      <dt>Funds required before GP signs</dt>
                      <dd>{detail.fundsRequiredBeforeGpSign ? "Yes" : "No"}</dd>
                    </div>
                    <div className="deal_offer_pf_kv">
                      <dt>Auto-send funding instructions</dt>
                      <dd>{detail.autoSendFundingInstructions ? "Yes" : "No"}</dd>
                    </div>
                  </dl>
                </section>
              ) : null} */}
              </>
            }
            // classesRow={
            //   showInvestorPreviewOfferingInformation ? (
            //     <>
            //       <h2
            //         id="deal-pf-offering-info"
            //         className="deal_offer_pf_section_heading deal_offer_pf_bento_classes_heading"
            //       >
            //         Classes
            //       </h2>
            //       {classes.length > 0 ? (
            //         <DealOfferingPreviewBentoAdaptiveGrid
            //           className="deal_offer_pf_bento_class_grid"
            //           ariaLabel="Investor classes"
            //         >
            //           {classes.map((ic) => (
            //             <OfferingPreviewClassBentoCard
            //               key={ic.id}
            //               investorClass={ic}
            //             />
            //           ))}
            //         </DealOfferingPreviewBentoAdaptiveGrid>
            //       ) : (
            //         <p className="deal_offer_pf_muted deal_offer_pf_muted--compact">
            //           No classes are configured yet.
            //         </p>
            //       )}
            //     </>
            //   ) : null
            // }
            documents={
              documentsSection != null
                ? !applyInvestorLinkVisibility ||
                  investorPreviewVisibility.documents !== false ||
                  isLpDealWorkspace
                  ? documentsSection
                  : null
                : showDocumentsSection &&
                    (!applyInvestorLinkVisibility ||
                      investorPreviewVisibility.documents !== false ||
                      isLpDealWorkspace) ? (
                <section
                  className="deal_offer_pf_wireframe_block deal_offer_pf_documents_section deal_offer_pf_panel deal_offer_pf_bento_full"
                  aria-labelledby="deal-pf-documents"
                >
                    <h2
                      id="deal-pf-documents"
                      className="deal_offer_pf_section_heading"
                    >
                      Documents
                    </h2>
                    {previewDocuments.length === 0 ? (
                      <p className="deal_offer_pf_muted deal_offer_pf_muted--compact">
                        {applyInvestorLinkVisibility
                          ? "No documents are listed on this shared preview yet."
                          : "No documents yet. Add links or uploads under the deal Documents tab."}
                      </p>
                    ) : (
                      <ul className="deal_offer_pf_documents_list">
                        {previewDocuments.map((doc) => (
                          <li
                            key={doc.id}
                            className="deal_offer_pf_documents_item"
                          >
                            <FileText
                              size={18}
                              strokeWidth={2}
                              className="deal_offer_pf_documents_icon"
                              aria-hidden
                            />
                            <div className="deal_offer_pf_documents_item_body">
                              {doc.url ? (
                                <a
                                  href={doc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="deal_offer_pf_documents_name deal_offer_pf_documents_name_link"
                                  title={doc.name}
                                  aria-label={`View ${doc.name} (opens in a new tab)`}
                                >
                                  {doc.name}
                                </a>
                              ) : (
                                <span className="deal_offer_pf_documents_name">
                                  {doc.name}
                                </span>
                              )}
                              {doc.url ? (
                                <div
                                  className="deal_offer_pf_documents_actions"
                                  role="group"
                                  aria-label={`${doc.name} document actions`}
                                >
                                  <a
                                    href={doc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="deal_offer_pf_documents_action"
                                    aria-label={`View ${doc.name} (opens in a new tab)`}
                                  >
                                    <Eye
                                      size={16}
                                      strokeWidth={2}
                                      className="deal_offer_pf_documents_action_icon"
                                      aria-hidden
                                    />
                                    <span>View</span>
                                  </a>
                                  <a
                                    href={doc.url}
                                    download={safeDownloadFilename(doc.name)}
                                    rel="noopener noreferrer"
                                    className="deal_offer_pf_documents_action"
                                    aria-label={`Download ${doc.name}`}
                                  >
                                    <Download
                                      size={16}
                                      strokeWidth={2}
                                      className="deal_offer_pf_documents_action_icon"
                                      aria-hidden
                                    />
                                    <span>Download</span>
                                  </a>
                                </div>
                              ) : (
                                <span className="deal_offer_pf_documents_file_note">
                                  Preview shows the file name only.
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
              ) : null}
            assets={
              !applyInvestorLinkVisibility ||
              investorPreviewVisibility.assets !== false ? (
                <section
                  className="deal_offer_pf_wireframe_block deal_offer_pf_assets_section deal_offer_pf_panel deal_offer_pf_section_invest_anchor"
                  aria-labelledby="deal-pf-assets"
                >
                    <h2 id="deal-pf-assets" className="deal_offer_pf_section_heading">
                      Assets
                    </h2>
                    <DealOfferingPreviewBentoAdaptiveGrid
                      className="deal_offer_pf_bento_asset_grid"
                      ariaLabel="Deal assets"
                    >
                      {previewAssetBlocks.map((block) => (
                        <OfferingPreviewAssetBentoCard
                          key={block.id}
                          block={block}
                        />
                      ))}
                    </DealOfferingPreviewBentoAdaptiveGrid>
                </section>
              ) : null}
          />
        </div>

        {galleryOpen && galleryLen > 0
          ? createPortal(
              <div
                className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
                role="presentation"
              >
                <div
                  className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_offer_pf_gallery_modal_panel"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={galleryDialogTitleId}
                >
                  <div className="um_modal_head add_contact_modal_head">
                    <div className="deal_offer_pf_gallery_modal_head_text">
                      <h2
                        id={galleryDialogTitleId}
                        className="um_modal_title add_contact_modal_title"
                      >
                        Photo gallery
                      </h2>
                      {galleryLen > 1 ? (
                        <p className="deal_offer_pf_gallery_modal_sub">
                          {galleryLen} photos — use arrows, swipe, or thumbnails
                          to browse
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="um_modal_close"
                      onClick={closeGallery}
                      aria-label="Close gallery"
                    >
                      <X size={20} strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                  <div className="deal_offer_pf_gallery_carousel">
                    <div
                      className="deal_offer_pf_gallery_slide_wrap"
                      onTouchStart={onGalleryCarouselTouchStart}
                      onTouchEnd={onGalleryCarouselTouchEnd}
                    >
                      {galleryLen > 1 ? (
                        <>
                          <button
                            type="button"
                            className="deal_offer_pf_gallery_edge_nav deal_offer_pf_gallery_edge_nav_prev"
                            onClick={goGalleryPrev}
                            aria-label="Previous image"
                          >
                            <ChevronLeft size={28} strokeWidth={2} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="deal_offer_pf_gallery_edge_nav deal_offer_pf_gallery_edge_nav_next"
                            onClick={goGalleryNext}
                            aria-label="Next image"
                          >
                            <ChevronRight
                              size={28}
                              strokeWidth={2}
                              aria-hidden
                            />
                          </button>
                        </>
                      ) : null}
                      <DealOfferingGalleryImage
                        src={galleryUrls[gallerySafeIndex]}
                        alt=""
                        className="deal_offer_pf_gallery_slide_img"
                        loading="eager"
                      />
                      <p
                        className="deal_offer_pf_gallery_counter"
                        aria-live="polite"
                      >
                        {gallerySafeIndex + 1} / {galleryLen}
                      </p>
                    </div>
                  </div>
                  {galleryLen > 1 ? (
                    <div
                      ref={galleryModalThumbsRef}
                      className="deal_offer_pf_gallery_modal_thumbs"
                      role="tablist"
                      aria-label="All gallery images"
                    >
                      {galleryUrls.map((src, i) => (
                        <button
                          key={`pf-gal-modal-t-${i}-${src.slice(0, 36)}`}
                          type="button"
                          role="tab"
                          data-gallery-thumb-index={i}
                          aria-selected={i === gallerySafeIndex}
                          aria-label={`Show image ${i + 1} of ${galleryLen}`}
                          className={`deal_offer_pf_gallery_modal_thumb_btn${i === gallerySafeIndex ? " deal_offer_pf_gallery_modal_thumb_btn_active" : ""}`}
                          onClick={() => setGalleryIndex(i)}
                        >
                          <DealOfferingGalleryImage
                            src={src}
                            alt=""
                            className="deal_offer_pf_gallery_modal_thumb_img"
                            loading="eager"
                          />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="um_modal_actions deal_offer_pf_gallery_modal_footer">
                    <button
                      type="button"
                      className="um_btn_primary"
                      onClick={closeGallery}
                    >
                      <X size={16} strokeWidth={2} aria-hidden />
                      Close
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
    </>
  )
}

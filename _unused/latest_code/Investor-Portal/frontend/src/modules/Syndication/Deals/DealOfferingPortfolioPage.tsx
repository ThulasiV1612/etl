import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  LogIn,
  Send,
  Share2,
  X,
} from "lucide-react"
import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import { AUTH_RETURN_NEXT_KEY, SESSION_BEARER_KEY } from "../../../common/auth/sessionKeys"
import { FormHeadingWithInfo } from "../../../common/components/form-heading/FormHeadingWithInfo"
import { FormTooltip } from "../../../common/components/form-tooltip/FormTooltip"
import { usePortalMode } from "@/modules/Investing/context/PortalModeContext"
import { setAppDocumentTitle } from "../../../common/utils/appDocumentTitle"
import {
  buildLegacyPublicOfferingPreviewPageUrl,
  buildPublicOfferingPreviewPageUrl,
  fetchDealById,
  fetchDealInvestorClasses,
  fetchDealInvestors,
  fetchOfferingPreviewToken,
  fetchPublicOfferingPreview,
  postOfferingPreviewShareByEmail,
  type DealDetailApi,
} from "./api/dealsApi"
import {
  dealIdFromOfferingPortfolioPathname,
  dealInvestNowPath,
  dealWorkspacePath,
  EMPTY_INVESTORS_PAYLOAD,
  formatOfferingPortfolioLocationLine,
  hasOfferingPortfolioLocationLine,
  isDealUuidForOfferingPreview,
} from "./dealOfferingPreviewShared"
import { DealOfferingPreviewInner } from "./DealOfferingPreviewInner"
import {
  canInvestorAccessPublicOffering,
  effectiveOfferingStatusForAccess,
  getDealStatusRules,
} from "./constants/deal-lifecycle"
import { dealStageLabel } from "../dealsDashboardUtils"
import { isDealStageOfferingShareBlocked } from "./constants/deal-lifecycle/deal-stage"
import { writePendingRecentlyViewedDeal } from "@/modules/Investing/pages/dashboard/recentlyViewedDeals"
import {
  dealOfferingPortfolioPath,
  writeOfferingPortfolioAuthIntent,
} from "./utils/offeringPortfolioAuthIntent"
import {
  OfferingPreviewShareEmailRecipientsAddon,
  type OfferingShareEmailTag,
} from "./components/OfferingPreviewShareEmailRecipients.addon"
import { applyOfferingInvestorPreviewJsonFromServer } from "./utils/offeringPreviewServerState"
import {
  OFFERING_DETAILS_SECTION_ORDER,
  OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT,
  readInvestorVisibilityForOfferingPreview,
} from "./utils/offeringPreviewInvestorVisibility"
import {
  offeringPreviewRefFromSearchParams,
  readOfferingPreviewSponsorAttributionForDeal,
  writeOfferingPreviewSponsorAttribution,
} from "./utils/offeringPreviewSponsorRef"
import type { DealInvestorsPayload } from "./types/deal-investors.types"
import type { DealInvestorClass } from "./types/deal-investor-class.types"
import "./tabs/deal_members/add-investment/add_deal_modal.css"
import "../usermanagement/user_management.css"
import "../Dashboard/sponsor-dashboard.css"
import "./deal-offering-portfolio.css"
import "./deals-list.css"

function readSessionAuthenticated(): boolean {
  if (typeof sessionStorage === "undefined") return false
  return Boolean(sessionStorage.getItem(SESSION_BEARER_KEY)?.trim())
}

export function DealOfferingPortfolioPage() {
  const { mode, switchToInvesting } = usePortalMode()
  const { dealId: dealIdParam } = useParams<{ dealId: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const dealIdFromRoute = useMemo(() => {
    const fromParams = dealIdParam?.trim()
    if (fromParams) return fromParams
    return dealIdFromOfferingPortfolioPathname(location.pathname)
  }, [dealIdParam, location.pathname])

  const isPublicOfferingRoute = /\/offering_portfolio\/?$/.test(
    location.pathname,
  )

  /** Public route: encrypted token (or legacy UUID) from `?preview=`. */
  const previewQueryValue = useMemo(() => {
    if (!isPublicOfferingRoute) return undefined
    const raw = searchParams.get("preview")
    if (!raw?.trim()) return undefined
    try {
      return decodeURIComponent(raw.trim())
    } catch {
      return raw.trim()
    }
  }, [isPublicOfferingRoute, searchParams])

  /** Public route: encrypted sponsor ref from `?ref=` (unique per sharing sponsor). */
  const sponsorRefQueryValue = useMemo(() => {
    if (!isPublicOfferingRoute) return undefined
    return offeringPreviewRefFromSearchParams(searchParams)
  }, [isPublicOfferingRoute, searchParams])

  /** UUID from `/deals/:id/offering-portfolio` or preview param after server resolution (same string used for API). */
  const effectiveDealId = useMemo(() => {
    if (isPublicOfferingRoute) return previewQueryValue
    return dealIdFromRoute?.trim() || undefined
  }, [isPublicOfferingRoute, previewQueryValue, dealIdFromRoute])

  const portfolioBackTo = useMemo(() => {
    const returnTo = (
      location.state as { returnTo?: string } | null
    )?.returnTo?.trim()
    if (returnTo) return returnTo
    if (mode === "investing") return "/dashboard?dealsTab=coming_soon"
    const id = effectiveDealId?.trim()
    return id ? dealWorkspacePath(id) : "/deals"
  }, [effectiveDealId, location.state, mode])

  const [detail, setDetail] = useState<DealDetailApi | null>(null)
  const [classes, setClasses] = useState<DealInvestorClass[]>([])
  const [investorsPayload, setInvestorsPayload] =
    useState<DealInvestorsPayload>(EMPTY_INVESTORS_PAYLOAD)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [lpShareToken, setLpShareToken] = useState<string | null>(null)
  const [lpShareSponsorRef, setLpShareSponsorRef] = useState<string | null>(null)
  const [lpShareTokenError, setLpShareTokenError] = useState(false)

  useEffect(() => {
    if (isPublicOfferingRoute || !dealIdFromRoute?.trim()) {
      setLpShareToken(null)
      setLpShareSponsorRef(null)
      setLpShareTokenError(false)
      return
    }
    if (detail?.archived) {
      setLpShareToken(null)
      setLpShareSponsorRef(null)
      setLpShareTokenError(false)
      return
    }
    let cancelled = false
    setLpShareToken(null)
    setLpShareSponsorRef(null)
    setLpShareTokenError(false)
    void (async () => {
      try {
        const { token, sponsorRef } = await fetchOfferingPreviewToken(
          dealIdFromRoute.trim(),
        )
        if (!cancelled) {
          setLpShareToken(token)
          setLpShareSponsorRef(sponsorRef ?? null)
        }
      } catch {
        if (!cancelled) setLpShareTokenError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dealIdFromRoute, isPublicOfferingRoute, detail?.archived])

  const shareLinkLoading =
    !isPublicOfferingRoute &&
    Boolean(dealIdFromRoute?.trim()) &&
    lpShareToken === null &&
    !lpShareTokenError

  const previewShareUrl = useMemo(() => {
    if (typeof window === "undefined" || isPublicOfferingRoute) {
      return ""
    }
    if (lpShareToken?.trim()) {
      return buildPublicOfferingPreviewPageUrl(lpShareToken.trim(), {
        sponsorRef: lpShareSponsorRef,
      })
    }
    if (
      lpShareTokenError &&
      dealIdFromRoute &&
      isDealUuidForOfferingPreview(dealIdFromRoute)
    ) {
      return buildLegacyPublicOfferingPreviewPageUrl(dealIdFromRoute)
    }
    return ""
  }, [
    lpShareToken,
    lpShareSponsorRef,
    lpShareTokenError,
    dealIdFromRoute,
    isPublicOfferingRoute,
  ])

  const previewShareUrlDisplayText = useMemo(() => {
    const name =
      detail?.dealName?.trim() ||
      detail?.propertyName?.trim() ||
      "Deal"
    return `${name} Offering`
  }, [detail?.dealName, detail?.propertyName])

  const [copyLinkState, setCopyLinkState] = useState<"idle" | "copied" | "error">(
    "idle",
  )

  const [investorVisibilitySync, setInvestorVisibilitySync] = useState(0)

  const isSessionAuthenticated = readSessionAuthenticated()

  const publicOfferingSignInState = useMemo(() => {
    if (!isPublicOfferingRoute || isSessionAuthenticated) return undefined
    const from =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/offering_portfolio"
    return { from }
  }, [isPublicOfferingRoute, isSessionAuthenticated])

  const isInvestorFacingView =
    isPublicOfferingRoute || mode === "investing"

  const offeringStatusRules = useMemo(() => {
    const effective = effectiveOfferingStatusForAccess(
      detail?.dealStage,
      detail?.offeringStatus,
    )
    return getDealStatusRules(effective ?? detail?.offeringStatus)
  }, [detail?.dealStage, detail?.offeringStatus])

  const investorOfferingBlocked =
    isInvestorFacingView &&
    Boolean(detail) &&
    !canInvestorAccessPublicOffering(
      detail?.dealStage,
      detail?.offeringStatus,
    )

  const showInvestNowCta =
    isInvestorFacingView &&
    offeringStatusRules.showInvestNowButton &&
    (isPublicOfferingRoute || mode === "investing")

  const canOpenInvestNowInWorkspace =
    isSessionAuthenticated && showInvestNowCta

  const openInvestNowInWorkspace = useCallback(() => {
    const id = detail?.id?.trim()
    if (!id) return
    switchToInvesting()
    const returnTo = isPublicOfferingRoute
      ? dealOfferingPortfolioPath(id)
      : portfolioBackTo
    navigate(dealInvestNowPath(id), {
      state: {
        mode: "fresh",
        returnTo,
        referringSponsorRef: sponsorRefQueryValue ?? lpShareSponsorRef ?? undefined,
        referringSponsorDisplayName: readOfferingPreviewSponsorAttributionForDeal(id)
          ?.sponsorDisplayName,
      },
    })
  }, [
    detail?.id,
    isPublicOfferingRoute,
    navigate,
    portfolioBackTo,
    sponsorRefQueryValue,
    lpShareSponsorRef,
    switchToInvesting,
  ])

  function persistSharedOfferingAuthIntent(dealId: string) {
    const id = dealId.trim()
    if (!id) return
    writeOfferingPortfolioAuthIntent(id)
    if (sponsorRefQueryValue) {
      writeOfferingPreviewSponsorAttribution({
        dealId: id,
        sponsorRef: sponsorRefQueryValue,
      })
    }
    writePendingRecentlyViewedDeal(id)
    const returnPath = dealOfferingPortfolioPath(id)
    try {
      sessionStorage.setItem(AUTH_RETURN_NEXT_KEY, returnPath)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const id = detail?.id?.trim()
    if (!id || isSessionAuthenticated || !isPublicOfferingRoute) return
    writePendingRecentlyViewedDeal(id)
  }, [detail?.id, isPublicOfferingRoute, isSessionAuthenticated])

  useEffect(() => {
    if (isInvestorFacingView && isSessionAuthenticated) switchToInvesting()
  }, [isInvestorFacingView, isSessionAuthenticated, switchToInvesting])

  useEffect(() => {
    if (!detail?.id || isPublicOfferingRoute) return
    const bump = () => setInvestorVisibilitySync((n) => n + 1)
    const onVisibility = (e: Event) => {
      const d = (e as CustomEvent<{ dealId?: string }>).detail
      if (d?.dealId === detail.id) bump()
    }
    window.addEventListener(
      OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT,
      onVisibility,
    )
    return () => {
      window.removeEventListener(
        OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT,
        onVisibility,
      )
    }
  }, [detail?.id, isPublicOfferingRoute])

  const hasAnyInvestorVisibleSection = useMemo(() => {
    if (!detail?.id || isPublicOfferingRoute) return true
    const v = readInvestorVisibilityForOfferingPreview(
      detail.id,
      detail.offeringInvestorPreviewJson,
    )
    return OFFERING_DETAILS_SECTION_ORDER.some(({ id }) => v[id] !== false)
  }, [
    detail?.id,
    detail?.offeringInvestorPreviewJson,
    isPublicOfferingRoute,
    investorVisibilitySync,
  ])

  const isDealShareBlocked = isDealStageOfferingShareBlocked(detail?.dealStage)
  const dealShareBlockedStageLabel = dealStageLabel(detail?.dealStage)
  const isDealArchived = Boolean(detail?.archived)

  const sharePreviewActionsDisabled =
    isDealShareBlocked ||
    !previewShareUrl ||
    shareLinkLoading ||
    (!isPublicOfferingRoute && !hasAnyInvestorVisibleSection)

  const copyPreviewLink = useCallback(() => {
    if (!previewShareUrl || sharePreviewActionsDisabled) return
    void (async () => {
      try {
        await navigator.clipboard.writeText(previewShareUrl)
        setCopyLinkState("copied")
        window.setTimeout(() => setCopyLinkState("idle"), 2000)
      } catch {
        setCopyLinkState("error")
        window.setTimeout(() => setCopyLinkState("idle"), 2800)
      }
    })()
  }, [previewShareUrl, sharePreviewActionsDisabled])

  const shareModalTitleId = useId()
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareEmailTags, setShareEmailTags] = useState<OfferingShareEmailTag[]>(
    [],
  )
  const [shareSubmitting, setShareSubmitting] = useState(false)
  const [shareResultMessage, setShareResultMessage] = useState<string | null>(
    null,
  )
  const [shareResultFailures, setShareResultFailures] = useState<
    { email: string; message: string }[]
  >([])

  const openShareModal = useCallback(() => {
    if (sharePreviewActionsDisabled) return
    setShareResultMessage(null)
    setShareResultFailures([])
    setShareModalOpen(true)
  }, [sharePreviewActionsDisabled])

  const closeShareModal = useCallback(() => {
    if (shareSubmitting) return
    setShareModalOpen(false)
    setShareResultMessage(null)
    setShareResultFailures([])
  }, [shareSubmitting])

  const submitShareByEmail = useCallback(() => {
    const dealId = dealIdFromRoute?.trim()
    if (!dealId || sharePreviewActionsDisabled) return
    const emails = shareEmailTags.map((t) => t.email)
    if (emails.length === 0) {
      setShareResultMessage(
        "Choose contacts or members, or add at least one email address.",
      )
      return
    }
    setShareSubmitting(true)
    setShareResultMessage(null)
    setShareResultFailures([])
    void (async () => {
      try {
        const r = await postOfferingPreviewShareByEmail(dealId, emails)
        setShareResultFailures(r.failures)
        setShareResultMessage(
          r.message ??
            (r.sent > 0 ? `Sent ${r.sent} email(s).` : "No emails were sent."),
        )
        if (r.sent > 0 && r.failures.length === 0) {
          setShareEmailTags([])
          window.setTimeout(() => {
            setShareModalOpen(false)
            setShareResultMessage(null)
          }, 1600)
        }
      } catch (e) {
        setShareResultMessage(
          e instanceof Error ? e.message : "Could not send emails.",
        )
      } finally {
        setShareSubmitting(false)
      }
    })()
  }, [dealIdFromRoute, shareEmailTags, sharePreviewActionsDisabled])

  useEffect(() => {
    if (!effectiveDealId) {
      setLoading(false)
      setNotFound(true)
      return
    }
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    void (async () => {
      try {
        if (isPublicOfferingRoute) {
          const pack = await fetchPublicOfferingPreview(effectiveDealId, {
            sponsorRef: sponsorRefQueryValue,
          })
          if (cancelled) return
          if (pack.deal.id && sponsorRefQueryValue) {
            writeOfferingPreviewSponsorAttribution({
              dealId: pack.deal.id,
              sponsorRef: sponsorRefQueryValue,
              sponsorDisplayName: pack.referringSponsorDisplayName,
            })
          } else if (pack.referringSponsorRef && pack.deal.id) {
            writeOfferingPreviewSponsorAttribution({
              dealId: pack.deal.id,
              sponsorRef: pack.referringSponsorRef,
              sponsorDisplayName: pack.referringSponsorDisplayName,
            })
          }
          applyOfferingInvestorPreviewJsonFromServer(
            pack.deal.id,
            pack.deal.offeringInvestorPreviewJson,
          )
          setDetail(pack.deal)
          setClasses(pack.investorClasses)
          setInvestorsPayload(pack.investorsPayload)
        } else {
          const d = await fetchDealById(effectiveDealId)
          const [icResult, invResult] = await Promise.allSettled([
            fetchDealInvestorClasses(effectiveDealId),
            fetchDealInvestors(effectiveDealId),
          ])
          if (cancelled) return
          applyOfferingInvestorPreviewJsonFromServer(
            d.id,
            d.offeringInvestorPreviewJson,
          )
          setDetail(d)
          setClasses(icResult.status === "fulfilled" ? icResult.value : [])
          setInvestorsPayload(
            invResult.status === "fulfilled"
              ? invResult.value
              : EMPTY_INVESTORS_PAYLOAD,
          )
        }
      } catch {
        if (!cancelled) {
          setDetail(null)
          setClasses([])
          setInvestorsPayload(EMPTY_INVESTORS_PAYLOAD)
          setNotFound(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [effectiveDealId, isPublicOfferingRoute, sponsorRefQueryValue])

  const title =
    detail?.dealName?.trim() ||
    detail?.propertyName?.trim() ||
    "Offering"

  useEffect(() => {
    if (loading) {
      setAppDocumentTitle("Investor Portal Offering", true)
      return
    }
    if (notFound || !detail) {
      setAppDocumentTitle("Investor Portal Offering not found", true)
      return
    }
    setAppDocumentTitle(`Investor Portal ${title} Offering`, true)
  }, [loading, notFound, detail, title])

  if (!effectiveDealId) {
    return (
      <div className="deals_list_page deals_detail_page">
        <p className="deals_list_not_found">
          {isPublicOfferingRoute
            ? "Missing or invalid preview link. Ask your sponsor for a valid offering link."
            : "Missing deal."}
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="deals_list_page deals_detail_page">
        <div className="deal_offer_pf deal_offer_pf_state" role="status">
          <Loader2
            className="deal_offer_pf_spinner"
            size={36}
            strokeWidth={2}
            aria-hidden
          />
          <p className="deal_offer_pf_state_text">Loading offering preview…</p>
        </div>
      </div>
    )
  }

  if (investorOfferingBlocked) {
    return (
      <div className="deals_list_page deals_detail_page">
        <p className="deals_list_not_found" role="status">
          This offering is not available.{" "}
          <Link to="/dashboard" className="deal_offer_pf_back">
            <ArrowLeft size={18} strokeWidth={2} aria-hidden />
            Back to dashboard
          </Link>
        </p>
      </div>
    )
  }

  if (notFound || !detail) {
    return (
      <div className="deals_list_page deals_detail_page">
        <p className="deals_list_not_found">
          This offering could not be loaded.{" "}
          <Link to="/deals" className="deal_offer_pf_back">
            <ArrowLeft size={18} strokeWidth={2} aria-hidden />
            Back to deals
          </Link>
        </p>
      </div>
    )
  }

  const offeringHeroTitle =
    detail.dealName?.trim() ||
    detail.propertyName?.trim() ||
    "Offering"
  const offeringHeroLocation = formatOfferingPortfolioLocationLine(detail)

  return (
    <div
      className={`deals_list_page deals_detail_page deal_offer_pf_page${isPublicOfferingRoute ? " deal_offer_pf_page--public" : ""}`}
    >
      <div className="deal_offer_pf">
        {!isPublicOfferingRoute ? (
          <div className="deal_offer_pf_back_row">
            <Link to={portfolioBackTo} className="deal_offer_pf_back">
              <ArrowLeft size={18} strokeWidth={2} aria-hidden />
              {mode === "investing" ? "Back to opportunities" : "Back to deal"}
            </Link>
          </div>
        ) : null}

        <header className="deal_offer_pf_page_hero sponsor_dash_hero">
          <div className="sponsor_dash_hero_copy">
            <p className="sponsor_dash_hero_eyebrow">
              {isPublicOfferingRoute ? "Shared offering" : "Investment offering"}
            </p>
            <h1 className="sponsor_dash_hero_title">{offeringHeroTitle}</h1>
            {hasOfferingPortfolioLocationLine(offeringHeroLocation) ? (
              <p className="deal_offer_pf_hero_location">{offeringHeroLocation}</p>
            ) : null}
            {isPublicOfferingRoute ? (
              <p className="deal_offer_pf_header_hint deal_offer_pf_hero_hint">
                <Eye size={15} strokeWidth={2} aria-hidden />
                No login required for this page
              </p>
            ) : null}
          </div>
          {isPublicOfferingRoute ? (
            <div className="sponsor_dash_hero_actions">
              {isSessionAuthenticated && detail?.id ? (
                <Link
                  to={dealWorkspacePath(detail.id)}
                  className="um_btn_primary sponsor_dash_add_link deal_offer_pf_hero_action_link"
                >
                  <ExternalLink size={16} strokeWidth={2} aria-hidden />
                  Open deal workspace
                </Link>
              ) : (
                <Link
                  to="/signin"
                  state={publicOfferingSignInState}
                  onClick={() => {
                    const id = detail?.id?.trim()
                    if (id) persistSharedOfferingAuthIntent(id)
                  }}
                  className="um_btn_primary sponsor_dash_add_link deal_offer_pf_hero_action_link"
                >
                  <LogIn size={16} strokeWidth={2} aria-hidden />
                  Sign in to the portal
                </Link>
              )}
            </div>
          ) : null}
        </header>

        {!isPublicOfferingRoute && detail && !isDealArchived ? (
          <section className="deal_offer_pf_share_section" aria-label="Share preview">
            <div className="um_panel deal_offer_pf_share">
              <div className="deal_offer_pf_share_header">
                <h2 className="um_title um_title_with_icon deal_offer_pf_share_heading">
                  <Share2
                    className="um_title_icon deal_offer_pf_share_heading_icon"
                    size={18}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Share preview
                </h2>
                {previewShareUrl && !shareLinkLoading ? (
                  <div
                    className="deal_offer_pf_share_actions"
                    aria-label={
                      isDealShareBlocked
                        ? `${previewShareUrlDisplayText}. Sharing is unavailable while this deal is in ${dealShareBlockedStageLabel}.`
                        : !hasAnyInvestorVisibleSection
                          ? `${previewShareUrlDisplayText}. Sharing is off until at least one section is visible to investors.`
                          : `${previewShareUrlDisplayText}. Use Copy offering link or Share preview.`
                    }
                  >
                    <div className="deal_offer_pf_share_action_with_hint">
                      <button
                        type="button"
                        className="um_btn_secondary"
                        disabled={sharePreviewActionsDisabled}
                        onClick={copyPreviewLink}
                      >
                        {copyLinkState === "copied" ? (
                          <>
                            <Check size={16} strokeWidth={2} aria-hidden />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy size={16} strokeWidth={2} aria-hidden />
                            Copy offering link
                          </>
                        )}
                      </button>
                      <FormTooltip
                        label={
                          isDealShareBlocked
                            ? "Why Copy offering link is unavailable"
                            : hasAnyInvestorVisibleSection
                              ? "More information: Copy offering link"
                              : "Why Copy offering link and Share preview are unavailable"
                        }
                        content={
                          <p className="deals_table_header_tooltip_p">
                            {isDealShareBlocked
                              ? "Change the deal stage before sharing an offering preview link with investors."
                              : hasAnyInvestorVisibleSection
                                ? "Copy the link or send it by email — LP investors can open the same preview without signing in."
                                : "Nothing is set to appear for investors on this preview yet. Turn on at least one “Make it visible to Investors” toggle in Offering details or the Documents tab, then share the link."}
                          </p>
                        }
                        placement="top"
                        panelAlign="start"
                      />
                    </div>
                    <div className="deal_offer_pf_share_action_with_hint">
                      <button
                        type="button"
                        className="um_btn_primary"
                        disabled={sharePreviewActionsDisabled}
                        onClick={openShareModal}
                      >
                        <Share2 size={16} strokeWidth={2} aria-hidden />
                        Share preview
                      </button>
                      <FormTooltip
                        label={
                          isDealShareBlocked
                            ? "Why Share preview is unavailable"
                            : hasAnyInvestorVisibleSection
                              ? "More information: Share preview"
                              : "Why Copy offering link and Share preview are unavailable"
                        }
                        content={
                          <p className="deals_table_header_tooltip_p">
                            {isDealShareBlocked
                              ? "Change the deal stage before emailing an offering preview link to investors."
                              : hasAnyInvestorVisibleSection
                                ? "Opens a dialog to email the same offering preview link to your organization’s contacts, company members, or addresses you add. No login is required for recipients."
                                : "Nothing is set to appear for investors on this preview yet. Turn on at least one “Make it visible to Investors” toggle in Offering details or the Documents tab, then share the link."}
                          </p>
                        }
                        placement="top"
                        panelAlign="start"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              {shareLinkLoading ? (
                <p className="um_toolbar_notice deal_offer_pf_share_loading" role="status">
                  <Loader2
                    size={16}
                    strokeWidth={2}
                    className="deal_offer_pf_share_loading_icon"
                    aria-hidden
                  />
                  Generating secure link…
                </p>
              ) : lpShareTokenError && !previewShareUrl ? (
                <p className="deal_offer_pf_share_error" role="alert">
                  Could not create a share link. Try refreshing the page. If it
                  keeps failing, contact your administrator.
                </p>
              ) : previewShareUrl ? (
                <>
                  {isDealShareBlocked ? (
                    <p
                      className="um_toolbar_notice deal_offer_pf_share_disabled_hint"
                      role="status"
                    >
                      This deal is in{" "}
                      <strong>{dealShareBlockedStageLabel}</strong>. Change the
                      deal stage before copying or sharing the offering preview
                      link.
                    </p>
                  ) : !hasAnyInvestorVisibleSection ? (
                    <p
                      className="um_toolbar_notice deal_offer_pf_share_disabled_hint"
                      role="status"
                    >
                      Turn on at least one{" "}
                      <strong>Make it visible to Investors</strong> option in
                      Offering details or the Documents tab to enable Copy offering
                      link and Share preview.
                    </p>
                  ) : null}
                  {copyLinkState === "error" ? (
                    <p className="deal_offer_pf_share_error" role="status">
                      Could not copy automatically — try Copy offering link again,
                      or open this preview in your browser and copy the URL from
                      the address bar.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        <DealOfferingPreviewInner
          detail={detail}
          classes={classes}
          investorsPayload={investorsPayload}
          applyInvestorLinkVisibility={true}
          suppressTitlebar
          isPublicOfferingRoute={isPublicOfferingRoute}
          isLpDealWorkspace={mode === "investing" && !isPublicOfferingRoute}
          showInvestNowCta={showInvestNowCta}
          offeringStatusRules={offeringStatusRules}
          onInvestNow={
            canOpenInvestNowInWorkspace ? openInvestNowInWorkspace : undefined
          }
          publicOfferingSignInState={publicOfferingSignInState}
          onPersistSharedOfferingAuthIntent={persistSharedOfferingAuthIntent}
          galleryUsesPersistedSourcesOnly={isPublicOfferingRoute}
          publicPreviewUploadToken={previewQueryValue}
        />

        {!isPublicOfferingRoute && shareModalOpen
          ? createPortal(
              <div
                className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
                role="presentation"
                onClick={(e) => {
                  if (e.target === e.currentTarget) closeShareModal()
                }}
              >
                <div
                  className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_offer_pf_share_modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={shareModalTitleId}
                >
                  <div className="um_modal_head add_contact_modal_head">
                    <div className="add_contact_modal_head_main">
                      <FormHeadingWithInfo
                        as="h2"
                        id={shareModalTitleId}
                        className="um_modal_title add_contact_modal_title"
                        title="Share preview"
                        info={
                          <p>
                            Choose contacts or company members, or add an email.
                            Each recipient receives the same offering preview link
                            — no login required.
                          </p>
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="um_modal_close"
                      aria-label="Close"
                      disabled={shareSubmitting}
                      onClick={closeShareModal}
                    >
                      <X size={20} strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                  <div className="deals_add_inv_modal_form deal_offer_pf_share_modal_form">
                    <div className="deals_add_inv_modal_scroll deal_offer_pf_share_modal_scroll">
                      {dealIdFromRoute?.trim() ? (
                        <OfferingPreviewShareEmailRecipientsAddon
                          dealId={dealIdFromRoute.trim()}
                          disabled={shareSubmitting}
                          tags={shareEmailTags}
                          onChangeTags={setShareEmailTags}
                        />
                      ) : null}
                      {shareResultMessage ? (
                        <p
                          className={
                            shareResultFailures.length > 0
                              ? "deal_offer_pf_share_modal_feedback deal_offer_pf_share_modal_feedback_warn"
                              : "deal_offer_pf_share_modal_feedback deal_offer_pf_share_modal_feedback_ok"
                          }
                          role="status"
                        >
                          {shareResultMessage}
                        </p>
                      ) : null}
                      {shareResultFailures.length > 0 ? (
                        <ul className="deal_offer_pf_share_modal_fail_list">
                          {shareResultFailures.map((f) => (
                            <li key={f.email}>
                              <span className="deal_offer_pf_share_modal_fail_email">
                                {f.email}
                              </span>
                              <span className="deal_offer_pf_share_modal_fail_msg">
                                {" "}
                                — {f.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="um_modal_actions add_contact_modal_actions">
                      <button
                        type="button"
                        className="um_btn_secondary"
                        disabled={shareSubmitting}
                        onClick={closeShareModal}
                      >
                        <X size={16} strokeWidth={2} aria-hidden />
                        Close
                      </button>
                      <div className="add_contact_modal_actions_trailing">
                        <button
                          type="button"
                          className="um_btn_primary"
                          disabled={
                            shareSubmitting || shareEmailTags.length === 0
                          }
                          onClick={submitShareByEmail}
                        >
                          {shareSubmitting ? (
                            <>
                              <Loader2
                                size={16}
                                strokeWidth={2}
                                className="deal_offer_pf_spinner"
                                aria-hidden
                              />
                              Sending…
                            </>
                          ) : (
                            <>
                              <Send size={16} strokeWidth={2} aria-hidden />
                              Send emails
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  )
}

import {
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  CircleDollarSign,
  ClipboardCheck,
  DollarSign,
  LineChart,
  MapPin,
  PieChart,
  Shield,
  TrendingUp,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { CardCompactAmount } from "@/common/components/card-compact-amount/CardCompactAmount"
import { InvestNowDraftProgressBar } from "@/modules/Investing/pages/invest/InvestNowDraftProgressBar"
import type { InvestNowDraftProgress } from "@/modules/Investing/pages/invest/investNowDraftProgress"
import type { InvestNowDraftResumeScope } from "@/modules/Investing/pages/invest/investNowDraftUtils"
import type { InvestNowLocationState } from "@/modules/Investing/pages/invest/investNowLocationState"
import type { InvestNowStepperPhase } from "@/modules/Investing/pages/invest/investNowFlowSteps"
import { dealInvestNowPath } from "@/modules/Syndication/Deals/utils/dealInvestNowPath"
import { dealStageChipCompactClassName } from "../../../modules/Syndication/Deals/utils/dealStageChip"
import "../../../modules/Syndication/Deals/deals-list.css"
import { InvestorDealStatusBadge } from "@/modules/Investing/components/InvestorDealStatusBadge"
import type { InvestorDealStatusBadgeVariant } from "@/modules/Syndication/Deals/constants/deal-lifecycle/investor-offering-status-ui"
import { DealCardMediaCarousel } from "./DealCardMediaCarousel"
import "./deal-card.css"

const DEAL_CARD_MONEY_METRIC_LABELS = new Set([
  "Target amount",
  "Total accepted",
  "Total funded",
  "Total distributions",
  "Minimum investment",
  "Offering size",
  "Total in-progress",
])

const DEAL_CARD_METRIC_ICONS: Record<string, LucideIcon> = {
  "Target amount": LineChart,
  "Total accepted": ClipboardCheck,
  "Total funded": Wallet,
  "Total distributions": DollarSign,
  "# of investors": UserRound,
  "Close date": Calendar,
  "Minimum investment": CircleDollarSign,
  "Offering size": LineChart,
  "SEC type": Shield,
  "Deal type": Briefcase,
  "Investment type": PieChart,
  "Property type": Building2,
}

function DealCardMetricIcon({ label }: { label: string }) {
  const hasIcon = Object.prototype.hasOwnProperty.call(DEAL_CARD_METRIC_ICONS, label)
  const Icon = hasIcon ? DEAL_CARD_METRIC_ICONS[label] : undefined
  return (
    <span
      className={[
        "deal_card_metric_icon",
        hasIcon ? "" : "deal_card_metric_icon--spacer",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      {Icon ? <Icon size={12} strokeWidth={1.75} /> : null}
    </span>
  )
}

function renderDealCardMetricValue(label: string, value: string) {
  if (value === "—" || !DEAL_CARD_MONEY_METRIC_LABELS.has(label)) return value
  return (
    <CardCompactAmount
      amount={value}
      valueClassName="deal_card_metric_value_text"
    />
  )
}

export interface DealCardMetric {
  label: string
  value: string
}

interface DealCardProps {
  title: string
  location?: string
  statusLabel: string
  /** API deal stage (drives same colours as the deals data table) */
  dealStage?: string | null
  /** When set, overrides default stage chip class on the status badge. */
  statusBadgeClassName?: string
  /** Hide the default stage dot icon (e.g. offering-status emoji badges). */
  hideStatusIcon?: boolean
  statusBadgeVariant?: InvestorDealStatusBadgeVariant
  /** Preview-only copy shown under metrics (investor dashboard). */
  previewNotice?: { message: string; tooltip?: string } | null
  metrics: DealCardMetric[]
  /** First uploaded asset image from the deal (full URL) */
  coverImageUrl?: string
  /** Gallery URLs for dashboard carousel (cover first when set). */
  coverImageUrls?: string[]
  onUploadCoverClick?: () => void
  /**
   * Stable seed for {@link USE_DEAL_CARD_PLACEHOLDER_REVIEWS} (e.g. deal id).
   * Falls back to `title` when missing.
   */
  reviewPlaceholderSeed?: string
  /**
   * When true, placeholder reviews are hidden until the summary request settles
   * (avoids flashing random values before API returns).
   */
  reviewLoading?: boolean
  /** Average rating 0–5; if omitted, cards show 4.5 for display until API is wired */
  reviewRating?: number
  reviewCount?: number
  /** light.html prestige-card horizontal layout (dashboard grid) */
  prestigeLayout?: boolean
  /** Footer CTA on prestige cards (default: “Manage deal”). */
  manageCtaLabel?: string
  /** Saved Invest Now wizard progress (investing dashboard draft deals). */
  investNowDraftProgress?: InvestNowDraftProgress | null
  /** Deal id — required for onboarding phase navigation from the progress panel. */
  dealId?: string
  investNowResumeScope?: InvestNowDraftResumeScope | null
  investNowReturnTo?: string
}

export function DealCard({
  title,
  location,
  statusLabel,
  dealStage = null,
  statusBadgeClassName,
  hideStatusIcon = false,
  statusBadgeVariant = "default",
  previewNotice = null,
  metrics,
  coverImageUrl,
  coverImageUrls,
  onUploadCoverClick,
  prestigeLayout = false,
  manageCtaLabel = "Manage deal",
  investNowDraftProgress = null,
  dealId,
  investNowResumeScope = null,
  investNowReturnTo = "/dashboard",
}: DealCardProps) {
  const navigate = useNavigate()
  const resolvedImageUrls = useMemo(() => {
    const fromList = coverImageUrls?.map((u) => u.trim()).filter(Boolean) ?? []
    if (fromList.length > 0) return fromList
    const single = coverImageUrl?.trim()
    return single ? [single] : []
  }, [coverImageUrls, coverImageUrl])

  const openInvestNowPhase = useCallback(
    (phaseId: InvestNowStepperPhase["id"]) => {
      const id = dealId?.trim()
      if (!id || !investNowDraftProgress) return
      navigate(dealInvestNowPath(id), {
        state: {
          returnTo: investNowReturnTo,
          mode: "resume",
          phaseId,
          investmentId: investNowResumeScope?.investmentId,
          userInvestorProfileId: investNowResumeScope?.userInvestorProfileId,
          profileId: investNowResumeScope?.profileId,
        } satisfies InvestNowLocationState,
      })
    },
    [
      dealId,
      investNowDraftProgress,
      investNowResumeScope,
      investNowReturnTo,
      navigate,
    ],
  )

  const resolvedStatusBadgeClassName = [
    statusBadgeClassName ??
      ["deal_card_status", dealStageChipCompactClassName(dealStage)].join(" "),
    prestigeLayout ? "deal_card_prestige_stage" : "",
  ]
    .filter(Boolean)
    .join(" ")

  const isInvestNowOpportunity = statusBadgeVariant === "invest_now"
  const useInvestNowFooterCta =
    isInvestNowOpportunity && manageCtaLabel === "Invest Now"

  const statusBadge = (
    <InvestorDealStatusBadge
      statusLabel={statusLabel}
      badgeClassName={resolvedStatusBadgeClassName}
      hideStatusIcon={hideStatusIcon}
      statusBadgeVariant={statusBadgeVariant}
      statusInfo={previewNotice}
    />
  )

  const mediaBlock = (
    <DealCardMediaCarousel
      imageUrls={resolvedImageUrls}
      title={title}
      onUploadCoverClick={onUploadCoverClick}
    />
  )

  const titleOnlyBlock = (
    <div className="deal_card_head deal_card_head--prestige_title">
      <h3 className="deal_card_title">
        <span className="deal_card_title_text">{title}</span>
      </h3>
    </div>
  )

  const locationBlock = location ? (
    <p className="deal_card_location">
      <MapPin size={12} strokeWidth={1.75} className="deal_card_location_icon" aria-hidden />
      <span className="deal_card_location_text">{location}</span>
    </p>
  ) : null

  const titleBlock = (
    <div className="deal_card_head">
      <h3 className="deal_card_title">
        <span className="deal_card_title_text">{title}</span>
      </h3>
      {locationBlock}
    </div>
  )

  const metricsBlock = (
    <dl className="deal_card_metrics">
      {metrics.map(({ label, value }) => (
        <div key={label} className="deal_card_metric">
          <dt className="deal_card_metric_label">{label}</dt>
          <dd className="deal_card_metric_value">
            {renderDealCardMetricValue(label, value)}
          </dd>
        </div>
      ))}
    </dl>
  )

  if (prestigeLayout) {
    return (
      <article
        className={[
          "deal_card",
          "deal_card--prestige",
          previewNotice?.message ? "deal_card--prestige_coming_soon" : "",
          isInvestNowOpportunity ? "deal_card--prestige_invest_now" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="deal_card_prestige_hero">
          {mediaBlock}
          <div className="deal_card_prestige_overlay">
            <div className="deal_card_prestige_hero_meta">
              <div className="deal_card_prestige_meta_chip deal_card_prestige_meta_chip--title deal_card_prestige_title_chip">
                {titleOnlyBlock}
              </div>
              <div className="deal_card_prestige_hero_bottom">
                {locationBlock ? (
                  <div className="deal_card_prestige_meta_chip deal_card_prestige_meta_chip--location">
                    {locationBlock}
                  </div>
                ) : (
                  <span className="deal_card_prestige_hero_bottom_spacer" aria-hidden />
                )}
                <div className="deal_card_prestige_meta_chip deal_card_prestige_meta_chip--status">
                  {statusBadge}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="deal_card_prestige_bottom">
          <dl className="deal_card_metrics deal_card_prestige_metrics">
            {metrics.slice(0, 6).map(({ label, value }) => (
              <div key={label} className="deal_card_metric deal_card_metric--prestige">
                <DealCardMetricIcon label={label} />
                <div className="deal_card_metric_copy">
                  <dt className="deal_card_metric_label">
                    <span className="deal_card_metric_label_text">{label}</span>
                  </dt>
                  <dd className="deal_card_metric_value">
                    {renderDealCardMetricValue(label, value)}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
          <div
            className={[
              "deal_card_prestige_footer_row",
              investNowDraftProgress ? "" : "deal_card_prestige_footer_row--no_progress",
              previewNotice?.message
                ? "deal_card_prestige_footer_row--with_notice"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {investNowDraftProgress ? (
              <div className="deal_card_prestige_progress">
                <InvestNowDraftProgressBar
                  embedded
                  progress={investNowDraftProgress}
                  phaseNav={{
                    onPhaseClick: openInvestNowPhase,
                    currentStepOnly: true,
                  }}
                />
              </div>
            ) : null}
            {previewNotice?.message ? (
              <p
                className="deal_card_preview_notice deal_card_preview_notice--prestige_footer"
                title={previewNotice.tooltip}
              >
                {previewNotice.message}
              </p>
            ) : null}
            <div className="deal_card_prestige_manage">
              <span
                className={[
                  "deal_card_manage_cta",
                  useInvestNowFooterCta ? "deal_card_manage_cta--invest_now" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {useInvestNowFooterCta ? (
                  <TrendingUp size={15} strokeWidth={2.25} aria-hidden />
                ) : null}
                {manageCtaLabel}
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </span>
            </div>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="deal_card">
      <div className="deal_card_top">
        {mediaBlock}
        <section className="deal_card_top_right">
            {!prestigeLayout ? statusBadge : null}
          <div className="deal_card_top_text">
            {titleBlock}
              {/* <div
                className="deal_card_reviews"
                role="group"
                aria-label={
                  hasReviewCount
                    ? `${displayReviewCount} ${
                        displayReviewCount === 1 ? "Review" : "Reviews"
                      }. ${displayRating.toFixed(1)} of 5 stars average`
                    : `${DEAL_CARD_REVIEW_DEFAULT_TEXT}. ${displayRating.toFixed(1)} of 5 stars average`
                }
              >
                <div className="deal_card_reviews_stars" aria-hidden>
                  {dealCardStarRow(displayRating).map((kind, i) => {
                    if (kind === "full")
                      return (
                        <Star
                          key={i}
                          className="deal_card_star deal_card_star_full"
                          size={16}
                          strokeWidth={1.5}
                          fill="currentColor"
                        />
                      )
                    if (kind === "half")
                      return (
                        <StarHalf
                          key={i}
                          className="deal_card_star deal_card_star_half"
                          size={16}
                          strokeWidth={1.5}
                        />
                      )
                    return (
                      <Star
                        key={i}
                        className="deal_card_star deal_card_star_empty"
                        size={16}
                        strokeWidth={1.5}
                      />
                    )
                  })}
                </div>
                <span className="deal_card_reviews_count" aria-hidden>
                  {displayReviewCount}{" "}
                  {displayReviewCount === 1 ? "Review" : "Reviews"}
                </span>
                {showNoReviewsYetLabel ? (
                  <span className="deal_card_reviews_muted" aria-hidden>
                    {DEAL_CARD_REVIEW_DEFAULT_TEXT}
                  </span>
                ) : null}
              </div> */}
          </div>
        </section>
      </div>
      <div className="deal_card_details">
        {metricsBlock}
        {previewNotice?.message ? (
          <p
            className="deal_card_preview_notice"
            title={previewNotice.tooltip}
          >
            {previewNotice.message}
          </p>
        ) : null}
      </div>
    </article>
  )
}

// Review UI is commented out in JSX; optional review* props stay on DealCardProps for callers.

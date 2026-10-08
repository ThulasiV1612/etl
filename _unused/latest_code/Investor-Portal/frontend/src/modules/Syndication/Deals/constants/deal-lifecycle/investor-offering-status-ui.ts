import { dealStageChipCompactClassName } from "../../utils/dealStageChip"
import { OFFERING_STATUS_CATALOG } from "../../utils/offeringStatusCatalog"
import type { DealStatus } from "./deal-status"
import { normalizeDealStatus } from "./deal-status"
import {
  canInvestorInvest,
  effectiveOfferingStatusForAccess,
  getDealStatusRules,
} from "./deal-status-rules"

export interface InvestorOfferingStatusUi {
  status: DealStatus
  isPreviewOnly: boolean
  previewMessage: string | null
  previewTooltip: string | null
  blockInvestorCommitInvestAndOnboarding: boolean
}

const DEFAULT_UI: Omit<InvestorOfferingStatusUi, "status"> = {
  isPreviewOnly: false,
  previewMessage: null,
  previewTooltip: null,
  blockInvestorCommitInvestAndOnboarding: false,
}

const INVESTOR_UI_BY_STATUS: Partial<
  Record<DealStatus, Partial<Omit<InvestorOfferingStatusUi, "status">>>
> = {
  coming_soon: {
    isPreviewOnly: true,
    previewMessage:
      "This deal is visible for preview only and is not open for investment yet.",
    previewTooltip:
      "Coming Soon: This deal is not accepting investments yet. Investors can only view basic information.",
    blockInvestorCommitInvestAndOnboarding: true,
  },
}

export function getInvestorOfferingStatusUi(
  rawStatus: string | null | undefined,
): InvestorOfferingStatusUi {
  const status = normalizeDealStatus(rawStatus) ?? "draft_hidden"
  const overrides = INVESTOR_UI_BY_STATUS[status] ?? {}
  return { status, ...DEFAULT_UI, ...overrides }
}

export function isInvestorPreviewOnlyOffering(
  rawStatus: string | null | undefined,
): boolean {
  return getInvestorOfferingStatusUi(rawStatus).isPreviewOnly
}

export function canInvestorCommitInvestOrOnboard(params: {
  dealStage: string | null | undefined
  offeringStatus: string | null | undefined
}): boolean {
  const effective = effectiveOfferingStatusForAccess(
    params.dealStage,
    params.offeringStatus,
  )
  if (!effective) return false
  const ui = getInvestorOfferingStatusUi(effective)
  if (ui.blockInvestorCommitInvestAndOnboarding) return false
  return canInvestorInvest(effective)
}

export type InvestorDealStatusBadgeVariant =
  | "default"
  | "coming_soon"
  | "invest_now"

export interface InvestorDealCardPresentation {
  statusLabel: string
  statusBadgeClassName: string
  hideStatusIcon: boolean
  statusBadgeVariant: InvestorDealStatusBadgeVariant
  previewNotice: { message: string; tooltip?: string } | null
}

function investorComingSoonChipCompactClassName(): string {
  return "deals_stage_chip deals_stage_chip--compact deals_stage_chip--coming_soon"
}

function investorInvestNowChipCompactClassName(): string {
  return "deals_stage_chip deals_stage_chip--compact deals_stage_chip--invest_now"
}

const INVEST_NOW_BADGE_LABEL = "Invest Now"

/** Dashboard card badge + optional preview copy for investor-facing deal lists. */
export function getInvestorDealCardPresentation(
  offeringStatus: string | null | undefined,
  dealStage: string | null | undefined,
  fallbackStageLabel: string,
): InvestorDealCardPresentation {
  const effective = effectiveOfferingStatusForAccess(dealStage, offeringStatus)
  const rules = getDealStatusRules(effective ?? offeringStatus)
  const ui = getInvestorOfferingStatusUi(effective ?? offeringStatus)
  const isComingSoon = rules.status === "coming_soon"
  const showInvestNowBadge =
    !isComingSoon && canInvestorInvest(effective ?? offeringStatus)
  return {
    statusLabel: isComingSoon
      ? OFFERING_STATUS_CATALOG.coming_soon.label
      : showInvestNowBadge
        ? INVEST_NOW_BADGE_LABEL
        : fallbackStageLabel,
    statusBadgeClassName: `deal_card_status ${
      isComingSoon
        ? investorComingSoonChipCompactClassName()
        : showInvestNowBadge
          ? investorInvestNowChipCompactClassName()
          : dealStageChipCompactClassName(dealStage)
    }`,
    hideStatusIcon: false,
    statusBadgeVariant: isComingSoon
      ? "coming_soon"
      : showInvestNowBadge
        ? "invest_now"
        : "default",
    previewNotice: ui.previewMessage
      ? {
          message: ui.previewMessage,
          tooltip: ui.previewTooltip ?? undefined,
        }
      : null,
  }
}

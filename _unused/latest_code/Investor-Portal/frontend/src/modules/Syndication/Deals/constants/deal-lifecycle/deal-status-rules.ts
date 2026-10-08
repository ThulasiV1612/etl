import {
  allowedStatusesForStage,
  canEditFundraisingStatus,
  CAPITAL_RAISING_FUNDRAISING_STATUSES,
  isStatusAllowedForStage,
} from "./deal-stage-status-map"
import { defaultStatusForStage } from "./default-stage-status"
import {
  normalizeDealStageCanonical,
  type DealStage,
} from "./deal-stage"
import {
  normalizeDealStatus,
  type DealStatus,
} from "./deal-status"

export type InvestmentMode =
  | "none"
  | "soft_commitment"
  | "hard_commitment"
  | "full_investment"
  | "waitlist"

export interface DealStatusRules {
  status: DealStatus
  canAccessOffering: boolean
  showInvestNowButton: boolean
  investmentMode: InvestmentMode
  showClosedBanner: boolean
  requireSponsorApproval: boolean
  allowDashboardVisibility: boolean
}

const RULES_BY_STATUS: Record<DealStatus, Omit<DealStatusRules, "status">> = {
  draft_hidden: {
    canAccessOffering: false,
    showInvestNowButton: false,
    investmentMode: "none",
    showClosedBanner: false,
    requireSponsorApproval: false,
    allowDashboardVisibility: false,
  },
  coming_soon: {
    canAccessOffering: true,
    showInvestNowButton: false,
    investmentMode: "none",
    showClosedBanner: false,
    requireSponsorApproval: false,
    allowDashboardVisibility: true,
  },
  open_soft_commitment: {
    canAccessOffering: true,
    showInvestNowButton: true,
    investmentMode: "soft_commitment",
    showClosedBanner: false,
    requireSponsorApproval: false,
    allowDashboardVisibility: true,
  },
  open_hard_commitment: {
    canAccessOffering: true,
    showInvestNowButton: true,
    investmentMode: "hard_commitment",
    showClosedBanner: false,
    requireSponsorApproval: false,
    allowDashboardVisibility: true,
  },
  open_investment: {
    canAccessOffering: true,
    showInvestNowButton: true,
    investmentMode: "full_investment",
    showClosedBanner: false,
    requireSponsorApproval: false,
    allowDashboardVisibility: true,
  },
  waitlist: {
    canAccessOffering: true,
    showInvestNowButton: false,
    investmentMode: "waitlist",
    showClosedBanner: false,
    requireSponsorApproval: true,
    allowDashboardVisibility: true,
  },
  closed: {
    canAccessOffering: true,
    showInvestNowButton: false,
    investmentMode: "none",
    showClosedBanner: true,
    requireSponsorApproval: false,
    allowDashboardVisibility: false,
  },
  past: {
    canAccessOffering: false,
    showInvestNowButton: false,
    investmentMode: "none",
    showClosedBanner: false,
    requireSponsorApproval: false,
    allowDashboardVisibility: false,
  },
}

export function getDealStatusRules(
  rawStatus: string | null | undefined,
): DealStatusRules {
  const status = normalizeDealStatus(rawStatus) ?? "draft_hidden"
  return { status, ...RULES_BY_STATUS[status] }
}

export function canInvestorAccessOffering(
  rawStatus: string | null | undefined,
): boolean {
  return getDealStatusRules(rawStatus).canAccessOffering
}

/**
 * Status used for investor access when DB stage/status are out of sync
 * (e.g. capital raising + legacy `draft_hidden`).
 */
export function effectiveOfferingStatusForAccess(
  dealStage: string | null | undefined,
  offeringStatus: string | null | undefined,
): DealStatus | null {
  const stage = normalizeDealStageCanonical(dealStage)
  const status = normalizeDealStatus(offeringStatus)
  if (!stage) return status
  if (status && isStatusAllowedForStage(stage, status)) return status
  return defaultStatusForStage(stage)
}

/** Shared `/offering_portfolio` link and public preview API. */
export function canInvestorAccessPublicOffering(
  dealStage: string | null | undefined,
  offeringStatus: string | null | undefined,
): boolean {
  const stage = normalizeDealStageCanonical(dealStage)
  if (stage === "draft") return false
  const effective = effectiveOfferingStatusForAccess(dealStage, offeringStatus)
  if (!effective) return false
  return getDealStatusRules(effective).canAccessOffering
}

export function canInvestorInvest(
  rawStatus: string | null | undefined,
): boolean {
  const rules = getDealStatusRules(rawStatus)
  return (
    rules.showInvestNowButton &&
    rules.investmentMode !== "none" &&
    rules.investmentMode !== "waitlist"
  )
}

/** Investor dashboard Opportunities tab — preview-only or open for investment. */
export function isInvestorDashboardOpportunityOffering(
  dealStage: string | null | undefined,
  offeringStatus: string | null | undefined,
): boolean {
  const effective = effectiveOfferingStatusForAccess(dealStage, offeringStatus)
  if (!effective) return false
  const rules = getDealStatusRules(effective)
  if (!rules.allowDashboardVisibility) return false
  if (rules.status === "coming_soon") return true
  return canInvestorInvest(effective)
}

export function shouldShowInvestButton(
  rawStatus: string | null | undefined,
): boolean {
  return getDealStatusRules(rawStatus).showInvestNowButton
}

export function resolveOfferingStatusForStageChange(params: {
  nextStage: DealStage
  currentStatus: string | null | undefined
}): DealStatus {
  const current = normalizeDealStatus(params.currentStatus)
  if (current && isStatusAllowedForStage(params.nextStage, current)) {
    return current
  }
  return defaultStatusForStage(params.nextStage)
}

export function validateDealStageAndStatus(params: {
  dealStage: string | null | undefined
  offeringStatus: string | null | undefined
}): { ok: true } | { ok: false; message: string } {
  const stage = normalizeDealStageCanonical(params.dealStage)
  const status = normalizeDealStatus(params.offeringStatus)
  if (!stage) {
    return { ok: false, message: "Invalid deal stage." }
  }
  if (!status) {
    return { ok: false, message: "Invalid offering status." }
  }
  if (!isStatusAllowedForStage(stage, status)) {
    const allowed = allowedStatusesForStage(stage).join(", ")
    return {
      ok: false,
      message: `Status "${status}" is not allowed for stage "${stage}". Allowed: ${allowed}.`,
    }
  }
  return { ok: true }
}

function fundraisingStatusIndex(status: DealStatus): number {
  return CAPITAL_RAISING_FUNDRAISING_STATUSES.indexOf(status)
}

/**
 * Legacy rows may keep `draft_hidden` while `deal_stage` is already capital raising.
 * Treat those as `coming_soon` for forward-only fundraising progression checks.
 */
function statusForFundraisingProgression(
  rawStage: string | null | undefined,
  status: DealStatus,
): DealStatus {
  const stage = normalizeDealStageCanonical(rawStage)
  if (stage !== "capital_raising" && stage !== "draft") return status
  if (fundraisingStatusIndex(status) >= 0) return status
  return defaultStatusForStage("capital_raising")
}

export function validateOfferingStatusChange(params: {
  dealStage: string | null | undefined
  previousOfferingStatus: string | null | undefined
  nextOfferingStatus: string | null | undefined
}): { ok: true } | { ok: false; message: string } {
  const combo = validateDealStageAndStatus({
    dealStage: params.dealStage,
    offeringStatus: params.nextOfferingStatus,
  })
  if (!combo.ok) return combo

  const prev = normalizeDealStatus(params.previousOfferingStatus)
  const next = normalizeDealStatus(params.nextOfferingStatus)
  if (!prev || !next) {
    return { ok: false, message: "Invalid offering status." }
  }
  if (prev === next) return { ok: true }

  if (!canEditFundraisingStatus(params.dealStage)) {
    return {
      ok: false,
      message:
        "Offering status can only be changed while the deal is in Draft or Capital Raising.",
    }
  }

  const nextForProgress = statusForFundraisingProgression(params.dealStage, next)
  const nextIdx = fundraisingStatusIndex(nextForProgress)
  if (nextIdx < 0) {
    return { ok: false, message: "Invalid fundraising status." }
  }

  return { ok: true }
}

export function isInvestmentFlowOpeningTransition(
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined,
): boolean {
  const from = normalizeDealStatus(fromStatus)
  const to = normalizeDealStatus(toStatus)
  if (!from || !to) return false
  return (
    (from === "open_soft_commitment" || from === "open_hard_commitment") &&
    to === "open_investment"
  )
}

export {
  normalizeDealStageCanonical,
  normalizeDealStatus,
  allowedStatusesForStage,
  defaultStatusForStage,
  canEditFundraisingStatus,
}

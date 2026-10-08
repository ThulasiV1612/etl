import {
  isDealStageDraft,
  normalizeDealStatus,
} from "../constants/deal-lifecycle"

export const OPEN_INVESTMENT_ESIGN_REQUIRED_TITLE =
  "Cannot activate Open to Investment"

export const OPEN_INVESTMENT_ESIGN_REQUIRED_MESSAGE =
  "E-sign templates are not configured for this deal.\n\nYou must create and complete e-sign setup before enabling investor onboarding and investment flow."

export const OPEN_INVESTMENT_DRAFT_STAGE_INFO_TITLE =
  "Deal stage is Draft"

export const OPEN_INVESTMENT_DRAFT_STAGE_INFO_MESSAGE =
  "Saving Open to Investment will move this deal from Draft to Capital Raising so investors can access the offering.\n\nMake sure eSign templates and investor classes are complete, then click Save on this page."

export type CanActivateOpenInvestmentFailureReason = "missing_esign_templates"

export type CanActivateOpenInvestmentResult =
  | { ok: true }
  | { ok: false; reason: CanActivateOpenInvestmentFailureReason }

/** Deal fields needed to validate a transition to Open to Investment. */
export interface DealForOpenInvestmentActivation {
  offeringStatus?: string | null
  esignTemplatesConfigured: boolean
}

export function isOpenInvestmentWhileDealStageDraft(
  dealStage: string | null | undefined,
  currentOfferingStatus: string | null | undefined,
  nextOfferingStatus: string | null | undefined,
): boolean {
  if (!isDealStageDraft(dealStage)) return false
  return isTransitionToOpenInvestment(currentOfferingStatus, nextOfferingStatus)
}

export function isTransitionToOpenInvestment(
  currentOfferingStatus: string | null | undefined,
  nextOfferingStatus: string | null | undefined,
): boolean {
  const next = normalizeDealStatus(nextOfferingStatus)
  const current = normalizeDealStatus(currentOfferingStatus)
  if (next !== "open_investment") return false
  return current !== "open_investment"
}

/**
 * Returns whether the deal may use offering status `open_investment`.
 * Pass `nextOfferingStatus` as the proposed status; other fields describe the deal today.
 */
export function canActivateOpenInvestment(
  deal: DealForOpenInvestmentActivation,
  nextOfferingStatus: string,
): CanActivateOpenInvestmentResult {
  if (
    !isTransitionToOpenInvestment(deal.offeringStatus, nextOfferingStatus)
  ) {
    return { ok: true }
  }
  if (deal.esignTemplatesConfigured) return { ok: true }
  return { ok: false, reason: "missing_esign_templates" }
}

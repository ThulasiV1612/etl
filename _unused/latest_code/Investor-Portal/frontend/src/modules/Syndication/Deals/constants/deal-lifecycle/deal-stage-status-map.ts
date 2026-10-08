import type { DealStage } from "./deal-stage"
import { normalizeDealStageCanonical } from "./deal-stage"
import type { DealStatus } from "./deal-status"

/** Fundraising statuses while `dealStage` is capital_raising (progression order). */
export const CAPITAL_RAISING_FUNDRAISING_STATUSES: readonly DealStatus[] = [
  "coming_soon",
  "open_soft_commitment",
  "open_hard_commitment",
  "open_investment",
  "waitlist",
  "closed",
]

/** Draft stage may use hidden + all fundraising statuses (investor access stays off until live). */
export const DRAFT_OFFERING_STATUSES: readonly DealStatus[] = [
  "draft_hidden",
  ...CAPITAL_RAISING_FUNDRAISING_STATUSES,
]

/** Allowed offering statuses per canonical deal stage (`offering_status` in DB). */
export const DEAL_STAGE_STATUS_MAP: Readonly<
  Record<DealStage, readonly DealStatus[]>
> = {
  draft: DRAFT_OFFERING_STATUSES,
  capital_raising: [
    "coming_soon",
    "open_soft_commitment",
    "open_hard_commitment",
    "open_investment",
    "waitlist",
    "closed",
  ],
  asset_managing: ["closed"],
  liquidated: ["past"],
}

export function allowedStatusesForStage(
  stage: DealStage,
): readonly DealStatus[] {
  return DEAL_STAGE_STATUS_MAP[stage]
}

export function isStatusAllowedForStage(
  stage: DealStage,
  status: DealStatus,
): boolean {
  return allowedStatusesForStage(stage).includes(status)
}

export function isCapitalRaisingDealStage(
  raw: string | null | undefined,
): boolean {
  return normalizeDealStageCanonical(raw) === "capital_raising"
}

/** Sponsors may set fundraising statuses in Draft (planning) or Capital Raising (live). */
export function canEditFundraisingStatus(
  rawStage: string | null | undefined,
): boolean {
  const stage = normalizeDealStageCanonical(rawStage)
  return stage === "capital_raising" || stage === "draft"
}

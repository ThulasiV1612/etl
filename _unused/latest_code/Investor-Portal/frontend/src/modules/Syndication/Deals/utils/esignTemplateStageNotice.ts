import { normalizeDealStageCanonical } from "../constants/deal-lifecycle/deal-stage"
import { normalizeDealStatus, type DealStatus } from "../constants/deal-lifecycle/deal-status"

export type EsignTemplateStageNoticeVariant =
  | "configure_only"
  | "onboarding_active"

const ESIGN_CONFIGURE_ONLY_STATUSES: ReadonlySet<DealStatus> = new Set([
  "open_soft_commitment",
  "open_hard_commitment",
])

/** Which section note to show on the eSign Templates tab, if any. */
export function resolveEsignTemplateStageNoticeVariant(
  dealStage: string | null | undefined,
  offeringStatus: string | null | undefined,
): EsignTemplateStageNoticeVariant | null {
  const status = normalizeDealStatus(offeringStatus)
  if (!status) return null

  if (status === "open_investment") return "onboarding_active"

  if (normalizeDealStageCanonical(dealStage) !== "capital_raising") return null
  if (ESIGN_CONFIGURE_ONLY_STATUSES.has(status)) return "configure_only"

  return null
}

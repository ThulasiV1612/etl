export const DEAL_STAGES = [
  "draft",
  "capital_raising",
  "asset_managing",
  "liquidated",
] as const

export type DealStage = (typeof DEAL_STAGES)[number]

/** Normalize DB / form aliases to canonical stage keys. */
/** True when lifecycle stage is Draft (any stored alias). */
export function isDealStageDraft(raw: string | null | undefined): boolean {
  return normalizeDealStageCanonical(raw) === "draft"
}

/** True when lifecycle stage is Liquidated. */
export function isDealStageLiquidated(raw: string | null | undefined): boolean {
  return normalizeDealStageCanonical(raw) === "liquidated"
}

/** Capital Raising and Asset Managing are billed monthly (MRR). */
export function isDealStageSaasBillable(
  raw: string | null | undefined,
): boolean {
  const stage = normalizeDealStageCanonical(raw)
  return stage === "capital_raising" || stage === "asset_managing"
}

/** Draft and liquidated deals cannot copy or share offering preview links. */
export function isDealStageOfferingShareBlocked(
  raw: string | null | undefined,
): boolean {
  const stage = normalizeDealStageCanonical(raw)
  return stage === "draft" || stage === "liquidated"
}

export function normalizeDealStageCanonical(
  raw: string | null | undefined,
): DealStage | null {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
  switch (key) {
    case "draft":
      return "draft"
    case "capital_raising":
    case "raising_capital":
      return "capital_raising"
    case "asset_managing":
    case "managing_asset":
      return "asset_managing"
    case "liquidated":
      return "liquidated"
    default:
      return null
  }
}

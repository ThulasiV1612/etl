/**
 * Normalizes API / form raw stage strings to a stable key for CSS modifiers.
 */
export type DealStageVisualKey =
  | "draft"
  | "capital_raising"
  | "managing_asset"
  | "liquidated"
  | "unknown"

export function normalizeDealStageKey(
  raw: string | null | undefined,
): DealStageVisualKey {
  const s = String(raw ?? "").trim().toLowerCase()
  if (!s) return "unknown"
  if (s === "draft") return "draft"
  if (s === "capital_raising" || s === "raising_capital") return "capital_raising"
  if (s === "managing_asset" || s === "asset_managing") return "managing_asset"
  if (s === "liquidated") return "liquidated"
  return "unknown"
}

/** Pill classes: `deals_stage_chip deals_stage_chip--draft` etc. */
export function dealStageChipClassName(raw: string | null | undefined): string {
  const k = normalizeDealStageKey(raw)
  return `deals_stage_chip deals_stage_chip--${k}`
}

/** Compact pill (e.g. deals list name row). */
export function dealStageChipCompactClassName(
  raw: string | null | undefined,
): string {
  const k = normalizeDealStageKey(raw)
  return `deals_stage_chip deals_stage_chip--compact deals_stage_chip--${k}`
}

export const DEAL_STAGES = [
  "draft",
  "capital_raising",
  "asset_managing",
  "liquidated",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

/** True when lifecycle stage is Draft (any stored alias). */
export function isDealStageDraft(raw: string | null | undefined): boolean {
  return normalizeDealStageCanonical(raw) === "draft";
}

/** Normalize DB / form aliases to canonical stage keys. */
export function normalizeDealStageCanonical(
  raw: string | null | undefined,
): DealStage | null {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  switch (key) {
    case "draft":
      return "draft";
    case "capital_raising":
    case "raising_capital":
    case "capital_raising_stage":
      return "capital_raising";
    case "asset_managing":
    case "managing_asset":
      return "asset_managing";
    case "liquidated":
      return "liquidated";
    default:
      return null;
  }
}

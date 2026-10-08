import type { DealStage } from "./deal-stage.js";
import type { DealStatus } from "./deal-status.js";

/** Default `offering_status` when a deal enters a stage (or stage changes). */
export const DEFAULT_STATUS_BY_STAGE: Readonly<Record<DealStage, DealStatus>> = {
  draft: "draft_hidden",
  capital_raising: "coming_soon",
  asset_managing: "closed",
  liquidated: "past",
};

export function defaultStatusForStage(stage: DealStage): DealStatus {
  return DEFAULT_STATUS_BY_STAGE[stage];
}

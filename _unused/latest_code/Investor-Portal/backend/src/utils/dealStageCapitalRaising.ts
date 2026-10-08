import { isCapitalRaisingDealStage } from "../constants/deal-lifecycle/deal-stage-status-map.js";

/**
 * Public LP preview, preview-token minting, and LP self-serve invest flows
 * are limited to Capital Raising (all stored stage aliases).
 */
export function isDealStageCapitalRaising(
  raw: string | null | undefined,
): boolean {
  return isCapitalRaisingDealStage(raw);
}

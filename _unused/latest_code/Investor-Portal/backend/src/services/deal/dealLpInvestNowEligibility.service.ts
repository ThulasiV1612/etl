import type { AddDealFormRow } from "../../schema/deal.schema/add-deal-form.schema.js";
import { isCapitalRaisingDealStage } from "../../constants/deal-lifecycle/deal-stage-status-map.js";
import {
  canInvestorInvest,
  effectiveOfferingStatusForAccess,
} from "../../constants/deal-lifecycle/deal-status-rules.js";

export type LpInvestNowEligibilityResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Whether the signed-in LP may commit / send Invest Now eSign on this deal.
 * Requires Capital Raising lifecycle stage and an offering status that allows investing.
 */
export function evaluateLpInvestNowEligibility(
  deal: AddDealFormRow | null | undefined,
): LpInvestNowEligibilityResult {
  if (!deal) {
    return { ok: false, message: "Deal not found" };
  }

  if (!isCapitalRaisingDealStage(deal.dealStage)) {
    return {
      ok: false,
      message:
        "Investments can only be recorded while the deal is in the Capital Raising stage. Ask your sponsor to move the deal out of Draft or Managing asset, then try again.",
    };
  }

  const effectiveStatus = effectiveOfferingStatusForAccess(
    deal.dealStage,
    deal.offeringStatus,
  );
  if (!canInvestorInvest(effectiveStatus)) {
    return {
      ok: false,
      message:
        "This offering is not open for new investments yet. Ask your sponsor to set an open fundraising status (for example Open to investment) while the deal is in Capital Raising.",
    };
  }

  return { ok: true };
}

import { getAddDealFormById } from "./dealForm.service.js";
import { isDealStageCapitalRaising } from "../../utils/dealStageCapitalRaising.js";

/**
 * Optional guard for offering-preview share flows (matches copy_code behavior).
 * Wire into existing handlers manually — do not duplicate send/token logic here.
 */
export async function assertDealAllowsOfferingPreviewShareEmail(
  dealId: string,
): Promise<void> {
  const deal = await getAddDealFormById(dealId.trim());
  if (!deal) {
    throw new Error("Deal not found");
  }
  if (!isDealStageCapitalRaising(deal.dealStage)) {
    throw new Error(
      "Offering preview emails are only available while the deal is raising capital.",
    );
  }
}

/**
 * Optional guard before minting encrypted preview tokens (matches copy_code behavior).
 */
export async function assertDealAllowsOfferingPreviewToken(dealId: string): Promise<void> {
  const deal = await getAddDealFormById(dealId.trim());
  if (!deal) {
    throw new Error("Deal not found");
  }
  if (!isDealStageCapitalRaising(deal.dealStage)) {
    throw new Error(
      "Offering preview links are only available while the deal is raising capital.",
    );
  }
}

import { canInvestorInvest } from "../../constants/deal-lifecycle/index.js";
import { getAddDealFormById } from "./dealForm.service.js";

/**
 * LP self-serve commitment guard — driven by offering status rules.
 * Optional: call from `patchDealLpInvestorMyCommitment` after loading the deal row.
 */
export async function assertDealAllowsLpInvestmentRecording(
  dealId: string,
): Promise<void> {
  const dealRow = await getAddDealFormById(dealId.trim());
  if (!dealRow || !canInvestorInvest(dealRow.offeringStatus)) {
    throw new Error(
      "Investments are not open for this offering at this time.",
    );
  }
}

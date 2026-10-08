import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import { resolveLpViewerEmailNorm } from "../../services/deal/dealLpViewerIdentity.service.js";
import { readMyInvestNowCommitment } from "../../services/deal/dealLpInvestorMyInvestNowCommitment.read.service.js";

function queryString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && v.length > 0) return queryString(v[v.length - 1]);
  return "";
}

/**
 * GET /deals/:dealId/lp-investors/my-invest-now-commitment
 * Saved Invest Now progress for one book profile (amount, questionnaire, W-9 sans SSN).
 */
export async function getDealLpInvestorMyInvestNowCommitment(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  if (!dealId?.trim()) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (
      !(await assertDealIdReadableOrAssignedParticipant(dealId.trim(), scope))
    ) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const emailNorm = await resolveLpViewerEmailNorm(user.id, user.email);
    if (!emailNorm.includes("@")) {
      res.status(400).json({
        message:
          "Your account does not have an email address. Add an email to your profile and try again.",
      });
      return;
    }

    const q = req.query as Record<string, unknown>;
    const result = await readMyInvestNowCommitment({
      dealId: dealId.trim(),
      viewerEmailNorm: emailNorm,
      viewerUserId: user.id,
      investmentId: queryString(q.investment_id ?? q.investmentId),
      userInvestorProfileId: queryString(
        q.user_investor_profile_id ?? q.userInvestorProfileId,
      ),
      profileId: queryString(q.profile_id ?? q.profileId),
    });

    if (!result.ok) {
      res.status(200).json({ found: false, message: result.message });
      return;
    }
    res.status(200).json({
      found: true,
      investmentId: result.investmentId,
      profileId: result.profileId,
      userInvestorProfileId: result.userInvestorProfileId,
      committedAmount: result.committedAmount,
      fundingMethod: result.fundingMethod,
      investorClass: result.investorClass,
      status: result.status,
      docSignedDate: result.docSignedDate,
      questionnaireAnswers: result.questionnaireAnswers,
      w9Form: result.w9Form,
    });
  } catch (err) {
    console.error("getDealLpInvestorMyInvestNowCommitment:", err);
    res.status(500).json({ message: "Could not load saved investment progress" });
  }
}

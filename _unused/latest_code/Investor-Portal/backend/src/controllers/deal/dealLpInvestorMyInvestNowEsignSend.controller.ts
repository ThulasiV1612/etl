import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import { getAddDealFormById } from "../../services/deal/dealForm.service.js";
import { sendMyInvestNowEsignIfNeeded } from "../../services/deal/dealLpInvestNowMyEsignSend.service.js";
import { evaluateLpInvestNowEligibility } from "../../services/deal/dealLpInvestNowEligibility.service.js";
import { resolveLpViewerEmailNorm } from "../../services/deal/dealLpViewerIdentity.service.js";

function bodyString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return bodyString(v[v.length - 1]);
  }
  if (v != null) return String(v);
  return "";
}

function investNowEsignSendHttpStatus(message: string): number {
  const m = message.toLowerCase();
  if (
    m.includes("not configured") ||
    m.includes("not reachable") ||
    m.includes("temporarily unavailable") ||
    m.includes("429") ||
    m.includes("too many requests") ||
    m.includes("rate limit")
  ) {
    return 503;
  }
  if (
    m.includes("save your investment") ||
    m.includes("enter your investment amount")
  ) {
    return 409;
  }
  return 400;
}

/**
 * POST /deals/:dealId/lp-investors/my-invest-now-esign-send
 * Investor self-serve: send profile-matched eSign templates after Invest Now commitment.
 */
export async function postDealLpInvestorMyInvestNowEsignSend(
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

  const b = req.body as Record<string, unknown>;
  const profileId = bodyString(b.profile_id ?? b.profileId);
  const userInvestorProfileId = bodyString(
    b.user_investor_profile_id ?? b.userInvestorProfileId,
  );
  const investmentId = bodyString(b.investment_id ?? b.investmentId);

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

    const dealRow = await getAddDealFormById(dealId.trim());
    const investEligibility = evaluateLpInvestNowEligibility(dealRow);
    if (!investEligibility.ok) {
      res.status(403).json({ message: investEligibility.message });
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

    const displayName = bodyString(b.member_display_name ?? b.memberDisplayName);

    const questionnaireRaw = b.questionnaire_answers ?? b.questionnaireAnswers;
    const w9Raw = b.w9_form ?? b.w9Form;
    const result = await sendMyInvestNowEsignIfNeeded({
      dealId: dealId.trim(),
      viewerEmail: emailNorm,
      viewerUserId: user.id,
      profileId,
      userInvestorProfileId: userInvestorProfileId || undefined,
      investmentId: investmentId || undefined,
      memberDisplayName: displayName || undefined,
      questionnaireAnswers:
        questionnaireRaw != null && typeof questionnaireRaw === "object"
          ? (questionnaireRaw as Record<string, string>)
          : undefined,
      w9Form:
        w9Raw != null && typeof w9Raw === "object"
          ? (w9Raw as Record<string, string>)
          : undefined,
    });

    if (!result.ok) {
      res.status(investNowEsignSendHttpStatus(result.message)).json({
        message: result.message,
      });
      return;
    }

    res.status(200).json({
      message: result.alreadyCompleted
        ? "Documents already signed"
        : result.alreadySent
          ? "Documents already sent for signature"
          : "E-sign documents sent",
      alreadySent: result.alreadySent,
      alreadyCompleted: result.alreadyCompleted,
      signatureRequestId: result.signatureRequestId,
      investmentId: result.investmentId,
      documentNames: result.documentNames,
    });
  } catch (err) {
    console.error("postDealLpInvestorMyInvestNowEsignSend:", err);
    res.status(500).json({ message: "Could not send eSign documents" });
  }
}

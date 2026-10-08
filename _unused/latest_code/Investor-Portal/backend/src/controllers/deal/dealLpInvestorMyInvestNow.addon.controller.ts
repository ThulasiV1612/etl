import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import { resolveLpViewerEmailNorm } from "../../services/deal/dealLpViewerIdentity.service.js";
import { getAddDealFormById } from "../../services/deal/dealForm.service.js";
import { reconcileAssigningDealUsersForDeal } from "../../services/deal/assigningDealUser.service.js";
import {
  getLpInvestorsTabPayload,
} from "../../services/deal/dealLpInvestor.service.js";
import { applyMyInvestNowCommitmentAddon } from "../../services/deal/dealLpInvestorMyInvestNowCommitment.addon.service.js";
import { readMyInvestNowCommitment } from "../../services/deal/dealLpInvestorMyInvestNowCommitment.read.service.js";
import { evaluateLpInvestNowEligibility } from "../../services/deal/dealLpInvestNowEligibility.service.js";

function bodyString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return bodyString(v[v.length - 1]);
  }
  if (v != null) return String(v);
  return "";
}

/**
 * PATCH /deals/:dealId/lp-investors/my-invest-now-commitment
 * copy_code parity: full commitment value + optional status + doc_signed_date; raising-capital guard.
 */
export async function patchDealLpInvestorMyInvestNowAddon(
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
  const progressOnly =
    b.progress_only === true ||
    b.progressOnly === true ||
    String(b.progress_only ?? b.progressOnly ?? "")
      .trim()
      .toLowerCase() === "true";
  const hasCommittedKey =
    Object.prototype.hasOwnProperty.call(b, "committed_amount") ||
    Object.prototype.hasOwnProperty.call(b, "committedAmount") ||
    Object.prototype.hasOwnProperty.call(b, "amount");
  const skipCommittedAmount = progressOnly && !hasCommittedKey;
  const raw = hasCommittedKey
    ? bodyString(b.committed_amount ?? b.committedAmount).trim() ||
      bodyString(b.amount).trim()
    : "";
  if (!skipCommittedAmount) {
    const n = Number(String(raw).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || (n <= 0 && !progressOnly)) {
      res.status(400).json({
        message: progressOnly
          ? "Committed amount must be zero or greater"
          : "Committed amount must be a number greater than 0",
      });
      return;
    }
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

    const profileRaw = bodyString(b.profile_id ?? b.profileId);
    const hasUserInvestorProfileIdKey =
      Object.prototype.hasOwnProperty.call(b, "user_investor_profile_id") ||
      Object.prototype.hasOwnProperty.call(b, "userInvestorProfileId");
    const userInvestorProfileRaw = hasUserInvestorProfileIdKey
      ? bodyString(b.user_investor_profile_id ?? b.userInvestorProfileId)
      : undefined;
    const hasStatusKey = Object.prototype.hasOwnProperty.call(b, "status");
    const hasDocSignedKey =
      Object.prototype.hasOwnProperty.call(b, "doc_signed_date") ||
      Object.prototype.hasOwnProperty.call(b, "docSignedDate");
    const statusPatch = hasStatusKey
      ? bodyString(b.status).trim()
      : undefined;
    const docSignedRaw = hasDocSignedKey
      ? bodyString(b.doc_signed_date ?? b.docSignedDate).trim()
      : undefined;
    const docSignedPatch =
      hasDocSignedKey && docSignedRaw === "" ? null : docSignedRaw;

    const hasQuestionnaireAnswersKey =
      Object.prototype.hasOwnProperty.call(b, "questionnaire_answers") ||
      Object.prototype.hasOwnProperty.call(b, "questionnaireAnswers");
    const hasW9FormKey =
      Object.prototype.hasOwnProperty.call(b, "w9_form") ||
      Object.prototype.hasOwnProperty.call(b, "w9Form");
    const hasFundingMethodKey =
      Object.prototype.hasOwnProperty.call(b, "funding_method") ||
      Object.prototype.hasOwnProperty.call(b, "fundingMethod");
    const hasInvestorClassKey =
      Object.prototype.hasOwnProperty.call(b, "investor_class") ||
      Object.prototype.hasOwnProperty.call(b, "investorClass");
    const replaceCommittedAmount =
      b.replace_committed_amount === true ||
      b.replaceCommittedAmount === true ||
      String(b.replace_committed_amount ?? b.replaceCommittedAmount ?? "")
        .trim()
        .toLowerCase() === "true";

    const referringSponsorRefRaw = bodyString(
      b.referring_sponsor_ref ?? b.referringSponsorRef,
    ).trim();

    const result = await applyMyInvestNowCommitmentAddon({
      dealId: dealId.trim(),
      viewerEmailNorm: emailNorm,
      viewerUserId: user.id,
      committedAmount: skipCommittedAmount ? undefined : raw,
      progressOnly,
      skipCommittedAmount,
      replaceCommittedAmount,
      profileId: profileRaw,
      userInvestorProfileInBody: hasUserInvestorProfileIdKey,
      userInvestorProfileId: hasUserInvestorProfileIdKey
        ? userInvestorProfileRaw
        : undefined,
      status: statusPatch,
      docSignedDate: hasDocSignedKey ? docSignedPatch : undefined,
      questionnaireAnswersInBody: hasQuestionnaireAnswersKey,
      questionnaireAnswers: hasQuestionnaireAnswersKey
        ? (b.questionnaire_answers ?? b.questionnaireAnswers)
        : undefined,
      w9FormInBody: hasW9FormKey,
      w9Form: hasW9FormKey ? (b.w9_form ?? b.w9Form) : undefined,
      fundingMethodInBody: hasFundingMethodKey,
      fundingMethod: hasFundingMethodKey
        ? bodyString(b.funding_method ?? b.fundingMethod)
        : undefined,
      investorClassInBody: hasInvestorClassKey,
      investorClass: hasInvestorClassKey
        ? bodyString(b.investor_class ?? b.investorClass)
        : undefined,
      referringSponsorRef: referringSponsorRefRaw || undefined,
    });
    if (!result.ok) {
      res.status(400).json({ message: result.message });
      return;
    }

    await reconcileAssigningDealUsersForDeal(dealId.trim(), user.id);

    const payload = await getLpInvestorsTabPayload(dealId.trim(), user.id);
    const savedRow = await readMyInvestNowCommitment({
      dealId: dealId.trim(),
      viewerEmailNorm: emailNorm,
      viewerUserId: user.id,
      userInvestorProfileId: hasUserInvestorProfileIdKey
        ? userInvestorProfileRaw
        : undefined,
      profileId: profileRaw,
    });
    res.status(200).json({
      message: "Committed amount saved",
      investorsPayload: payload,
      investmentId: savedRow.ok ? savedRow.investmentId : null,
    });
  } catch (err) {
    console.error("patchDealLpInvestorMyInvestNowAddon:", err);
    res.status(500).json({ message: "Could not save committed amount" });
  }
}

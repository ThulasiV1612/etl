import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import { isPortalUserLeadOrAdminSponsorOnDeal } from "../../services/deal/dealMemberScope.service.js";
import {
  getDealInvestorQuestionnaireState,
  parseInvestorQuestionnaireJson,
  saveDealInvestorQuestionnaireState,
  type InvestorQuestionnaireJson,
} from "../../services/deal/dealInvestorQuestionnaire.service.js";

function parseBodyConfig(body: unknown): InvestorQuestionnaireJson | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const config = o.config ?? o.questionnaire ?? body;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }
  const c = config as Record<string, unknown>;
  const raw = JSON.stringify({
    v: 1,
    sections: c.sections,
    questions: c.questions,
    profileSectionVisibility: c.profileSectionVisibility,
  });
  const parsed = parseInvestorQuestionnaireJson(raw);
  if (!parsed.sections.length) return null;
  return parsed;
}

/**
 * GET /deals/:dealId/investor-questionnaire
 */
export async function getDealInvestorQuestionnaire(
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
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const config = await getDealInvestorQuestionnaireState(dealId);
    res.status(200).json({ config });
  } catch (err) {
    console.error("getDealInvestorQuestionnaire:", err);
    res.status(500).json({ message: "Could not load investor questionnaire" });
  }
}

/**
 * PUT /deals/:dealId/investor-questionnaire — lead sponsor only.
 */
export async function putDealInvestorQuestionnaire(
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
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const config = parseBodyConfig(req.body);
  if (!config) {
    res.status(400).json({ message: "Invalid questionnaire config" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (!(await isPortalUserLeadOrAdminSponsorOnDeal(dealId, user.id))) {
      res.status(403).json({
        message:
          "Only the lead or admin sponsor on this deal can update the investor questionnaire",
      });
      return;
    }
    const saved = await saveDealInvestorQuestionnaireState(dealId, config);
    res.status(200).json({ config: saved });
  } catch (err) {
    console.error("putDealInvestorQuestionnaire:", err);
    res.status(500).json({ message: "Could not save investor questionnaire" });
  }
}

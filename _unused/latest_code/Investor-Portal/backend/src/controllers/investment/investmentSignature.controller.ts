import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import {
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { resolvePortalUserContactKeysOnDeal } from "../../services/deal/dealMemberEsignStatus.service.js";
import { resolveInvestNowViewerContactOnDeal } from "../../services/deal/dealInvestNowViewerContact.service.js";
import {
  resolveLpViewerEmailNorm,
  viewerOwnsContactKey,
} from "../../services/deal/dealLpViewerIdentity.service.js";
import {
  getInvestmentSignStatus,
  type InvestmentSignStatusApi,
} from "../../services/investment/investmentSignature.service.js";

async function viewerMayReadInvestmentSignStatus(params: {
  userId: string;
  userEmail: string | undefined;
  userRole: string | undefined;
  dealId: string;
  contactId: string;
}): Promise<boolean> {
  const scope = await resolveDealViewerScope(params.userId, params.userRole);
  if (await assertDealIdReadableOrAssignedParticipant(params.dealId, scope)) {
    return true;
  }

  const emailNorm = await resolveLpViewerEmailNorm(
    params.userId,
    params.userEmail,
  );
  if (!emailNorm.includes("@")) return false;

  const keys = await resolvePortalUserContactKeysOnDeal(params.dealId, {
    email: emailNorm,
    userId: params.userId,
  });
  const viewerContact = await resolveInvestNowViewerContactOnDeal({
    dealId: params.dealId,
    viewerEmailNorm: emailNorm,
    viewerUserId: params.userId,
  });
  return viewerOwnsContactKey(
    params.contactId,
    keys,
    viewerContact.contactMemberId,
  );
}

/**
 * GET /api/v1/investments/:investmentId/sign-status
 * Webhook-backed Dropbox Sign workflow for Invest Now step 5.
 */
export async function getInvestmentSignStatusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const investmentId =
    typeof req.params.investmentId === "string"
      ? req.params.investmentId
      : req.params.investmentId?.[0];
  if (!investmentId?.trim()) {
    res.status(400).json({ message: "Missing investment id" });
    return;
  }

  const email = await resolveLpViewerEmailNorm(user.id, user.email);
  if (!email.includes("@")) {
    res.status(400).json({ message: "Your account has no email on file" });
    return;
  }

  try {
    const [inv] = await db
      .select({
        dealId: dealInvestment.dealId,
        contactId: dealInvestment.contactId,
      })
      .from(dealInvestment)
      .where(eq(dealInvestment.id, investmentId.trim()))
      .limit(1);

    if (!inv?.dealId) {
      res.status(404).json({ message: "Investment not found" });
      return;
    }

    const allowed = await viewerMayReadInvestmentSignStatus({
      userId: user.id,
      userEmail: email,
      userRole: user.userRole,
      dealId: inv.dealId,
      contactId: String(inv.contactId ?? ""),
    });
    if (!allowed) {
      res.status(404).json({ message: "Investment not found" });
      return;
    }

    const status = await getInvestmentSignStatus(investmentId.trim());
    if (!status) {
      const empty: InvestmentSignStatusApi = {
        status: "Sent",
        sent_at: null,
        viewed_at: null,
        signed_at: null,
        completed_at: null,
        signature_request_id: null,
      };
      res.status(200).json(empty);
      return;
    }

    res.status(200).json(status);
  } catch (err) {
    console.error("getInvestmentSignStatusHandler:", err);
    res.status(500).json({ message: "Could not load sign status" });
  }
}

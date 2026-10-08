import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import { resolveLpViewerEmailNorm } from "../../services/deal/dealLpViewerIdentity.service.js";
import {
  createInvestorCheckoutSession,
  syncInvestorCheckoutSession,
} from "../../services/payments/investorCheckout.service.js";

function param(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

function bodyString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** POST /deals/:dealId/investments/:investmentId/checkout */
export async function postInvestorInvestmentCheckout(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId = param(req.params.dealId);
  const investmentId = param(req.params.investmentId);
  const email = await resolveLpViewerEmailNorm(user.id, user.email);
  const result = await createInvestorCheckoutSession({
    dealId,
    investmentId,
    investorUserId: user.id,
    investorEmail: email,
  });
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.status(200).json({
    url: result.url,
    sessionId: result.sessionId,
    paymentStatus: result.paymentStatus,
  });
}

/** POST /investing/investment-payments/sync-checkout */
export async function postInvestorInvestmentCheckoutSync(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sessionId = bodyString(body.sessionId ?? body.session_id);
  const result = await syncInvestorCheckoutSession({
    sessionId,
    investorUserId: user.id,
  });
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.status(200).json({ paymentStatus: result.paymentStatus });
}

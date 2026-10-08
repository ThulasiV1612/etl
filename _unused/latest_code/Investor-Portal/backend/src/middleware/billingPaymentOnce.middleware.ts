import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../database/db.js";
import { addDealForm } from "../schema/schema.js";
import {
  dealPaidPlanNeedsUpgrade,
  normalizeDealId,
  suggestedPlanIdForDeal,
} from "../services/billing/dealBilling.service.js";
import {
  acquireBillingPaymentHold,
  billingPaymentLockKey,
  finishBillingPaymentHold,
  releaseBillingPaymentHold,
} from "./billingPaymentLock.js";

const ALREADY_BILLED = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
]);

function paramStr(v: string | string[] | undefined): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim() : "";
}

function bodyString(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function dealIdFromRequest(req: Request): string {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return bodyString(
    body.dealId ?? body.deal_id ?? req.query.dealId ?? req.query.deal_id,
  );
}

/**
 * Block a second charge when the deal already has an open SaaS subscription.
 */
export async function billingAlreadyPaidMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const companyId = normalizeDealId(paramStr(req.params.companyId));
  const dealId = normalizeDealId(dealIdFromRequest(req));
  if (!companyId || !dealId) {
    next();
    return;
  }

  try {
    const [deal] = await db
      .select({
        organizationId: addDealForm.organizationId,
        stripeSubscriptionId: addDealForm.stripeSubscriptionId,
        stripeSubscriptionStatus: addDealForm.stripeSubscriptionStatus,
        stripePlanId: addDealForm.stripePlanId,
      })
      .from(addDealForm)
      .where(eq(addDealForm.id, dealId))
      .limit(1);

    if (
      !deal ||
      normalizeDealId(String(deal.organizationId ?? "")) !== companyId
    ) {
      next();
      return;
    }

    const status = String(deal.stripeSubscriptionStatus ?? "").toLowerCase();
    if (deal.stripeSubscriptionId?.trim() && ALREADY_BILLED.has(status)) {
      const suggested = await suggestedPlanIdForDeal(dealId);
      if (dealPaidPlanNeedsUpgrade(deal.stripePlanId, suggested)) {
        next();
        return;
      }
      res.status(409).json({
        message:
          "This deal is already paid. A second payment cannot be started.",
      });
      return;
    }
  } catch (err) {
    console.warn("billingAlreadyPaidMiddleware:", err);
  }

  next();
}

/**
 * Allow only one in-flight payment start per deal (double-click / parallel tabs).
 * The hold is released when the request finishes so an unpaid deal can still
 * complete Checkout via Upgrade plan or a retry.
 */
export function billingPaymentOnceMiddleware(
  keepPendingAfterSuccess = false,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const companyId = normalizeDealId(paramStr(req.params.companyId));
    const dealId = normalizeDealId(dealIdFromRequest(req));
    if (!companyId || !dealId) {
      next();
      return;
    }

    const key = billingPaymentLockKey(companyId, dealId);
    if (!acquireBillingPaymentHold(key)) {
      res.status(409).json({
        message:
          "A payment is already in progress for this deal. Finish that one before starting another.",
      });
      return;
    }

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      const code = res.statusCode || 0;
      const succeeded = res.writableEnded && code >= 200 && code < 300;
      finishBillingPaymentHold(
        key,
        succeeded ? code : 0,
        keepPendingAfterSuccess && succeeded,
      );
    };
    res.once("finish", settle);
    res.once("close", settle);
    next();
  };
}

/** Drop the pending hold after checkout / payment sync finishes. */
export function billingPaymentReleaseMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const companyId = paramStr(req.params.companyId);
  const dealId = dealIdFromRequest(req);
  if (companyId && dealId) {
    releaseBillingPaymentHold(companyId, dealId);
  }
  next();
}

import { getStripeConfig } from "../../config/stripe.config.js";
import { normalizeDealStageCanonical } from "../../constants/deal-lifecycle/deal-stage.js";
import type { AddDealFormRow } from "../../schema/deal.schema/add-deal-form.schema.js";

const PAID_SAAS_STATUSES = new Set(["active", "trialing"]);

export function isSaasBillableDealStage(
  raw: string | null | undefined,
): boolean {
  const stage = normalizeDealStageCanonical(raw);
  return stage === "capital_raising" || stage === "asset_managing";
}

export function dealSaasPaymentIsComplete(
  row:
    | Pick<AddDealFormRow, "stripeSubscriptionId" | "stripeSubscriptionStatus">
    | null
    | undefined,
): boolean {
  if (!row) return false;
  return (
    Boolean(row.stripeSubscriptionId?.trim()) &&
    PAID_SAAS_STATUSES.has(
      String(row.stripeSubscriptionStatus ?? "none").toLowerCase(),
    )
  );
}

/**
 * Unpaid deals stay Draft until Stripe SaaS payment succeeds.
 * When Stripe is not configured (local/dev), the requested stage is stored.
 */
export function resolveDealStageForSaasPaymentHold(params: {
  requestedStage: string;
  existing?: Pick<
    AddDealFormRow,
    "dealStage" | "stripeSubscriptionId" | "stripeSubscriptionStatus"
  > | null;
}): { persistStage: string; pendingDealStage: string | null } {
  const requestedCanon = normalizeDealStageCanonical(params.requestedStage);
  const existingCanon = normalizeDealStageCanonical(params.existing?.dealStage);
  const paid = dealSaasPaymentIsComplete(params.existing);

  if (!getStripeConfig() || paid) {
    return { persistStage: params.requestedStage, pendingDealStage: null };
  }

  if (isSaasBillableDealStage(requestedCanon)) {
    if (isSaasBillableDealStage(existingCanon) && params.existing) {
      return {
        persistStage: params.existing.dealStage,
        pendingDealStage: null,
      };
    }
    return {
      persistStage: "draft",
      pendingDealStage: requestedCanon,
    };
  }

  return { persistStage: params.requestedStage, pendingDealStage: null };
}

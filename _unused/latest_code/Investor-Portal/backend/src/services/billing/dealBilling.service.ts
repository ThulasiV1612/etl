import Stripe from "stripe";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
  addDealForm,
  companies,
  companyBillingInvoices,
  dealInvestorClass,
  type AddDealFormRow,
} from "../../schema/schema.js";
import { listDealIdsWhereViewerIsLeadSponsor } from "../deal/dealMemberScope.service.js";
import { normalizeDealStageCanonical } from "../../constants/deal-lifecycle/deal-stage.js";
import { resolveOfferingStatusForStageChange } from "../../constants/deal-lifecycle/deal-status-rules.js";
import {
  dealSaasPaymentIsComplete,
  isSaasBillableDealStage,
} from "./dealStageSaasPaymentHold.js";
import {
  getStripeConfig,
  normalizeBillingPlanId,
  normalizeBillingSeatBand,
  planAndCycleFromPriceId,
  requireStripeConfig,
  resolveStripePriceId,
  type StripeBillingCycle,
  type StripeBillingPlanId,
  type StripeBillingSeatBand,
} from "../../config/stripe.config.js";
import {
  creditExtraCompanyUsersPaid,
  extraCompanyUsersToCharge,
  getDealCompanyUserSnapshot,
  parseExtraCompanyUsersQuantity,
  attachExtraCompanyUserInvoiceItems,
} from "./dealExtraCompanyUser.service.js";
import { notifyLeadSponsorsOfDealPlanUpgrade } from "./dealPlanUpgradeAlert.service.js";
import { HARDCODED_SAAS_BILLING_STARTS_AT } from "./saasBillingStartDate.js";

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  const cfg = requireStripeConfig();
  if (!stripeClient) {
    stripeClient = new Stripe(cfg.secretKey, {
      apiVersion: "2026-06-24.dahlia",
    });
  }
  return stripeClient;
}

const DEAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STARTER_MAX_CENTS = 3_000_000;
const RUNNING_MAX_CENTS = 5_000_000;

const BILLING_PLAN_RANK: Record<StripeBillingPlanId, number> = {
  starter: 1,
  running: 2,
  growth: 3,
};

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);
/** Workspace view/edit requires a current paid period — failed renewals lock the deal. */
const PAID_ACCESS_STATUSES = new Set(["active", "trialing"]);
export const DEAL_SAAS_PAYMENT_REQUIRED = "DEAL_SAAS_PAYMENT_REQUIRED";

export type DealSaasLockReason = "unpaid" | "expired" | "past_due";

export type DealSaasAccessEvaluation = {
  locked: boolean;
  reason: DealSaasLockReason | null;
};

export type DealSaasPaymentRequiredPayload = {
  code: typeof DEAL_SAAS_PAYMENT_REQUIRED;
  message: string;
  reason: DealSaasLockReason;
  dealId: string;
  dealName: string;
  organizationId: string | null;
  nextBillingDate: string | null;
  billingSubscriptionStatus: string;
  billingPlanId: string | null;
  viewerIsLeadSponsor?: boolean;
};

export type DealSaasBillingListFields = {
  viewerIsLeadSponsor: true;
  nextBillingDate: string | null;
  saasBillingStartsAt: string | null;
  billingSubscriptionStatus: string;
  billingPlanId: string | null;
  suggestedPlanId: string | null;
  needsPlanUpgrade: boolean;
  billingAccessLocked: boolean;
  billingLockReason: DealSaasLockReason | null;
};

export function normalizeDealId(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return DEAL_UUID_RE.test(s) ? s : null;
}

export function isDealSaasBillable(
  row: Pick<AddDealFormRow, "archived" | "dealStage">,
): boolean {
  if (row.archived) return false;
  const stage = normalizeDealStageCanonical(row.dealStage);
  return stage === "capital_raising" || stage === "asset_managing";
}

function parseMoneyAmount(raw: string | null | undefined): number {
  const n = Number.parseFloat(String(raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Starter ≤ $3M, Running ≤ $5M, Growth ≤ $10M — custom above $11M. */
export function planIdForDealRaiseAmount(
  raiseAmount: number,
): StripeBillingPlanId {
  if (raiseAmount > RUNNING_MAX_CENTS) return "growth";
  if (raiseAmount > STARTER_MAX_CENTS) return "running";
  return "starter";
}

export function billingPlanRank(
  planId: string | null | undefined,
): number {
  const id = normalizeBillingPlanId(planId);
  return id ? BILLING_PLAN_RANK[id] : 0;
}

function dealShouldAlertPlanUpgrade(
  row: Pick<
    AddDealFormRow,
    | "archived"
    | "dealStage"
    | "stripeSubscriptionId"
    | "stripeSubscriptionStatus"
    | "stripePlanId"
    | "saasBillingStartsAt"
  >,
  suggestedPlanId: string | null | undefined,
): boolean {
  if (!saasBillingHasStarted(row)) return false;
  if (!dealIsActivelyBilled(row)) return false;
  return dealPaidPlanNeedsUpgrade(row.stripePlanId, suggestedPlanId);
}

/** True when the paid plan is below the plan required by current deal size. */
export function dealPaidPlanNeedsUpgrade(
  currentPlanId: string | null | undefined,
  suggestedPlanId: string | null | undefined,
): boolean {
  const current = normalizeBillingPlanId(currentPlanId);
  const suggested = normalizeBillingPlanId(suggestedPlanId);
  if (!current || !suggested) return false;
  return BILLING_PLAN_RANK[suggested] > BILLING_PLAN_RANK[current];
}

export async function suggestedPlanIdForDeal(
  dealId: string,
): Promise<StripeBillingPlanId> {
  const raise = await raiseAmountForDeal(dealId);
  return planIdForDealRaiseAmount(raise);
}

export async function assertCheckoutPlanMatchesDeal(params: {
  dealId: string;
  planId: StripeBillingPlanId;
}): Promise<
  | { ok: true; suggestedPlanId: StripeBillingPlanId }
  | { ok: false; status: number; message: string }
> {
  const suggestedPlanId = await suggestedPlanIdForDeal(params.dealId);
  if (params.planId !== suggestedPlanId) {
    const label =
      suggestedPlanId.charAt(0).toUpperCase() + suggestedPlanId.slice(1);
    return {
      ok: false,
      status: 400,
      message: `${label} is the plan for this deal.`,
    };
  }
  return { ok: true, suggestedPlanId };
}

async function raiseAmountForDeal(dealId: string): Promise<number> {
  const classes = await db
    .select({
      offeringSize: dealInvestorClass.offeringSize,
      billingRaiseQuota: dealInvestorClass.billingRaiseQuota,
    })
    .from(dealInvestorClass)
    .where(eq(dealInvestorClass.dealId, dealId));
  let offering = 0;
  let quota = 0;
  for (const c of classes) {
    offering += parseMoneyAmount(c.offeringSize);
    quota += parseMoneyAmount(c.billingRaiseQuota);
  }
  return quota > 0 ? quota : offering;
}

function unixSecondsToDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (value && typeof value === "object" && "end" in value) {
    return unixSecondsToDate((value as { end?: unknown }).end);
  }
  return null;
}

/** Stripe Basil+: period end lives on subscription items (and nested current_period). */
export function periodEndFromSubscription(sub: Stripe.Subscription): Date | null {
  const item = sub.items?.data?.[0] as
    | {
        current_period_end?: number;
        current_period?: { end?: number } | number;
      }
    | undefined;
  const legacy = (sub as { current_period_end?: number }).current_period_end;
  return (
    unixSecondsToDate(item?.current_period_end) ??
    unixSecondsToDate(item?.current_period) ??
    unixSecondsToDate(legacy)
  );
}

function priceIdFromSubscription(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  if (!price) return null;
  return typeof price === "string" ? price : price.id;
}

function planCycleSeatFromSubscription(sub: Stripe.Subscription): {
  planId: StripeBillingPlanId | null;
  cycle: StripeBillingCycle | null;
  seatBand: StripeBillingSeatBand | null;
} {
  const priceId = priceIdFromSubscription(sub);
  const mapped = planAndCycleFromPriceId(priceId);
  const metaPlan = normalizeBillingPlanId(sub.metadata?.planId);
  const metaCycleRaw = String(sub.metadata?.billingCycle ?? "").trim();
  const metaCycle: StripeBillingCycle | null =
    metaCycleRaw === "monthly"
      ? "monthly"
      : metaCycleRaw === "annual" ||
          metaCycleRaw === "annually" ||
          metaCycleRaw === "yearly"
        ? "annual"
        : null;
  const metaSeat = normalizeBillingSeatBand(sub.metadata?.seatBand);
  return {
    planId: mapped.planId ?? metaPlan,
    cycle: mapped.cycle ?? metaCycle,
    seatBand: mapped.seatBand ?? metaSeat,
  };
}

function periodEndIso(
  row: Pick<AddDealFormRow, "stripeCurrentPeriodEnd">,
): string | null {
  return row.stripeCurrentPeriodEnd
    ? row.stripeCurrentPeriodEnd.toISOString()
    : null;
}

function periodEndHasPassed(
  row: Pick<AddDealFormRow, "stripeCurrentPeriodEnd">,
  nowMs = Date.now(),
): boolean {
  const end = row.stripeCurrentPeriodEnd;
  if (!end) return false;
  const t = end instanceof Date ? end.getTime() : Date.parse(String(end));
  return Number.isFinite(t) && t < nowMs;
}

function billingStartsAtDate(
  _row?: Pick<AddDealFormRow, "saasBillingStartsAt">,
): Date {
  // Date picker is off: always use backend/src/services/billing/saasBillingStartDate.ts
  return HARDCODED_SAAS_BILLING_STARTS_AT;
}

function saasBillingHasStarted(
  row: Pick<AddDealFormRow, "saasBillingStartsAt">,
  nowMs = Date.now(),
): boolean {
  return periodEndHasPassed(
    { stripeCurrentPeriodEnd: billingStartsAtDate(row) },
    nowMs,
  );
}

export async function ensureDealSaasComplimentaryPeriod(
  deal: Pick<
    AddDealFormRow,
    | "id"
    | "archived"
    | "dealStage"
    | "stripeSubscriptionId"
    | "saasBillingStartsAt"
    | "organizationId"
  >,
): Promise<Date | null> {
  if (!isDealSaasBillable(deal)) return deal.saasBillingStartsAt ?? null;
  const startsAt = HARDCODED_SAAS_BILLING_STARTS_AT;
  if (
    deal.saasBillingStartsAt &&
    deal.saasBillingStartsAt.getTime() === startsAt.getTime()
  ) {
    return deal.saasBillingStartsAt;
  }
  const id = normalizeDealId(String(deal.id));
  if (!id) return startsAt;
  await db
    .update(addDealForm)
    .set({ saasBillingStartsAt: startsAt })
    .where(eq(addDealForm.id, id));
  return startsAt;
}

export async function getPlatformSaasBillingStartsAt(): Promise<Date | null> {
  const alert = await getPlatformSaasBillingStartAlert();
  return alert.startsAt;
}

export async function getPlatformSaasBillingStartAlert(): Promise<{
  startsAt: Date | null;
  updatedAt: Date | null;
}> {
  return {
    startsAt: HARDCODED_SAAS_BILLING_STARTS_AT,
    updatedAt: HARDCODED_SAAS_BILLING_STARTS_AT,
  };
}

export async function getPlatformSaasBillingStartsAtIso(): Promise<
  string | null
> {
  const startsAt = await getPlatformSaasBillingStartsAt();
  return startsAt ? startsAt.toISOString() : null;
}

/**
 * Until the hardcoded SaaS billing start date the workspace stays open.
 * After that date, unpaid / past-due / expired MRR locks view and edit.
 * Draft, archived, and liquidated are free. Stripe unset → no gate.
 */
export function evaluateDealSaasWorkspaceAccess(
  row: Pick<
    AddDealFormRow,
    | "archived"
    | "dealStage"
    | "stripeSubscriptionId"
    | "stripeSubscriptionStatus"
    | "stripeCurrentPeriodEnd"
    | "saasBillingStartsAt"
  >,
): DealSaasAccessEvaluation {
  if (!getStripeConfig()) return { locked: false, reason: null };
  if (!isDealSaasBillable(row)) return { locked: false, reason: null };
  if (!saasBillingHasStarted(row)) return { locked: false, reason: null };

  const status = String(row.stripeSubscriptionStatus ?? "none").toLowerCase();
  const expired = periodEndHasPassed(row);
  const hasSub = Boolean(row.stripeSubscriptionId?.trim());
  const paidStatus = PAID_ACCESS_STATUSES.has(status);

  // Stripe status is the source of truth. A missing/stale period-end timestamp
  // must not keep the deal locked after the lead sponsor has paid.
  if (hasSub && paidStatus) {
    return { locked: false, reason: null };
  }
  if (hasSub && (status === "past_due" || status === "unpaid")) {
    return { locked: true, reason: "past_due" };
  }
  if (hasSub && expired) return { locked: true, reason: "expired" };
  return { locked: true, reason: "unpaid" };
}

export function dealSaasPaymentRequiredMessage(
  reason: DealSaasLockReason,
  dealName?: string | null,
): string {
  const label = String(dealName ?? "").trim()
    ? `“${String(dealName).trim()}”`
    : "this deal";
  if (reason === "expired") {
    return `The billing period for ${label} has ended. Pay monthly SaaS (MRR) to continue.`;
  }
  if (reason === "past_due") {
    return `Monthly SaaS (MRR) for ${label} is past due. Pay now to continue.`;
  }
  return `Pay monthly SaaS (MRR) for ${label} to continue.`;
}

export function dealSaasPaymentRequiredPayload(
  row: AddDealFormRow,
  access?: DealSaasAccessEvaluation,
  extras?: { viewerIsLeadSponsor?: boolean },
): DealSaasPaymentRequiredPayload {
  const evaluated = access ?? evaluateDealSaasWorkspaceAccess(row);
  const reason: DealSaasLockReason = evaluated.reason ?? "unpaid";
  return {
    code: DEAL_SAAS_PAYMENT_REQUIRED,
    message: dealSaasPaymentRequiredMessage(reason, row.dealName),
    reason,
    dealId: String(row.id),
    dealName: row.dealName ?? "",
    organizationId: row.organizationId ? String(row.organizationId) : null,
    nextBillingDate: nextBillingDateForList(row),
    billingSubscriptionStatus: row.stripeSubscriptionStatus || "none",
    billingPlanId: row.stripePlanId ?? null,
    viewerIsLeadSponsor: extras?.viewerIsLeadSponsor === true,
  };
}

function nextBillingDateForList(
  row: Pick<
    AddDealFormRow,
    | "archived"
    | "dealStage"
    | "stripeSubscriptionId"
    | "stripeSubscriptionStatus"
    | "stripeCurrentPeriodEnd"
    | "saasBillingStartsAt"
  >,
): string | null {
  if (!isDealSaasBillable(row)) return periodEndIso(row);
  const status = String(row.stripeSubscriptionStatus ?? "none").toLowerCase();
  const activelyBilled =
    dealIsActivelyBilled(row) ||
    PAID_ACCESS_STATUSES.has(status) ||
    ACTIVE_SUB_STATUSES.has(status);
  // Hardcoded platform date is only the first due date. After the lead
  // sponsor is on a Stripe subscription, show the real current-period end.
  if (activelyBilled) {
    return periodEndIso(row);
  }
  if (!saasBillingHasStarted(row)) {
    return billingStartsAtDate(row).toISOString();
  }
  // Unpaid after the SaaS start date: due now. Do not surface a leftover
  // Stripe current_period_end as if payment is still in the complimentary window.
  return billingStartsAtDate(row).toISOString();
}

export async function dealSaasBillingListFields(
  row: AddDealFormRow,
): Promise<DealSaasBillingListFields> {
  const access = evaluateDealSaasWorkspaceAccess(row);
  if (
    isDealSaasBillable(row) &&
    !row.saasBillingStartsAt
  ) {
    void ensureDealSaasComplimentaryPeriod(row).catch((err) => {
      console.warn("ensureDealSaasComplimentaryPeriod:", row.id, err);
    });
  }
  const billable = isDealSaasBillable(row);
  const suggestedPlanId = billable
    ? await suggestedPlanIdForDeal(String(row.id))
    : null;
  const billed = dealIsActivelyBilled(row);
  return {
    viewerIsLeadSponsor: true,
    nextBillingDate: nextBillingDateForList(row),
    saasBillingStartsAt: HARDCODED_SAAS_BILLING_STARTS_AT.toISOString(),
    billingSubscriptionStatus: row.stripeSubscriptionStatus || "none",
    billingPlanId: row.stripePlanId ?? null,
    suggestedPlanId,
    needsPlanUpgrade: dealShouldAlertPlanUpgrade(row, suggestedPlanId),
    billingAccessLocked: access.locked,
    billingLockReason: access.reason,
  };
}

async function subscriptionWithPeriodFields(
  sub: Stripe.Subscription,
): Promise<Stripe.Subscription> {
  if (periodEndFromSubscription(sub) && sub.items?.data?.[0]) return sub;
  if (!getStripeConfig()) return sub;
  try {
    return await getStripeClient().subscriptions.retrieve(sub.id, {
      expand: ["items.data.price"],
    });
  } catch (err) {
    console.warn("subscriptionWithPeriodFields:", sub.id, err);
    return sub;
  }
}

/**
 * After Stripe SaaS payment succeeds, move Draft → pending Capital Raising
 * (or Asset Managing) and clear `pending_deal_stage`.
 */
export async function promotePendingDealStageAfterSaasPayment(
  dealId: string,
): Promise<void> {
  const id = normalizeDealId(dealId);
  if (!id) return;
  const [deal] = await db
    .select({
      dealStage: addDealForm.dealStage,
      pendingDealStage: addDealForm.pendingDealStage,
      offeringStatus: addDealForm.offeringStatus,
      stripeSubscriptionId: addDealForm.stripeSubscriptionId,
      stripeSubscriptionStatus: addDealForm.stripeSubscriptionStatus,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, id))
    .limit(1);
  if (!deal || !dealSaasPaymentIsComplete(deal)) return;
  const pending = normalizeDealStageCanonical(deal.pendingDealStage);
  if (!isSaasBillableDealStage(pending) || !pending) return;
  if (normalizeDealStageCanonical(deal.dealStage) === pending) {
    await db
      .update(addDealForm)
      .set({ pendingDealStage: null })
      .where(eq(addDealForm.id, id));
    return;
  }
  const offeringStatus = resolveOfferingStatusForStageChange({
    nextStage: pending,
    currentStatus: deal.offeringStatus,
  });
  const candidates =
    pending === "capital_raising"
      ? ["raising_capital", "capital_raising"]
      : ["asset_managing", "managing_asset"];
  let lastErr: unknown = null;
  for (const stage of candidates) {
    try {
      await db
        .update(addDealForm)
        .set({
          dealStage: stage,
          pendingDealStage: null,
          offeringStatus,
        })
        .where(eq(addDealForm.id, id));
      return;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("check") || stage === candidates[candidates.length - 1]) {
        throw err;
      }
    }
  }
  if (lastErr) throw lastErr;
}

export async function applyStripeSubscriptionToDeal(
  dealId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const id = normalizeDealId(dealId);
  if (!id) return;
  const fresh = await subscriptionWithPeriodFields(sub);
  const mapped = planCycleSeatFromSubscription(fresh);
  const status = String(fresh.status ?? "none");
  await db
    .update(addDealForm)
    .set({
      stripeSubscriptionId: fresh.id,
      stripePlanId: mapped.planId,
      stripeBillingCycle: mapped.cycle,
      stripeSubscriptionStatus: status || "none",
      stripePriceId: priceIdFromSubscription(fresh),
      stripeCurrentPeriodEnd: periodEndFromSubscription(fresh),
    })
    .where(eq(addDealForm.id, id));
  const extraUsers = parseExtraCompanyUsersQuantity(
    fresh.metadata?.extraCompanyUsers ?? sub.metadata?.extraCompanyUsers,
  );
  if (extraUsers > 0 && (status === "active" || status === "trialing")) {
    await creditExtraCompanyUsersPaid({
      dealId: id,
      quantity: extraUsers,
      paymentRef: fresh.id,
    });
  }
  if (PAID_ACCESS_STATUSES.has(status.toLowerCase())) {
    await promotePendingDealStageAfterSaasPayment(id);
  }
}

export async function clearDealSaasSubscription(dealId: string): Promise<void> {
  const id = normalizeDealId(dealId);
  if (!id) return;
  const [deal] = await db
    .select({
      archived: addDealForm.archived,
      dealStage: addDealForm.dealStage,
      stripeCurrentPeriodEnd: addDealForm.stripeCurrentPeriodEnd,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, id))
    .limit(1);
  const stillBillable = deal ? isDealSaasBillable(deal) : false;
  await db
    .update(addDealForm)
    .set({
      stripeSubscriptionId: null,
      stripePlanId: null,
      stripeBillingCycle: null,
      stripeSubscriptionStatus: stillBillable ? "none" : "canceled",
      stripePriceId: null,
      stripeCurrentPeriodEnd: stillBillable
        ? (deal?.stripeCurrentPeriodEnd ?? null)
        : null,
    })
    .where(eq(addDealForm.id, id));
}

/**
 * Re-read this deal's Stripe subscription so a just-completed payment unlocks
 * the workspace even if the webhook is a few seconds behind.
 */
export async function refreshDealSaasSubscriptionFromStripe(
  deal: Pick<AddDealFormRow, "id" | "stripeSubscriptionId">,
): Promise<AddDealFormRow | null> {
  const id = normalizeDealId(String(deal.id));
  const subId = deal.stripeSubscriptionId?.trim() ?? "";
  if (!id || !subId || !getStripeConfig()) {
    const [row] = id
      ? await db.select().from(addDealForm).where(eq(addDealForm.id, id)).limit(1)
      : [];
    return row ?? null;
  }
  try {
    const sub = await getStripeClient().subscriptions.retrieve(subId, {
      expand: ["items.data.price"],
    });
    const status = String(sub.status ?? "").toLowerCase();
    if (status === "canceled" || status === "incomplete_expired") {
      await clearDealSaasSubscription(id);
    } else {
      await applyStripeSubscriptionToDeal(id, sub);
    }
  } catch (err) {
    console.warn("refreshDealSaasSubscriptionFromStripe:", id, subId, err);
  }
  const [row] = await db
    .select()
    .from(addDealForm)
    .where(eq(addDealForm.id, id))
    .limit(1);
  return row ?? null;
}

export async function refreshDealSaasSubscriptionsFromStripe(
  companyId: string,
): Promise<void> {
  const cid = normalizeDealId(companyId);
  if (!cid || !getStripeConfig()) return;
  const stripe = getStripeClient();
  const deals = await db
    .select({
      id: addDealForm.id,
      stripeSubscriptionId: addDealForm.stripeSubscriptionId,
    })
    .from(addDealForm)
    .where(eq(addDealForm.organizationId, cid));
  for (const deal of deals) {
    const subId = deal.stripeSubscriptionId?.trim() ?? "";
    if (!subId) continue;
    try {
      const sub = await stripe.subscriptions.retrieve(subId, {
        expand: ["items.data.price"],
      });
      const status = String(sub.status ?? "").toLowerCase();
      if (status === "canceled" || status === "incomplete_expired") {
        await clearDealSaasSubscription(String(deal.id));
      } else {
        await applyStripeSubscriptionToDeal(String(deal.id), sub);
      }
    } catch (err) {
      console.warn(
        "refreshDealSaasSubscriptionsFromStripe:",
        deal.id,
        subId,
        err,
      );
    }
  }
  await refreshCompanyBillingFromDeals(cid);
}

export async function findDealIdForStripeSubscription(
  subscriptionId: string,
): Promise<string | null> {
  const id = String(subscriptionId ?? "").trim();
  if (!id) return null;
  const [row] = await db
    .select({ id: addDealForm.id, organizationId: addDealForm.organizationId })
    .from(addDealForm)
    .where(eq(addDealForm.stripeSubscriptionId, id))
    .limit(1);
  return row?.id ?? null;
}

export async function findCompanyIdForDealSubscription(
  subscriptionId: string,
): Promise<string | null> {
  const id = String(subscriptionId ?? "").trim();
  if (!id) return null;
  const [row] = await db
    .select({ organizationId: addDealForm.organizationId })
    .from(addDealForm)
    .where(eq(addDealForm.stripeSubscriptionId, id))
    .limit(1);
  return row?.organizationId ?? null;
}

async function cancelStripeSubscriptionQuietly(
  subscriptionId: string | null | undefined,
): Promise<void> {
  const id = String(subscriptionId ?? "").trim();
  if (!id || !getStripeConfig()) return;
  try {
    const stripe = getStripeClient();
    await stripe.subscriptions.cancel(id);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code ?? "")
        : "";
    if (code !== "resource_missing") {
      console.warn("cancelStripeSubscriptionQuietly:", id, err);
    }
  }
}

async function defaultPaymentMethodId(
  stripe: Stripe,
  customerId: string,
): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const def = customer.invoice_settings?.default_payment_method;
    const fromInvoice =
      typeof def === "string" ? def : def && typeof def === "object" ? def.id : null;
    if (fromInvoice?.trim()) return fromInvoice.trim();
    const fromCustomer =
      typeof customer.default_source === "string"
        ? customer.default_source
        : null;
    if (fromCustomer?.startsWith("pm_")) return fromCustomer;
  } catch (err) {
    console.warn("defaultPaymentMethodId retrieve customer:", err);
  }
  try {
    const listed = await stripe.paymentMethods.list({
      customer: customerId,
      limit: 5,
    });
    const first = listed.data.find((pm) => pm.id?.startsWith("pm_"));
    return first?.id ?? null;
  } catch (err) {
    console.warn("defaultPaymentMethodId list:", err);
    return null;
  }
}

type CompanyBillingDefaults = {
  customerId: string;
  cycle: StripeBillingCycle;
  seatBand: StripeBillingSeatBand;
};

async function companyBillingDefaults(
  companyId: string,
): Promise<CompanyBillingDefaults | null> {
  const [company] = await db
    .select({
      stripeCustomerId: companies.stripeCustomerId,
      stripeBillingCycle: companies.stripeBillingCycle,
      stripePriceId: companies.stripePriceId,
      stripeSubscriptionStatus: companies.stripeSubscriptionStatus,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const customerId = company?.stripeCustomerId?.trim() ?? "";
  if (!customerId) return null;
  const status = String(company?.stripeSubscriptionStatus ?? "none").toLowerCase();
  if (status === "none" && !company?.stripePriceId) {
    // Customer may exist from a SetupIntent with no paid plan yet.
  }
  const fromPrice = planAndCycleFromPriceId(company?.stripePriceId);
  const cycle: StripeBillingCycle =
    company?.stripeBillingCycle === "annual" ||
    company?.stripeBillingCycle === "annually" ||
    company?.stripeBillingCycle === "yearly"
      ? "annual"
      : fromPrice.cycle === "annual"
        ? "annual"
        : "monthly";
  const seatBand: StripeBillingSeatBand = fromPrice.seatBand ?? "5";
  return { customerId, cycle, seatBand };
}

async function listCompanyDeals(companyId: string): Promise<AddDealFormRow[]> {
  return db
    .select()
    .from(addDealForm)
    .where(eq(addDealForm.organizationId, companyId));
}

async function attachSubscriptionMetadataToDeal(
  sub: Stripe.Subscription,
  deal: AddDealFormRow,
  extras: {
    planId: StripeBillingPlanId;
    cycle: StripeBillingCycle;
    seatBand: StripeBillingSeatBand;
  },
): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  return stripe.subscriptions.update(sub.id, {
    metadata: {
      ...sub.metadata,
      companyId: String(deal.organizationId ?? ""),
      dealId: String(deal.id),
      dealName: deal.dealName ?? "",
      planId: extras.planId,
      billingCycle: extras.cycle,
      seatBand: extras.seatBand,
      billingScope: "deal",
    },
  });
}

export async function createDealStripeSubscription(params: {
  deal: AddDealFormRow;
  customerId: string;
  paymentMethodId: string;
  planId: StripeBillingPlanId;
  cycle: StripeBillingCycle;
  seatBand: StripeBillingSeatBand;
  payerUserId?: string;
  paymentBehavior?: Stripe.SubscriptionCreateParams.PaymentBehavior;
  extraCompanyUsers?: number;
}): Promise<Stripe.Subscription | null> {
  const priceId = resolveStripePriceId(
    params.planId,
    params.cycle,
    params.seatBand,
  );
  if (!priceId) {
    console.warn(
      "createDealStripeSubscription: missing price",
      params.planId,
      params.cycle,
      params.seatBand,
    );
    return null;
  }
  const snapshot = await getDealCompanyUserSnapshot(String(params.deal.id));
  const extraUsers = snapshot
    ? extraCompanyUsersToCharge(snapshot, params.extraCompanyUsers)
    : Math.max(0, Math.floor(params.extraCompanyUsers ?? 0));
  const stripe = getStripeClient();
  await attachExtraCompanyUserInvoiceItems({
    stripe,
    customerId: params.customerId,
    quantity: extraUsers,
    dealId: String(params.deal.id),
  });
  const sub = await stripe.subscriptions.create({
      customer: params.customerId,
      items: [{ price: priceId, quantity: 1 }],
      default_payment_method: params.paymentMethodId,
      ...(params.paymentBehavior
        ? { payment_behavior: params.paymentBehavior }
        : {}),
      metadata: {
        companyId: String(params.deal.organizationId ?? ""),
        dealId: String(params.deal.id),
        dealName: params.deal.dealName ?? "",
        planId: params.planId,
        billingCycle: params.cycle,
        seatBand: params.seatBand,
        billingScope: "deal",
        extraCompanyUsers: String(extraUsers),
        ...(params.payerUserId ? { payerUserId: params.payerUserId } : {}),
      },
    });
  const subStatus = String(sub.status ?? "").toLowerCase();
  if (
    extraUsers > 0 &&
    (subStatus === "active" || subStatus === "trialing")
  ) {
    await creditExtraCompanyUsersPaid({
      dealId: String(params.deal.id),
      quantity: extraUsers,
      paymentRef: sub.id,
    });
  }
  return sub;
}

export type UpgradeDealSubscriptionResult =
  | {
      ok: true;
      subscription: Stripe.Subscription;
      hostedInvoiceUrl: string | null;
      paid: boolean;
    }
  | { ok: false; status: number; message: string };

/**
 * Move an existing deal subscription to the plan required by current deal size.
 * Charges the proration on the default payment method when possible.
 */
export async function upgradeDealStripeSubscription(params: {
  deal: AddDealFormRow;
  planId: StripeBillingPlanId;
  cycle: StripeBillingCycle;
  seatBand: StripeBillingSeatBand;
  paymentMethodId?: string;
}): Promise<UpgradeDealSubscriptionResult> {
  const existingId = params.deal.stripeSubscriptionId?.trim() ?? "";
  if (!existingId) {
    return {
      ok: false,
      status: 400,
      message: "This deal does not have an active subscription to upgrade.",
    };
  }

  const match = await assertCheckoutPlanMatchesDeal({
    dealId: String(params.deal.id),
    planId: params.planId,
  });
  if (!match.ok) return match;
  if (!dealPaidPlanNeedsUpgrade(params.deal.stripePlanId, match.suggestedPlanId)) {
    return {
      ok: false,
      status: 409,
      message: "This deal is already on the plan required for its size.",
    };
  }

  const priceId = resolveStripePriceId(
    params.planId,
    params.cycle,
    params.seatBand,
  );
  if (!priceId) {
    return {
      ok: false,
      status: 503,
      message: `Stripe Price is not configured for ${params.planId} / ${params.seatBand} seats (${params.cycle}).`,
    };
  }

  const stripe = getStripeClient();
  try {
    const sub = await stripe.subscriptions.retrieve(existingId, {
      expand: ["items.data.price"],
    });
    const itemId = sub.items.data[0]?.id;
    if (!itemId) {
      return {
        ok: false,
        status: 502,
        message: "Could not find the current subscription price to upgrade.",
      };
    }

    if (params.paymentMethodId?.trim()) {
      await stripe.subscriptions.update(sub.id, {
        default_payment_method: params.paymentMethodId.trim(),
      });
    }

    const updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
      metadata: {
        ...sub.metadata,
        dealId: String(params.deal.id),
        dealName: params.deal.dealName ?? "",
        planId: params.planId,
        billingCycle: params.cycle,
        seatBand: params.seatBand,
        billingScope: "deal",
      },
      expand: ["latest_invoice"],
    });

    let invoice: Stripe.Invoice | null =
      updated.latest_invoice && typeof updated.latest_invoice === "object"
        ? updated.latest_invoice
        : null;
    if (!invoice && typeof updated.latest_invoice === "string") {
      invoice = await stripe.invoices.retrieve(updated.latest_invoice);
    }

    let hostedInvoiceUrl: string | null =
      invoice?.hosted_invoice_url?.trim() || null;
    let paid = String(updated.status ?? "").toLowerCase() === "active" ||
      String(updated.status ?? "").toLowerCase() === "trialing";

    if (invoice && (invoice.status === "draft" || invoice.status === "open")) {
      if (invoice.status === "draft") {
        invoice = await stripe.invoices.finalizeInvoice(invoice.id);
        hostedInvoiceUrl = invoice.hosted_invoice_url?.trim() || hostedInvoiceUrl;
      }
      if (invoice.status === "open" && (invoice.amount_due ?? 0) > 0) {
        try {
          invoice = await stripe.invoices.pay(invoice.id);
          paid =
            invoice.status === "paid" ||
            invoice.amount_remaining === 0;
          hostedInvoiceUrl =
            invoice.hosted_invoice_url?.trim() || hostedInvoiceUrl;
        } catch (payErr) {
          console.warn("upgradeDealStripeSubscription invoice pay:", payErr);
          paid = false;
          hostedInvoiceUrl =
            invoice.hosted_invoice_url?.trim() || hostedInvoiceUrl;
        }
      } else if ((invoice.amount_due ?? 0) <= 0) {
        paid = true;
      }
    }

    const fresh = await stripe.subscriptions.retrieve(updated.id);
    await applyStripeSubscriptionToDeal(String(params.deal.id), fresh);
    return {
      ok: true,
      subscription: fresh,
      hostedInvoiceUrl: paid ? null : hostedInvoiceUrl,
      paid,
    };
  } catch (err) {
    console.error("upgradeDealStripeSubscription:", err);
    const msg =
      err instanceof Error ? err.message : "Could not upgrade this deal’s plan.";
    return { ok: false, status: 502, message: msg };
  }
}

/**
 * Start, stop, or realign this deal's SaaS subscription.
 * No-ops when Stripe is unset or the company has no customer / payment method.
 */
export async function syncDealSaasBillingForDeal(
  dealId: string,
): Promise<void> {
  const id = normalizeDealId(dealId);
  if (!id || !getStripeConfig()) return;
  const [deal] = await db
    .select()
    .from(addDealForm)
    .where(eq(addDealForm.id, id))
    .limit(1);
  if (!deal) return;

  if (!isDealSaasBillable(deal)) {
    if (deal.stripeSubscriptionId?.trim()) {
      await cancelStripeSubscriptionQuietly(deal.stripeSubscriptionId);
      await clearDealSaasSubscription(id);
    } else if (deal.stripeCurrentPeriodEnd) {
      await db
        .update(addDealForm)
        .set({ stripeCurrentPeriodEnd: null })
        .where(eq(addDealForm.id, id));
    }
    return;
  }

  await ensureDealSaasComplimentaryPeriod(deal);

  const orgId = String(deal.organizationId ?? "").trim();
  if (!orgId) return;
  await syncCompanyDealSaasSubscriptions(orgId);
}

export function scheduleDealSaasBillingSync(dealId: string): void {
  const id = String(dealId ?? "").trim();
  if (!id) return;
  void syncDealSaasBillingForDeal(id)
    .then(() => notifyLeadSponsorsIfPaidPlanTooSmall(id))
    .catch((err) => {
      console.warn("scheduleDealSaasBillingSync:", id, err);
    });
}

async function notifyLeadSponsorsIfPaidPlanTooSmall(
  dealId: string,
): Promise<void> {
  const id = normalizeDealId(dealId);
  if (!id) return;
  const [deal] = await db
    .select({
      id: addDealForm.id,
      dealName: addDealForm.dealName,
      archived: addDealForm.archived,
      dealStage: addDealForm.dealStage,
      stripeSubscriptionId: addDealForm.stripeSubscriptionId,
      stripeSubscriptionStatus: addDealForm.stripeSubscriptionStatus,
      stripePlanId: addDealForm.stripePlanId,
      saasBillingStartsAt: addDealForm.saasBillingStartsAt,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, id))
    .limit(1);
  if (!deal) return;
  const suggested = await suggestedPlanIdForDeal(id);
  if (!dealShouldAlertPlanUpgrade(deal, suggested)) return;
  await notifyLeadSponsorsOfDealPlanUpgrade({
    dealId: id,
    dealName: deal.dealName ?? "",
    currentPlanId: String(deal.stripePlanId ?? ""),
    suggestedPlanId: suggested,
  });
}

export async function cancelDealSaasBillingBeforeDelete(
  dealId: string,
): Promise<void> {
  const id = normalizeDealId(dealId);
  if (!id || !getStripeConfig()) return;
  const [deal] = await db
    .select({
      stripeSubscriptionId: addDealForm.stripeSubscriptionId,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, id))
    .limit(1);
  if (deal?.stripeSubscriptionId?.trim()) {
    await cancelStripeSubscriptionQuietly(deal.stripeSubscriptionId);
  }
}

/**
 * Align Stripe subscriptions with the company's currently billable deals.
 * Reuses an unassigned company-level subscription for the first billable deal.
 */
export async function syncCompanyDealSaasSubscriptions(
  companyId: string,
): Promise<void> {
  const cid = normalizeDealId(companyId);
  if (!cid || !getStripeConfig()) return;

  const defaults = await companyBillingDefaults(cid);
  if (!defaults) return;

  const stripe = getStripeClient();
  const deals = await listCompanyDeals(cid);
  const billable = deals.filter((d) => isDealSaasBillable(d));
  const notBillable = deals.filter((d) => !isDealSaasBillable(d));

  for (const deal of notBillable) {
    if (!deal.stripeSubscriptionId?.trim()) continue;
    await cancelStripeSubscriptionQuietly(deal.stripeSubscriptionId);
    await clearDealSaasSubscription(String(deal.id));
  }

  const [company] = await db
    .select({
      stripeSubscriptionId: companies.stripeSubscriptionId,
      stripeSubscriptionStatus: companies.stripeSubscriptionStatus,
    })
    .from(companies)
    .where(eq(companies.id, cid))
    .limit(1);

  let unassignedSub: Stripe.Subscription | null = null;
  const companySubId = company?.stripeSubscriptionId?.trim() ?? "";
  if (companySubId) {
    const claimed = billable.some(
      (d) => d.stripeSubscriptionId?.trim() === companySubId,
    );
    if (!claimed) {
      try {
        const sub = await stripe.subscriptions.retrieve(companySubId);
        const metaDeal = normalizeDealId(sub.metadata?.dealId);
        const alreadyOnADeal = billable.some(
          (d) => String(d.id) === (metaDeal ?? ""),
        );
        if (
          !sub.status ||
          ["canceled", "incomplete_expired", "unpaid"].includes(sub.status)
        ) {
          unassignedSub = null;
        } else if (!metaDeal || !alreadyOnADeal) {
          unassignedSub = sub;
        }
      } catch (err) {
        console.warn("syncCompanyDealSaasSubscriptions retrieve company sub:", err);
      }
    }
  }

  for (const deal of billable) {
    const raise = await raiseAmountForDeal(String(deal.id));
    const planId = planIdForDealRaiseAmount(raise);
    const existingId = deal.stripeSubscriptionId?.trim() ?? "";

    if (existingId) {
      try {
        const sub = await stripe.subscriptions.retrieve(existingId);
        if (sub.status === "canceled" || sub.status === "incomplete_expired") {
          await clearDealSaasSubscription(String(deal.id));
        } else {
          const mapped = planCycleSeatFromSubscription(sub);
          if (!normalizeDealId(sub.metadata?.dealId)) {
            await attachSubscriptionMetadataToDeal(sub, deal, {
              planId: mapped.planId ?? planId,
              cycle: mapped.cycle ?? defaults.cycle,
              seatBand: mapped.seatBand ?? defaults.seatBand,
            });
          }
          const fresh = await stripe.subscriptions.retrieve(existingId);
          await applyStripeSubscriptionToDeal(String(deal.id), fresh);
          continue;
        }
      } catch (err) {
        console.warn("syncCompanyDealSaasSubscriptions existing sub:", err);
        await clearDealSaasSubscription(String(deal.id));
      }
    }

    if (unassignedSub) {
      const metaDealId = normalizeDealId(unassignedSub.metadata?.dealId);
      if (metaDealId && metaDealId !== String(deal.id)) {
        continue;
      }
      if (!metaDealId) {
        // Legacy company-level checkout: attach once, then stop. Additional
        // deals are paid by their lead sponsor via Checkout.
        continue;
      }
      const mapped = planCycleSeatFromSubscription(unassignedSub);
      const updated = await attachSubscriptionMetadataToDeal(
        unassignedSub,
        deal,
        {
          planId,
          cycle: mapped.cycle ?? defaults.cycle,
          seatBand: mapped.seatBand ?? defaults.seatBand,
        },
      );
      const priceId = resolveStripePriceId(
        planId,
        mapped.cycle ?? defaults.cycle,
        mapped.seatBand ?? defaults.seatBand,
      );
      const currentPrice = priceIdFromSubscription(updated);
      if (priceId && currentPrice && priceId !== currentPrice) {
        const itemId = updated.items.data[0]?.id;
        if (itemId) {
          await stripe.subscriptions.update(updated.id, {
            items: [{ id: itemId, price: priceId }],
            proration_behavior: "create_prorations",
          });
        }
      }
      const fresh = await stripe.subscriptions.retrieve(updated.id);
      await applyStripeSubscriptionToDeal(String(deal.id), fresh);
      unassignedSub = null;
      continue;
    }

    // Lead sponsors pay MRR per deal via Checkout — do not auto-charge the
    // company default payment method for new billable deals.
    await ensureDealSaasComplimentaryPeriod(deal);
  }

  await refreshCompanyBillingFromDeals(cid);
}

export async function refreshCompanyBillingFromDeals(
  companyId: string,
): Promise<void> {
  const cid = normalizeDealId(companyId);
  if (!cid) return;
  const deals = await db
    .select({
      stripeSubscriptionId: addDealForm.stripeSubscriptionId,
      stripeSubscriptionStatus: addDealForm.stripeSubscriptionStatus,
      stripeCurrentPeriodEnd: addDealForm.stripeCurrentPeriodEnd,
      stripePlanId: addDealForm.stripePlanId,
      stripeBillingCycle: addDealForm.stripeBillingCycle,
      stripePriceId: addDealForm.stripePriceId,
      archived: addDealForm.archived,
      dealStage: addDealForm.dealStage,
    })
    .from(addDealForm)
    .where(
      and(
        eq(addDealForm.organizationId, cid),
        isNotNull(addDealForm.stripeSubscriptionId),
        ne(addDealForm.stripeSubscriptionId, ""),
      ),
    );

  const billed = deals.filter((d) => isDealSaasBillable(d));
  const rank = (status: string): number => {
    switch (String(status ?? "").toLowerCase()) {
      case "unpaid":
        return 80;
      case "past_due":
        return 70;
      case "incomplete":
        return 60;
      case "paused":
        return 50;
      case "trialing":
        return 40;
      case "active":
        return 30;
      case "canceled":
        return 10;
      default:
        return 0;
    }
  };
  let worstStatus = "none";
  let worstRank = -1;
  let earliestEnd: Date | null = null;
  let firstSubId: string | null = null;
  for (const d of billed) {
    const st = String(d.stripeSubscriptionStatus ?? "none");
    const r = rank(st);
    if (r > worstRank) {
      worstRank = r;
      worstStatus = st;
    }
    if (d.stripeCurrentPeriodEnd) {
      if (!earliestEnd || d.stripeCurrentPeriodEnd < earliestEnd) {
        earliestEnd = d.stripeCurrentPeriodEnd;
      }
    }
    if (!firstSubId && d.stripeSubscriptionId?.trim()) {
      firstSubId = d.stripeSubscriptionId.trim();
    }
  }

  const [company] = await db
    .select({
      stripeSubscriptionId: companies.stripeSubscriptionId,
      stripeSubscriptionStatus: companies.stripeSubscriptionStatus,
      stripeCurrentPeriodEnd: companies.stripeCurrentPeriodEnd,
    })
    .from(companies)
    .where(eq(companies.id, cid))
    .limit(1);
  if (!company) return;

  const companySubStillOnADeal = billed.some(
    (d) => d.stripeSubscriptionId?.trim() === company.stripeSubscriptionId?.trim(),
  );

  await db
    .update(companies)
    .set({
      ...(firstSubId &&
      (!company.stripeSubscriptionId?.trim() || !companySubStillOnADeal)
        ? { stripeSubscriptionId: firstSubId }
        : {}),
      ...(worstRank >= 0
        ? { stripeSubscriptionStatus: worstStatus || "none" }
        : {}),
      ...(earliestEnd ? { stripeCurrentPeriodEnd: earliestEnd } : {}),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, cid));
}

export type DealBillingListRow = {
  id: string;
  companyId: string;
  companyName: string;
  dealName: string;
  dealStage: string;
  archived: boolean;
  planId: string | null;
  suggestedPlanId: string | null;
  needsPlanUpgrade: boolean;
  billingCycle: string | null;
  subscriptionStatus: string;
  nextBillingDate: string | null;
  saasBillingStartsAt: string | null;
  billed: boolean;
  billable: boolean;
  /** Draft with a pending CR/AM stage can still be paid on Pricing. */
  payable: boolean;
  includedCompanyUsers: number;
  currentCompanyUsers: number;
  extraCompanyUsersPaid: number;
  extraCompanyUsersDue: number;
  extraUserFeeCents: number;
};

type DealBillingQueryRow = Pick<
  AddDealFormRow,
  | "id"
  | "dealName"
  | "dealStage"
  | "archived"
  | "stripeSubscriptionId"
  | "stripePlanId"
  | "stripeBillingCycle"
  | "stripeSubscriptionStatus"
  | "stripeCurrentPeriodEnd"
    | "saasBillingStartsAt"
    | "organizationId"
    | "pendingDealStage"
  > & { companyName: string | null };

const dealBillingSelect = {
  id: addDealForm.id,
  dealName: addDealForm.dealName,
  dealStage: addDealForm.dealStage,
  archived: addDealForm.archived,
  stripeSubscriptionId: addDealForm.stripeSubscriptionId,
  stripePlanId: addDealForm.stripePlanId,
  stripeBillingCycle: addDealForm.stripeBillingCycle,
  stripeSubscriptionStatus: addDealForm.stripeSubscriptionStatus,
  stripeCurrentPeriodEnd: addDealForm.stripeCurrentPeriodEnd,
  saasBillingStartsAt: addDealForm.saasBillingStartsAt,
  pendingDealStage: addDealForm.pendingDealStage,
  organizationId: addDealForm.organizationId,
  companyName: companies.name,
};

function dealIsActivelyBilled(
  row: Pick<
    AddDealFormRow,
    | "archived"
    | "dealStage"
    | "stripeSubscriptionId"
    | "stripeSubscriptionStatus"
  >,
): boolean {
  return (
    isDealSaasBillable(row) &&
    Boolean(row.stripeSubscriptionId?.trim()) &&
    ACTIVE_SUB_STATUSES.has(
      String(row.stripeSubscriptionStatus ?? "none").toLowerCase(),
    )
  );
}

/**
 * Deal ids in this company where the viewer is Lead Sponsor.
 */
export async function listLeadSponsorDealIdsInCompany(
  userId: string,
  companyId: string,
): Promise<string[]> {
  const cid = normalizeDealId(companyId);
  if (!cid) return [];
  const leadIds = await listDealIdsWhereViewerIsLeadSponsor(userId);
  if (leadIds.length === 0) return [];
  const rows = await db
    .select({ id: addDealForm.id })
    .from(addDealForm)
    .where(
      and(eq(addDealForm.organizationId, cid), inArray(addDealForm.id, leadIds)),
    );
  return rows.map((r) => String(r.id));
}

export async function mapStripeSubscriptionsToDeals(
  companyId: string,
  dealIdFilter?: string[] | null,
): Promise<Map<string, { dealId: string; dealName: string }>> {
  const cid = normalizeDealId(companyId);
  const map = new Map<string, { dealId: string; dealName: string }>();
  if (!cid) return map;
  if (dealIdFilter && dealIdFilter.length === 0) return map;

  const conditions = [
    eq(addDealForm.organizationId, cid),
    isNotNull(addDealForm.stripeSubscriptionId),
  ];
  if (dealIdFilter && dealIdFilter.length > 0) {
    conditions.push(inArray(addDealForm.id, dealIdFilter));
  }

  const rows = await db
    .select({
      id: addDealForm.id,
      dealName: addDealForm.dealName,
      stripeSubscriptionId: addDealForm.stripeSubscriptionId,
    })
    .from(addDealForm)
    .where(and(...conditions));

  for (const row of rows) {
    const sub = row.stripeSubscriptionId?.trim();
    if (!sub) continue;
    map.set(sub, { dealId: String(row.id), dealName: row.dealName ?? "" });
  }
  return map;
}

async function mapDealBillingQueryRows(
  rows: DealBillingQueryRow[],
): Promise<DealBillingListRow[]> {
  const list: DealBillingListRow[] = [];
  for (const row of rows) {
    const saasBillingStartsAt =
      (await ensureDealSaasComplimentaryPeriod(row)) ?? row.saasBillingStartsAt;
    const dated = { ...row, saasBillingStartsAt };
    const billed = dealIsActivelyBilled(dated);
    const billable = isDealSaasBillable(dated);
    const payable =
      billable ||
      (!dated.archived && isSaasBillableDealStage(row.pendingDealStage));
    const raise = payable ? await raiseAmountForDeal(String(row.id)) : 0;
    const suggestedPlanId = payable ? planIdForDealRaiseAmount(raise) : null;
    const companyUsers = await getDealCompanyUserSnapshot(String(row.id));
    list.push({
      id: String(row.id),
      companyId: String(row.organizationId ?? "").trim().toLowerCase(),
      companyName: String(row.companyName ?? "").trim() || "—",
      dealName: row.dealName ?? "",
      dealStage: row.dealStage ?? "",
      archived: Boolean(row.archived),
      planId: row.stripePlanId ?? null,
      suggestedPlanId,
      needsPlanUpgrade: dealShouldAlertPlanUpgrade(dated, suggestedPlanId),
      billingCycle: row.stripeBillingCycle ?? null,
      subscriptionStatus: row.stripeSubscriptionStatus || "none",
      nextBillingDate: nextBillingDateForList(dated),
      saasBillingStartsAt: saasBillingStartsAt
        ? saasBillingStartsAt.toISOString()
        : null,
      billed,
      billable,
      payable,
      includedCompanyUsers: companyUsers?.includedCompanyUsers ?? 1,
      currentCompanyUsers: companyUsers?.currentCompanyUsers ?? 0,
      extraCompanyUsersPaid: companyUsers?.extraCompanyUsersPaid ?? 0,
      extraCompanyUsersDue: companyUsers?.extraCompanyUsersDue ?? 0,
      extraUserFeeCents: companyUsers?.extraUserFeeCents ?? 1000,
    });
  }

  list.sort((a, b) => {
    const org = a.companyName.localeCompare(b.companyName, undefined, {
      sensitivity: "base",
    });
    if (org !== 0) return org;
    return a.dealName.localeCompare(b.dealName, undefined, {
      sensitivity: "base",
    });
  });
  return list;
}

export async function listDealBillingForCompany(
  companyId: string,
  dealIdFilter?: string[] | null,
): Promise<DealBillingListRow[]> {
  const cid = normalizeDealId(companyId);
  if (!cid) return [];
  if (dealIdFilter && dealIdFilter.length === 0) return [];

  const conditions = [eq(addDealForm.organizationId, cid)];
  if (dealIdFilter && dealIdFilter.length > 0) {
    conditions.push(inArray(addDealForm.id, dealIdFilter));
  }

  const rows = await db
    .select(dealBillingSelect)
    .from(addDealForm)
    .leftJoin(companies, eq(addDealForm.organizationId, companies.id))
    .where(and(...conditions));

  return mapDealBillingQueryRows(rows as DealBillingQueryRow[]);
}

/** Platform admin: every deal across every organization. */
export async function listDealBillingForAllOrganizations(): Promise<
  DealBillingListRow[]
> {
  const rows = await db
    .select(dealBillingSelect)
    .from(addDealForm)
    .leftJoin(companies, eq(addDealForm.organizationId, companies.id));

  return mapDealBillingQueryRows(rows as DealBillingQueryRow[]);
}

function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

export type PlatformOrganizationBillingRow = {
  id: string;
  name: string;
  dealCount: number;
  billedCount: number;
  totalPaidCents: number;
  totalPaid: string;
  deals: DealBillingListRow[];
};

/** Platform admin: every organization with deals and total paid. */
export async function listPlatformOrganizationBilling(): Promise<
  PlatformOrganizationBillingRow[]
> {
  const [orgs, deals, paidRows] = await Promise.all([
    db.select({ id: companies.id, name: companies.name }).from(companies),
    listDealBillingForAllOrganizations(),
    db
      .select({
        companyId: companyBillingInvoices.companyId,
        totalPaidCents: sql<number>`coalesce(sum(${companyBillingInvoices.amountPaidCents}), 0)::int`,
      })
      .from(companyBillingInvoices)
      .where(sql`lower(${companyBillingInvoices.status}) = 'paid'`)
      .groupBy(companyBillingInvoices.companyId),
  ]);

  const dealsByOrg = new Map<string, DealBillingListRow[]>();
  for (const deal of deals) {
    const id = String(deal.companyId ?? "").trim().toLowerCase();
    if (!id) continue;
    const list = dealsByOrg.get(id);
    if (list) list.push(deal);
    else dealsByOrg.set(id, [deal]);
  }

  const paidByOrg = new Map<string, number>();
  for (const row of paidRows) {
    const id = String(row.companyId ?? "").trim().toLowerCase();
    if (!id) continue;
    paidByOrg.set(id, Number(row.totalPaidCents) || 0);
  }

  const names = new Map<string, string>();
  for (const org of orgs) {
    names.set(
      String(org.id).trim().toLowerCase(),
      String(org.name ?? "").trim(),
    );
  }
  for (const [id, orgDeals] of dealsByOrg) {
    if (!names.has(id)) {
      names.set(
        id,
        orgDeals[0]?.companyName?.trim() || "Untitled organization",
      );
    }
  }

  const list: PlatformOrganizationBillingRow[] = [...names.entries()].map(
    ([id, name]) => {
      const orgDeals = dealsByOrg.get(id) ?? [];
      const totalPaidCents = paidByOrg.get(id) ?? 0;
      return {
        id,
        name: name || "Untitled organization",
        dealCount: orgDeals.length,
        billedCount: orgDeals.filter((d) => d.billed).length,
        totalPaidCents,
        totalPaid: formatUsdCents(totalPaidCents),
        deals: orgDeals,
      };
    },
  );

  list.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  return list;
}

function normalizeDealBillingCycle(
  raw: string | null | undefined,
): StripeBillingCycle | null {
  const c = String(raw ?? "").trim().toLowerCase();
  if (c === "annual" || c === "annually" || c === "yearly") return "annual";
  if (c === "monthly") return "monthly";
  return null;
}

/**
 * Set monthly vs yearly for a deal. During the complimentary month this is
 * stored on the deal and used at checkout. If a Stripe subscription already
 * exists, its price is switched to the matching cycle (no proration).
 */
export async function updateDealBillingCycle(params: {
  companyId: string;
  dealId: string;
  billingCycle: string;
  allowedDealIds?: string[] | null;
}): Promise<
  | { ok: true; deal: DealBillingListRow }
  | { ok: false; status: number; message: string }
> {
  const cycle = normalizeDealBillingCycle(params.billingCycle);
  if (!cycle) {
    return {
      ok: false,
      status: 400,
      message: "Choose monthly or yearly billing.",
    };
  }

  const cid = normalizeDealId(params.companyId);
  const dealId = normalizeDealId(params.dealId);
  if (!cid || !dealId) {
    return { ok: false, status: 400, message: "Select a deal first." };
  }
  if (params.allowedDealIds) {
    const allow = new Set(
      params.allowedDealIds.map((id) => String(id).trim().toLowerCase()),
    );
    if (!allow.has(dealId)) {
      return {
        ok: false,
        status: 403,
        message: "You can only change billing for deals you lead.",
      };
    }
  }

  const [deal] = await db
    .select()
    .from(addDealForm)
    .where(and(eq(addDealForm.id, dealId), eq(addDealForm.organizationId, cid)))
    .limit(1);
  if (!deal) {
    return { ok: false, status: 404, message: "Deal not found." };
  }
  if (!isDealSaasBillable(deal)) {
    return {
      ok: false,
      status: 400,
      message:
        "Billing cycle applies when the deal is raising capital or asset managing.",
    };
  }

  const raise = await raiseAmountForDeal(dealId);
  const suggestedPlan = planIdForDealRaiseAmount(raise);
  const planId =
    normalizeBillingPlanId(deal.stripePlanId) ?? suggestedPlan;

  const existingSub = deal.stripeSubscriptionId?.trim() ?? "";
  if (existingSub && getStripeConfig()) {
    try {
      const stripe = getStripeClient();
      const sub = await stripe.subscriptions.retrieve(existingSub, {
        expand: ["items.data.price"],
      });
      const mapped = planCycleSeatFromSubscription(sub);
      const seatBand = mapped.seatBand ?? "5";
      const resolvedPlan = mapped.planId ?? planId;
      const priceId = resolveStripePriceId(resolvedPlan, cycle, seatBand);
      if (!priceId) {
        return {
          ok: false,
          status: 503,
          message: `Stripe Price is not configured for ${resolvedPlan} / ${seatBand} seats (${cycle}).`,
        };
      }
      const itemId = sub.items?.data?.[0]?.id;
      if (!itemId) {
        return {
          ok: false,
          status: 502,
          message: "This subscription has no price to update.",
        };
      }
      const updated = await stripe.subscriptions.update(existingSub, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "none",
        metadata: {
          ...sub.metadata,
          planId: resolvedPlan,
          billingCycle: cycle,
          seatBand,
        },
      });
      await applyStripeSubscriptionToDeal(dealId, updated);
    } catch (err) {
      console.error("updateDealBillingCycle stripe:", err);
      const msg =
        err instanceof Error ? err.message : "Could not update billing cycle.";
      return { ok: false, status: 502, message: msg };
    }
  } else {
    await db
      .update(addDealForm)
      .set({
        stripeBillingCycle: cycle,
        stripePlanId: planId,
      })
      .where(eq(addDealForm.id, dealId));
  }

  const [row] = await listDealBillingForCompany(params.companyId, [dealId]);
  if (!row) {
    return { ok: false, status: 404, message: "Deal not found." };
  }
  return { ok: true, deal: row };
}

export async function loadPayableDeal(params: {
  companyId: string;
  dealId: string;
  allowedDealIds: string[] | null;
}): Promise<
  | { ok: true; deal: AddDealFormRow }
  | { ok: false; status: number; message: string }
> {
  const cid = normalizeDealId(params.companyId);
  const dealId = normalizeDealId(params.dealId);
  if (!cid || !dealId) {
    return { ok: false, status: 400, message: "Select a deal to pay MRR for." };
  }
  if (params.allowedDealIds) {
    const allow = new Set(
      params.allowedDealIds.map((id) => String(id).trim().toLowerCase()),
    );
    if (!allow.has(dealId)) {
      return {
        ok: false,
        status: 403,
        message: "You can only pay SaaS billing for deals you lead.",
      };
    }
  }
  const [deal] = await db
    .select()
    .from(addDealForm)
    .where(and(eq(addDealForm.id, dealId), eq(addDealForm.organizationId, cid)))
    .limit(1);
  if (!deal) {
    return { ok: false, status: 404, message: "Deal not found." };
  }
  if (deal.archived) {
    return {
      ok: false,
      status: 400,
      message:
        "Billing starts when the deal is raising capital or asset managing. Draft, archived, and liquidated deals are not billed.",
    };
  }
  if (
    !isDealSaasBillable(deal) &&
    !isSaasBillableDealStage(deal.pendingDealStage)
  ) {
    return {
      ok: false,
      status: 400,
      message:
        "Billing starts when the deal is raising capital or asset managing. Draft, archived, and liquidated deals are not billed.",
    };
  }
  if (
    deal.stripeSubscriptionId?.trim() &&
    ACTIVE_SUB_STATUSES.has(
      String(deal.stripeSubscriptionStatus ?? "none").toLowerCase(),
    )
  ) {
    const suggested = await suggestedPlanIdForDeal(dealId);
    if (!dealPaidPlanNeedsUpgrade(deal.stripePlanId, suggested)) {
      return {
        ok: false,
        status: 409,
        message:
          "This deal already has an active SaaS subscription. Use Manage billing to update the payment method.",
      };
    }
  }
  return { ok: true, deal };
}

export async function countBilledDealsForCompany(
  companyId: string,
  dealIdFilter?: string[] | null,
): Promise<{ billedDealCount: number; nextDealBillingDate: string | null }> {
  const cid = normalizeDealId(companyId);
  if (!cid) return { billedDealCount: 0, nextDealBillingDate: null };
  if (dealIdFilter && dealIdFilter.length === 0) {
    return { billedDealCount: 0, nextDealBillingDate: null };
  }
  const conditions = [eq(addDealForm.organizationId, cid)];
  if (dealIdFilter && dealIdFilter.length > 0) {
    conditions.push(inArray(addDealForm.id, dealIdFilter));
  }
  const deals = await db
    .select({
      archived: addDealForm.archived,
      dealStage: addDealForm.dealStage,
      stripeSubscriptionId: addDealForm.stripeSubscriptionId,
      stripeSubscriptionStatus: addDealForm.stripeSubscriptionStatus,
      stripeCurrentPeriodEnd: addDealForm.stripeCurrentPeriodEnd,
    })
    .from(addDealForm)
    .where(and(...conditions));
  let billedDealCount = 0;
  let earliest: Date | null = null;
  for (const d of deals) {
    if (!isDealSaasBillable(d) || !d.stripeSubscriptionId?.trim()) continue;
    if (
      !ACTIVE_SUB_STATUSES.has(
        String(d.stripeSubscriptionStatus ?? "none").toLowerCase(),
      )
    ) {
      continue;
    }
    billedDealCount += 1;
    if (d.stripeCurrentPeriodEnd) {
      if (!earliest || d.stripeCurrentPeriodEnd < earliest) {
        earliest = d.stripeCurrentPeriodEnd;
      }
    }
  }
  return {
    billedDealCount,
    nextDealBillingDate: earliest ? earliest.toISOString() : null,
  };
}

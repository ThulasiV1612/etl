import Stripe from "stripe";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
  addDealForm,
  companies,
  companyBillingEvents,
  companyBillingInvoices,
  companyBillingPaymentMethods,
  users,
} from "../../schema/schema.js";
import {
  getStripeConfig,
  normalizeBillingPlanId,
  normalizeBillingSeatBand,
  planAndCycleFromPriceId,
  priceEnvNameFor,
  requireStripeConfig,
  resolveFrontendOrigin,
  resolveStripePriceId,
  STRIPE_BILLING_PLAN_IDS,
  STRIPE_BILLING_SEAT_BANDS,
  type StripeBillingCycle,
  type StripeBillingPlanId,
  type StripeBillingSeatBand,
} from "../../config/stripe.config.js";
import {
  isCompanyAdminRole,
  isPlatformAdminRole,
} from "../../constants/roles.js";
import { userHasAccessToOrganization } from "../org/orgResolution.service.js";
import { releaseBillingPaymentHold } from "../../middleware/billingPaymentLock.js";
import { periodEndFromSubscription } from "./dealBilling.service.js";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const cfg = requireStripeConfig();
  if (!stripeClient) {
    stripeClient = new Stripe(cfg.secretKey, {
      apiVersion: "2026-06-24.dahlia",
    });
  }
  return stripeClient;
}

const COMPANY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeCompanyId(raw: string): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return COMPANY_UUID_RE.test(s) ? s : null;
}

export async function userCanManageCompanyBilling(
  userId: string,
  userRole: string | undefined,
  companyId: string,
): Promise<boolean> {
  const cid = normalizeCompanyId(companyId);
  if (!cid) return false;
  const [co] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, cid))
    .limit(1);
  if (!co) return false;
  if (isPlatformAdminRole(userRole)) return true;
  if (!isCompanyAdminRole(userRole)) return false;
  return userHasAccessToOrganization(userId, cid);
}

export type CompanyBillingViewerScope = "all_deals" | "lead_sponsor";

export type CompanyBillingAccess = {
  canView: boolean;
  canManage: boolean;
  canPay: boolean;
  viewerScope: CompanyBillingViewerScope;
  /** `null` = every deal in the company; otherwise only these deal ids. */
  dealIds: string[] | null;
};

const DENIED_BILLING_ACCESS: CompanyBillingAccess = {
  canView: false,
  canManage: false,
  canPay: false,
  viewerScope: "lead_sponsor",
  dealIds: [],
};

/**
 * Org / platform admins manage billing and see every deal.
 * Lead sponsors may view billing only for deals they lead.
 */
export async function resolveCompanyBillingAccess(
  userId: string,
  userRole: string | undefined,
  companyId: string,
): Promise<CompanyBillingAccess> {
  const cid = normalizeCompanyId(companyId);
  if (!cid) return DENIED_BILLING_ACCESS;

  const canManage = await userCanManageCompanyBilling(userId, userRole, cid);
  if (canManage) {
    return {
      canView: true,
      canManage: true,
      // Platform admins may view and manage records, but must not pay or
      // change a customer’s payment cycle.
      canPay: !isPlatformAdminRole(userRole),
      viewerScope: "all_deals",
      dealIds: null,
    };
  }

  const { listLeadSponsorDealIdsInCompany } = await import(
    "./dealBilling.service.js"
  );
  const dealIds = await listLeadSponsorDealIdsInCompany(userId, cid);
  if (dealIds.length === 0) return DENIED_BILLING_ACCESS;
  return {
    canView: true,
    canManage: false,
    canPay: true,
    viewerScope: "lead_sponsor",
    dealIds,
  };
}

export type CompanyBillingStatus = {
  configured: boolean;
  testMode: boolean;
  webhookConfigured: boolean;
  companyId: string;
  planId: string | null;
  billingCycle: string | null;
  subscriptionStatus: string;
  priceId: string | null;
  currentPeriodEnd: string | null;
  hasCustomer: boolean;
  hasSubscription: boolean;
  lastPaymentError: string | null;
  lastPaymentFailedAt: string | null;
  paymentHealthy: boolean;
  /** Active per-deal SaaS subscriptions (capital raising / asset managing). */
  billedDealCount: number;
  canManage: boolean;
  canPay: boolean;
  viewerScope: CompanyBillingViewerScope;
  saasBillingStartsAt: string | null;
  plansConfigured: Array<{
    id: StripeBillingPlanId;
    monthlyReady: boolean;
    annualReady: boolean;
    monthlyEnv: string;
    annualEnv: string;
    seats: Array<{
      seatBand: StripeBillingSeatBand;
      monthlyReady: boolean;
      annualReady: boolean;
      monthlyEnv: string;
      annualEnv: string;
    }>;
  }>;
};

export async function getCompanyBillingStatus(
  companyId: string,
  options?: {
    dealIds?: string[] | null;
    canManage?: boolean;
    canPay?: boolean;
    viewerScope?: CompanyBillingViewerScope;
  },
): Promise<CompanyBillingStatus | null> {
  const cid = normalizeCompanyId(companyId);
  if (!cid) return null;
  const [row] = await db
    .select({
      id: companies.id,
      stripeCustomerId: companies.stripeCustomerId,
      stripeSubscriptionId: companies.stripeSubscriptionId,
      stripePlanId: companies.stripePlanId,
      stripeBillingCycle: companies.stripeBillingCycle,
      stripeSubscriptionStatus: companies.stripeSubscriptionStatus,
      stripePriceId: companies.stripePriceId,
      stripeCurrentPeriodEnd: companies.stripeCurrentPeriodEnd,
      stripeLastPaymentError: companies.stripeLastPaymentError,
      stripeLastPaymentFailedAt: companies.stripeLastPaymentFailedAt,
    })
    .from(companies)
    .where(eq(companies.id, cid))
    .limit(1);
  if (!row) return null;

  const cfg = getStripeConfig();
  const publicPlans = cfg
    ? STRIPE_BILLING_PLAN_IDS.map((id) => {
        const seats = STRIPE_BILLING_SEAT_BANDS.map((seatBand) => ({
          seatBand,
          monthlyReady: Boolean(cfg.prices[id][seatBand].monthly),
          annualReady: Boolean(cfg.prices[id][seatBand].annual),
          monthlyEnv: priceEnvNameFor(id, "monthly", seatBand),
          annualEnv: priceEnvNameFor(id, "annual", seatBand),
        }));
        return {
          id,
          monthlyReady: seats.some((s) => s.monthlyReady),
          annualReady: seats.some((s) => s.annualReady),
          monthlyEnv: priceEnvNameFor(id, "monthly", "5"),
          annualEnv: priceEnvNameFor(id, "annual", "5"),
          seats,
        };
      })
    : [];

  const subscriptionStatus = row.stripeSubscriptionStatus || "none";
  const paymentHealthy =
    !row.stripeLastPaymentError &&
    subscriptionStatus !== "past_due" &&
    subscriptionStatus !== "unpaid" &&
    subscriptionStatus !== "incomplete";

  const status: CompanyBillingStatus = {
    configured: Boolean(cfg),
    testMode: cfg?.testMode ?? false,
    webhookConfigured: Boolean(cfg?.webhookSecret),
    companyId: row.id,
    planId: row.stripePlanId,
    billingCycle: row.stripeBillingCycle,
    subscriptionStatus,
    priceId: row.stripePriceId,
    currentPeriodEnd: row.stripeCurrentPeriodEnd
      ? row.stripeCurrentPeriodEnd.toISOString()
      : null,
    hasCustomer: Boolean(row.stripeCustomerId),
    hasSubscription: Boolean(row.stripeSubscriptionId),
    lastPaymentError: row.stripeLastPaymentError,
    lastPaymentFailedAt: row.stripeLastPaymentFailedAt
      ? row.stripeLastPaymentFailedAt.toISOString()
      : null,
    paymentHealthy,
    billedDealCount: 0,
    canManage: options?.canManage ?? true,
    canPay: options?.canPay ?? options?.canManage ?? true,
    viewerScope: options?.viewerScope ?? "all_deals",
    saasBillingStartsAt: null,
    plansConfigured: publicPlans,
  };

  try {
    const {
      countBilledDealsForCompany,
      getPlatformSaasBillingStartsAtIso,
    } = await import("./dealBilling.service.js");
    const platformStart = await getPlatformSaasBillingStartsAtIso();
    if (platformStart) status.saasBillingStartsAt = platformStart;
    const scopedDealIds = options?.dealIds;
    const dealBilling = await countBilledDealsForCompany(
      row.id,
      scopedDealIds,
    );
    status.billedDealCount = dealBilling.billedDealCount;
    if (Array.isArray(scopedDealIds)) {
      status.currentPeriodEnd = dealBilling.nextDealBillingDate;
      status.hasSubscription = dealBilling.billedDealCount > 0;
    } else {
      if (dealBilling.nextDealBillingDate) {
        status.currentPeriodEnd = dealBilling.nextDealBillingDate;
      }
      if (dealBilling.billedDealCount > 0) {
        status.hasSubscription = true;
      }
    }
  } catch (err) {
    console.warn("getCompanyBillingStatus deal billing:", err);
  }

  return status;
}

async function ensureStripeCustomer(params: {
  companyId: string;
  actorUserId: string;
}): Promise<string> {
  const cid = normalizeCompanyId(params.companyId);
  if (!cid) throw new Error("Invalid company id");

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, cid))
    .limit(1);
  if (!company) throw new Error("Company not found");

  if (company.stripeCustomerId?.trim()) {
    return company.stripeCustomerId.trim();
  }

  const [actor] = await db
    .select({ email: users.email, name: users.username })
    .from(users)
    .where(eq(users.id, params.actorUserId))
    .limit(1);

  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    {
      name: company.name,
      email: actor?.email?.trim() || undefined,
      metadata: {
        companyId: cid,
        companyName: company.name,
      },
    },
    { idempotencyKey: `company_customer_${cid}` },
  );

  // Race-safe: only write if still empty; another request may have won.
  await db
    .update(companies)
    .set({
      stripeCustomerId: customer.id,
      updatedAt: new Date(),
    })
    .where(and(eq(companies.id, cid), isNull(companies.stripeCustomerId)));

  const [after] = await db
    .select({ stripeCustomerId: companies.stripeCustomerId })
    .from(companies)
    .where(eq(companies.id, cid))
    .limit(1);
  return after?.stripeCustomerId?.trim() || customer.id;
}

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; status: number; message: string };

export async function createCompanyCheckoutSession(params: {
  companyId: string;
  actorUserId: string;
  /** starter | running | growth (seat suffixes like starter_5 are normalized) */
  planId: string;
  seatBand?: string;
  billingCycle: string;
  /** Required: each billable deal has its own SaaS subscription paid by the lead sponsor. */
  dealId?: string;
  extraCompanyUsers?: number;
  /** `null` = org admin (all deals); otherwise only these deal ids. */
  allowedDealIds?: string[] | null;
}): Promise<CheckoutResult> {
  const cfg = getStripeConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      message: "Stripe is not configured on the server.",
    };
  }

  const cycle: StripeBillingCycle =
    params.billingCycle === "annually" ||
    params.billingCycle === "annual" ||
    params.billingCycle === "yearly"
      ? "annual"
      : params.billingCycle === "monthly"
        ? "monthly"
        : ("" as StripeBillingCycle);

  if (cycle !== "monthly" && cycle !== "annual") {
    return {
      ok: false,
      status: 400,
      message: "billingCycle must be monthly or annual.",
    };
  }

  const rawPlan = String(params.planId ?? "").trim().toLowerCase();
  if (rawPlan === "custom") {
    return {
      ok: false,
      status: 400,
      message:
        "For deals over $11M or more than 25 company users, contact sales for pricing.",
    };
  }

  const resolvedPlan = normalizeBillingPlanId(rawPlan);
  if (!resolvedPlan) {
    return {
      ok: false,
      status: 400,
      message: 'planId must be "starter", "running", or "growth".',
    };
  }

  const resolvedSeat =
    normalizeBillingSeatBand(params.seatBand) ??
    normalizeBillingSeatBand(rawPlan.includes("_") ? rawPlan.split("_")[1] : "") ??
    "5";

  const priceId = resolveStripePriceId(resolvedPlan, cycle, resolvedSeat);
  if (!priceId) {
    const envName = priceEnvNameFor(resolvedPlan, cycle, resolvedSeat);
    return {
      ok: false,
      status: 503,
      message: `Stripe Price is not configured for ${resolvedPlan} / ${resolvedSeat} seats (${cycle}). Set ${envName}=price_... in backend/.env.local.`,
    };
  }

  const cid = normalizeCompanyId(params.companyId);
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }

  const frontend = resolveFrontendOrigin();
  if (!frontend) {
    return {
      ok: false,
      status: 503,
      message:
        "BASE_URL must be set so Stripe can redirect after checkout.",
    };
  }

  try {
    const [company] = await db
      .select({
        stripeSubscriptionId: companies.stripeSubscriptionId,
        stripeSubscriptionStatus: companies.stripeSubscriptionStatus,
      })
      .from(companies)
      .where(eq(companies.id, cid))
      .limit(1);
    if (!company) {
      return { ok: false, status: 404, message: "Company not found" };
    }

    const dealId = String(params.dealId ?? "").trim();
    if (!dealId) {
      return {
        ok: false,
        status: 400,
        message: "Select a deal to pay monthly SaaS billing for.",
      };
    }
    const { loadPayableDeal } = await import("./dealBilling.service.js");
    const payable = await loadPayableDeal({
      companyId: cid,
      dealId,
      allowedDealIds: params.allowedDealIds ?? null,
    });
    if (!payable.ok) {
      return {
        ok: false,
        status: payable.status,
        message: payable.message,
      };
    }
    const deal = payable.deal;
    const {
      assertCheckoutPlanMatchesDeal,
      upgradeDealStripeSubscription,
      clearDealSaasSubscription,
    } = await import("./dealBilling.service.js");
    const planMatch = await assertCheckoutPlanMatchesDeal({
      dealId: String(deal.id),
      planId: resolvedPlan,
    });
    if (!planMatch.ok) {
      return {
        ok: false,
        status: planMatch.status,
        message: planMatch.message,
      };
    }

    const customerId = await ensureStripeCustomer({
      companyId: cid,
      actorUserId: params.actorUserId,
    });
    const stripe = getStripeClient();

    const existingDealSub = deal.stripeSubscriptionId?.trim() ?? "";
    const dealSubStatus = String(deal.stripeSubscriptionStatus ?? "none");
    if (existingDealSub && dealSubStatus === "incomplete") {
      try {
        await stripe.subscriptions.cancel(existingDealSub);
      } catch (cancelErr) {
        console.warn(
          "createCompanyCheckoutSession: cancel incomplete deal sub:",
          cancelErr,
        );
      }
      await clearDealSaasSubscription(String(deal.id));
    } else if (
      existingDealSub &&
      ["active", "trialing", "past_due", "unpaid"].includes(
        dealSubStatus.toLowerCase(),
      )
    ) {
      const upgraded = await upgradeDealStripeSubscription({
        deal,
        planId: resolvedPlan,
        cycle,
        seatBand: resolvedSeat,
      });
      if (!upgraded.ok) {
        return {
          ok: false,
          status: upgraded.status,
          message: upgraded.message,
        };
      }
      await applySubscriptionToCompany(cid, upgraded.subscription);
      if (upgraded.hostedInvoiceUrl) {
        return { ok: true, url: upgraded.hostedInvoiceUrl };
      }
      return {
        ok: true,
        url: `${frontend}/settings?billing=success&dealId=${encodeURIComponent(String(deal.id))}`,
      };
    }

    const {
      extraCompanyUserCheckoutLineItems,
      extraCompanyUsersToCharge,
      getDealCompanyUserSnapshot,
    } = await import("./dealExtraCompanyUser.service.js");
    const snapshot = await getDealCompanyUserSnapshot(String(deal.id));
    const extraUsers = snapshot
      ? extraCompanyUsersToCharge(snapshot, params.extraCompanyUsers)
      : Math.max(0, Math.floor(params.extraCompanyUsers ?? 0));
    const extraLineItems = extraCompanyUserCheckoutLineItems(extraUsers);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      // Card + ACH (US bank account). Wallet methods follow Dashboard settings.
      payment_method_types: ["card", "us_bank_account"],
      line_items: [
        { price: priceId, quantity: 1 },
        ...extraLineItems,
      ],
      success_url: `${frontend}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}&dealId=${encodeURIComponent(String(deal.id))}`,
      cancel_url: `${frontend}/settings?billing=cancel&dealId=${encodeURIComponent(String(deal.id))}`,
      client_reference_id: cid,
      metadata: {
        companyId: cid,
        dealId: String(deal.id),
        dealName: deal.dealName ?? "",
        planId: resolvedPlan,
        billingCycle: cycle,
        seatBand: resolvedSeat,
        billingScope: "deal",
        extraCompanyUsers: String(extraUsers),
        payerUserId: params.actorUserId,
      },
      subscription_data: {
        metadata: {
          companyId: cid,
          dealId: String(deal.id),
          dealName: deal.dealName ?? "",
          planId: resolvedPlan,
          billingCycle: cycle,
          seatBand: resolvedSeat,
          billingScope: "deal",
          extraCompanyUsers: String(extraUsers),
          payerUserId: params.actorUserId,
        },
      },
      payment_method_options: {
        us_bank_account: {
          financial_connections: {
            permissions: ["payment_method"],
          },
        },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return {
        ok: false,
        status: 502,
        message: "Stripe did not return a checkout URL.",
      };
    }
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("createCompanyCheckoutSession:", err);
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      const missingPrice =
        err.code === "resource_missing" &&
        String(err.param ?? "").includes("price");
      return {
        ok: false,
        status: missingPrice ? 400 : 502,
        message: missingPrice
          ? `Stripe does not recognize this Price ID in the account for STRIPE_SECRET_KEY (${err.message}). Create the product/price in that same Stripe account (Dashboard → Products) and update backend/.env.local.`
          : err.message || "Stripe rejected the checkout request.",
      };
    }
    const msg =
      err instanceof Error ? err.message : "Could not create checkout session";
    return { ok: false, status: 502, message: msg };
  }
}

/** Shared plan/seat/cycle validation used by Checkout + Payment Element flows. */
function resolveBillingSelection(params: {
  planId: string;
  seatBand?: string;
  billingCycle: string;
}):
  | {
      ok: true;
      planId: StripeBillingPlanId;
      seatBand: StripeBillingSeatBand;
      cycle: StripeBillingCycle;
      priceId: string;
    }
  | { ok: false; status: number; message: string } {
  const cycle: StripeBillingCycle =
    params.billingCycle === "annually" ||
    params.billingCycle === "annual" ||
    params.billingCycle === "yearly"
      ? "annual"
      : params.billingCycle === "monthly"
        ? "monthly"
        : ("" as StripeBillingCycle);

  if (cycle !== "monthly" && cycle !== "annual") {
    return {
      ok: false,
      status: 400,
      message: "billingCycle must be monthly or annual.",
    };
  }

  const rawPlan = String(params.planId ?? "").trim().toLowerCase();
  if (rawPlan === "custom") {
    return {
      ok: false,
      status: 400,
      message:
        "For deals over $11M or more than 25 company users, contact sales for pricing.",
    };
  }

  const resolvedPlan = normalizeBillingPlanId(rawPlan);
  if (!resolvedPlan) {
    return {
      ok: false,
      status: 400,
      message: 'planId must be "starter", "running", or "growth".',
    };
  }

  const resolvedSeat =
    normalizeBillingSeatBand(params.seatBand) ??
    normalizeBillingSeatBand(rawPlan.includes("_") ? rawPlan.split("_")[1] : "") ??
    "5";

  const priceId = resolveStripePriceId(resolvedPlan, cycle, resolvedSeat);
  if (!priceId) {
    const envName = priceEnvNameFor(resolvedPlan, cycle, resolvedSeat);
    return {
      ok: false,
      status: 503,
      message: `Stripe Price is not configured for ${resolvedPlan} / ${resolvedSeat} seats (${cycle}). Set ${envName}=price_... in backend/.env.local.`,
    };
  }

  return {
    ok: true,
    planId: resolvedPlan,
    seatBand: resolvedSeat,
    cycle,
    priceId,
  };
}

export type PaySavedMethodResult =
  | { ok: true; paidDealId: string; status: Awaited<ReturnType<typeof getCompanyBillingStatus>> }
  | { ok: false; status: number; message: string };

/**
 * Charge (or start complimentary trial) for a deal using a saved card / bank account.
 * Callers who need a new method should use Stripe Checkout instead.
 */
export async function payCompanyDealWithSavedMethod(params: {
  companyId: string;
  actorUserId: string;
  planId: string;
  seatBand?: string;
  billingCycle: string;
  dealId?: string;
  extraCompanyUsers?: number;
  paymentMethodId: string;
  allowedDealIds?: string[] | null;
}): Promise<PaySavedMethodResult> {
  const cfg = getStripeConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      message: "Stripe is not configured on the server.",
    };
  }

  const selection = resolveBillingSelection(params);
  if (!selection.ok) return selection;

  const cid = normalizeCompanyId(params.companyId);
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }

  const dealId = String(params.dealId ?? "").trim();
  if (!dealId) {
    return {
      ok: false,
      status: 400,
      message: "Select a deal to pay monthly SaaS billing for.",
    };
  }

  const rawPm = String(params.paymentMethodId ?? "").trim();
  if (!rawPm) {
    return {
      ok: false,
      status: 400,
      message: "Select a saved payment method, or pay in Stripe.",
    };
  }

  try {
    const { loadPayableDeal, clearDealSaasSubscription, createDealStripeSubscription, assertCheckoutPlanMatchesDeal, upgradeDealStripeSubscription } =
      await import("./dealBilling.service.js");
    const payable = await loadPayableDeal({
      companyId: cid,
      dealId,
      allowedDealIds: params.allowedDealIds ?? null,
    });
    if (!payable.ok) {
      return {
        ok: false,
        status: payable.status,
        message: payable.message,
      };
    }
    const deal = payable.deal;
    const planMatch = await assertCheckoutPlanMatchesDeal({
      dealId: String(deal.id),
      planId: selection.planId,
    });
    if (!planMatch.ok) {
      return {
        ok: false,
        status: planMatch.status,
        message: planMatch.message,
      };
    }

    const methods = await listCompanyPaymentMethods(cid);
    const found = methods.find(
      (m) => m.stripePaymentMethodId === rawPm || m.id === rawPm,
    );
    if (!found?.stripePaymentMethodId) {
      return {
        ok: false,
        status: 400,
        message:
          "That payment method is not available. Choose another, or pay in Stripe.",
      };
    }
    const paymentMethodId = found.stripePaymentMethodId;

    const stripe = getStripeClient();
    const existingDealSub = deal.stripeSubscriptionId?.trim() ?? "";
    if (
      existingDealSub &&
      String(deal.stripeSubscriptionStatus ?? "none") === "incomplete"
    ) {
      try {
        await stripe.subscriptions.cancel(existingDealSub);
      } catch (cancelErr) {
        console.warn(
          "payCompanyDealWithSavedMethod: cancel incomplete deal sub:",
          cancelErr,
        );
      }
      await clearDealSaasSubscription(String(deal.id));
    }

    const customerId = await ensureStripeCustomer({
      companyId: cid,
      actorUserId: params.actorUserId,
    });

    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    } catch (attachErr) {
      const alreadyAttached =
        attachErr instanceof Stripe.errors.StripeInvalidRequestError &&
        (attachErr.code === "resource_already_exists" ||
          /already been attached/i.test(attachErr.message ?? ""));
      if (!alreadyAttached) {
        throw attachErr;
      }
    }

    const existingActive =
      (deal.stripeSubscriptionId?.trim() ?? "") &&
      ["active", "trialing", "past_due", "unpaid"].includes(
        String(deal.stripeSubscriptionStatus ?? "none").toLowerCase(),
      );
    if (existingActive) {
      const upgraded = await upgradeDealStripeSubscription({
        deal,
        planId: selection.planId,
        cycle: selection.cycle,
        seatBand: selection.seatBand,
        paymentMethodId,
      });
      if (!upgraded.ok) {
        return {
          ok: false,
          status: upgraded.status,
          message: upgraded.message,
        };
      }
      if (!upgraded.paid) {
        return {
          ok: false,
          status: 402,
          message:
            "This payment method needs extra verification or was declined. Pay in Stripe instead.",
        };
      }
      await applySubscriptionToCompany(cid, upgraded.subscription);
      try {
        await syncCompanyPaymentMethodsFromStripe(cid);
      } catch (pmErr) {
        console.warn("payCompanyDealWithSavedMethod sync methods:", pmErr);
      }
      const status = await getCompanyBillingStatus(cid, {
        dealIds: params.allowedDealIds,
      });
      return {
        ok: true,
        paidDealId: String(deal.id),
        status,
      };
    }

    const sub = await createDealStripeSubscription({
      deal,
      customerId,
      paymentMethodId,
      planId: selection.planId,
      cycle: selection.cycle,
      seatBand: selection.seatBand,
      payerUserId: params.actorUserId,
      paymentBehavior: "error_if_incomplete",
      extraCompanyUsers: params.extraCompanyUsers,
    });
    if (!sub) {
      return {
        ok: false,
        status: 503,
        message: `Stripe Price is not configured for ${selection.planId} / ${selection.seatBand} seats (${selection.cycle}).`,
      };
    }

    const subStatus = String(sub.status ?? "").toLowerCase();
    if (subStatus !== "active" && subStatus !== "trialing") {
      try {
        await stripe.subscriptions.cancel(sub.id);
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        status: 402,
        message:
          "This payment method needs extra verification or was declined. Pay in Stripe instead.",
      };
    }

    await applySubscriptionToCompany(cid, sub);

    try {
      await syncCompanyPaymentMethodsFromStripe(cid);
    } catch (pmErr) {
      console.warn("payCompanyDealWithSavedMethod sync methods:", pmErr);
    }

    const status = await getCompanyBillingStatus(cid, {
      dealIds: params.allowedDealIds,
    });
    return {
      ok: true,
      paidDealId: String(deal.id),
      status,
    };
  } catch (err) {
    console.error("payCompanyDealWithSavedMethod:", err);
    if (err instanceof Stripe.errors.StripeCardError) {
      return {
        ok: false,
        status: 402,
        message: err.message || "The card was declined. Pay in Stripe or try another method.",
      };
    }
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      return {
        ok: false,
        status: 502,
        message: err.message || "Stripe rejected the payment.",
      };
    }
    const msg =
      err instanceof Error ? err.message : "Could not pay with this method";
    return { ok: false, status: 502, message: msg };
  }
}

type InvoiceWithSecrets = Stripe.Invoice & {
  confirmation_secret?: { client_secret?: string | null } | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
};

/**
 * Resolve Payment Element client_secret from an incomplete subscription invoice.
 * Supports modern confirmation_secret and legacy payment_intent expansion.
 */
async function clientSecretFromSubscriptionInvoice(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<{
  clientSecret: string;
  paymentIntentId: string | null;
  invoiceId: string | null;
} | null> {
  let invoiceRef = subscription.latest_invoice;
  let invoice: InvoiceWithSecrets | null = null;

  if (typeof invoiceRef === "string" && invoiceRef.trim()) {
    invoice = (await stripe.invoices.retrieve(invoiceRef.trim(), {
      expand: ["confirmation_secret", "payment_intent"],
    })) as InvoiceWithSecrets;
  } else if (invoiceRef && typeof invoiceRef === "object") {
    invoice = invoiceRef as InvoiceWithSecrets;
    // Re-fetch if secrets were not expanded on create.
    if (
      !invoice.confirmation_secret?.client_secret &&
      (typeof invoice.payment_intent === "string" || !invoice.payment_intent)
    ) {
      invoice = (await stripe.invoices.retrieve(invoice.id, {
        expand: ["confirmation_secret", "payment_intent"],
      })) as InvoiceWithSecrets;
    }
  }

  if (!invoice) return null;

  const fromConfirmation = invoice.confirmation_secret?.client_secret?.trim();
  if (fromConfirmation) {
    const piRef = invoice.payment_intent;
    const paymentIntentId =
      typeof piRef === "string"
        ? piRef
        : piRef && typeof piRef === "object"
          ? piRef.id
          : null;
    return {
      clientSecret: fromConfirmation,
      paymentIntentId,
      invoiceId: invoice.id,
    };
  }

  const piRef = invoice.payment_intent;
  if (piRef && typeof piRef === "object" && piRef.client_secret) {
    return {
      clientSecret: piRef.client_secret,
      paymentIntentId: piRef.id,
      invoiceId: invoice.id,
    };
  }
  if (typeof piRef === "string" && piRef.trim()) {
    const pi = await stripe.paymentIntents.retrieve(piRef.trim());
    if (pi.client_secret) {
      return {
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        invoiceId: invoice.id,
      };
    }
  }

  return null;
}

export type PaymentElementSubscriptionResult =
  | {
      ok: true;
      clientSecret: string;
      subscriptionId: string;
      customerId: string;
      publishableKey: string | null;
      paymentIntentId: string | null;
      invoiceId: string | null;
      planId: StripeBillingPlanId;
      seatBand: StripeBillingSeatBand;
      billingCycle: StripeBillingCycle;
      priceId: string;
    }
  | { ok: false; status: number; message: string };

/**
 * Option 2 — Custom Payment Element (card + ACH).
 * Creates an incomplete subscription and returns the invoice PaymentIntent client_secret.
 */
export async function createCompanySubscriptionPaymentElement(params: {
  companyId: string;
  actorUserId: string;
  planId: string;
  seatBand?: string;
  billingCycle: string;
  dealId?: string;
  extraCompanyUsers?: number;
  allowedDealIds?: string[] | null;
}): Promise<PaymentElementSubscriptionResult> {
  const cfg = getStripeConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      message: "Stripe is not configured on the server.",
    };
  }

  const selection = resolveBillingSelection(params);
  if (!selection.ok) return selection;

  const cid = normalizeCompanyId(params.companyId);
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }

  try {
    const [company] = await db
      .select({
        id: companies.id,
      })
      .from(companies)
      .where(eq(companies.id, cid))
      .limit(1);
    if (!company) {
      return { ok: false, status: 404, message: "Company not found" };
    }

    const dealId = String(params.dealId ?? "").trim();
    if (!dealId) {
      return {
        ok: false,
        status: 400,
        message: "Select a deal to pay monthly SaaS billing for.",
      };
    }
    const { loadPayableDeal, clearDealSaasSubscription, assertCheckoutPlanMatchesDeal } = await import(
      "./dealBilling.service.js"
    );
    const payable = await loadPayableDeal({
      companyId: cid,
      dealId,
      allowedDealIds: params.allowedDealIds ?? null,
    });
    if (!payable.ok) {
      return {
        ok: false,
        status: payable.status,
        message: payable.message,
      };
    }
    const deal = payable.deal;
    const planMatch = await assertCheckoutPlanMatchesDeal({
      dealId: String(deal.id),
      planId: selection.planId,
    });
    if (!planMatch.ok) {
      return {
        ok: false,
        status: planMatch.status,
        message: planMatch.message,
      };
    }
    const stripe = getStripeClient();

    const existingDealSub = deal.stripeSubscriptionId?.trim() ?? "";
    if (
      existingDealSub &&
      String(deal.stripeSubscriptionStatus ?? "none") === "incomplete"
    ) {
      try {
        await stripe.subscriptions.cancel(existingDealSub);
      } catch (cancelErr) {
        console.warn(
          "createCompanySubscriptionPaymentElement: cancel incomplete deal sub:",
          cancelErr,
        );
      }
      await clearDealSaasSubscription(String(deal.id));
    } else if (
      existingDealSub &&
      ["active", "trialing", "past_due", "unpaid"].includes(
        String(deal.stripeSubscriptionStatus ?? "none").toLowerCase(),
      )
    ) {
      return {
        ok: false,
        status: 409,
        message:
          "This deal already has a subscription. Use Pay in Stripe or a saved card to upgrade the plan.",
      };
    }

    const customerId = await ensureStripeCustomer({
      companyId: cid,
      actorUserId: params.actorUserId,
    });

    const {
      attachExtraCompanyUserInvoiceItems,
      extraCompanyUsersToCharge,
      getDealCompanyUserSnapshot,
    } = await import("./dealExtraCompanyUser.service.js");
    const snapshot = await getDealCompanyUserSnapshot(String(deal.id));
    const extraUsers = snapshot
      ? extraCompanyUsersToCharge(snapshot, params.extraCompanyUsers)
      : Math.max(0, Math.floor(params.extraCompanyUsers ?? 0));
    await attachExtraCompanyUserInvoiceItems({
      stripe,
      customerId,
      quantity: extraUsers,
      dealId: String(deal.id),
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: selection.priceId, quantity: 1 }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card", "us_bank_account"],
      },
      expand: [
        "latest_invoice.confirmation_secret",
        "latest_invoice.payment_intent",
      ],
      metadata: {
        companyId: cid,
        dealId: String(deal.id),
        dealName: deal.dealName ?? "",
        planId: selection.planId,
        billingCycle: selection.cycle,
        seatBand: selection.seatBand,
        checkoutMode: "payment_element",
        billingScope: "deal",
        extraCompanyUsers: String(extraUsers),
        payerUserId: params.actorUserId,
      },
    });

    const secrets = await clientSecretFromSubscriptionInvoice(
      stripe,
      subscription,
    );
    if (!secrets?.clientSecret) {
      try {
        await stripe.subscriptions.cancel(subscription.id);
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        status: 502,
        message:
          "Stripe did not return a Payment Element client secret for this subscription invoice.",
      };
    }

    await applySubscriptionToCompany(cid, subscription);

    return {
      ok: true,
      clientSecret: secrets.clientSecret,
      subscriptionId: subscription.id,
      customerId,
      publishableKey: cfg.publishableKey,
      paymentIntentId: secrets.paymentIntentId,
      invoiceId: secrets.invoiceId,
      planId: selection.planId,
      seatBand: selection.seatBand,
      billingCycle: selection.cycle,
      priceId: selection.priceId,
    };
  } catch (err) {
    console.error("createCompanySubscriptionPaymentElement:", err);
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      return {
        ok: false,
        status: 502,
        message: err.message || "Stripe rejected the subscription request.",
      };
    }
    const msg =
      err instanceof Error
        ? err.message
        : "Could not create Payment Element subscription";
    return { ok: false, status: 502, message: msg };
  }
}

export type SetupIntentResult =
  | {
      ok: true;
      clientSecret: string;
      setupIntentId: string;
      customerId: string;
      publishableKey: string | null;
    }
  | { ok: false; status: number; message: string };

/**
 * Save card / ACH for future off-session charges (Manage billing → Add method).
 */
export async function createCompanySetupIntent(params: {
  companyId: string;
  actorUserId: string;
}): Promise<SetupIntentResult> {
  const cfg = getStripeConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      message: "Stripe is not configured on the server.",
    };
  }

  const cid = normalizeCompanyId(params.companyId);
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }

  try {
    const customerId = await ensureStripeCustomer({
      companyId: cid,
      actorUserId: params.actorUserId,
    });
    const stripe = getStripeClient();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card", "us_bank_account"],
      usage: "off_session",
      payment_method_options: {
        us_bank_account: {
          financial_connections: {
            permissions: ["payment_method"],
          },
        },
      },
      metadata: {
        companyId: cid,
      },
    });

    if (!setupIntent.client_secret) {
      return {
        ok: false,
        status: 502,
        message: "Stripe did not return a SetupIntent client secret.",
      };
    }

    return {
      ok: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      customerId,
      publishableKey: cfg.publishableKey,
    };
  } catch (err) {
    console.error("createCompanySetupIntent:", err);
    const msg =
      err instanceof Error ? err.message : "Could not create SetupIntent";
    return { ok: false, status: 502, message: msg };
  }
}

export type SyncSubscriptionPaymentResult =
  | { ok: true; status: CompanyBillingStatus }
  | { ok: false; status: number; message: string };

/**
 * Post-confirm sync after Payment Element (return_url or same-page success).
 * Body may include subscriptionId and/or paymentIntentId.
 */
export async function syncCompanySubscriptionPayment(params: {
  companyId: string;
  subscriptionId?: string;
  paymentIntentId?: string;
}): Promise<SyncSubscriptionPaymentResult> {
  const cfg = getStripeConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      message: "Stripe is not configured on the server.",
    };
  }

  const cid = normalizeCompanyId(params.companyId);
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }

  const stripe = getStripeClient();
  let subscriptionId = String(params.subscriptionId ?? "").trim();
  const paymentIntentId = String(params.paymentIntentId ?? "").trim();

  try {
    if (!subscriptionId && paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      const invoiceId = stripeIdRef(
        (pi as Stripe.PaymentIntent & { invoice?: string | { id?: string } | null })
          .invoice,
      );
      if (invoiceId) {
        const inv = await stripe.invoices.retrieve(invoiceId);
        subscriptionId = subscriptionIdFromInvoice(inv) ?? "";
      }
    }

    if (!subscriptionId) {
      const [row] = await db
        .select({ stripeSubscriptionId: companies.stripeSubscriptionId })
        .from(companies)
        .where(eq(companies.id, cid))
        .limit(1);
      subscriptionId = row?.stripeSubscriptionId?.trim() ?? "";
    }

    if (!subscriptionId) {
      return {
        ok: false,
        status: 400,
        message: "subscriptionId or paymentIntentId is required.",
      };
    }

    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price", "latest_invoice"],
    });
    const metaCompany = normalizeCompanyId(sub.metadata?.companyId ?? null);
    if (metaCompany && metaCompany !== cid) {
      return {
        ok: false,
        status: 403,
        message: "Subscription does not belong to this company.",
      };
    }

    let paidSub = sub;
    if (String(sub.status ?? "").toLowerCase() === "incomplete") {
      for (let i = 0; i < 4; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        paidSub = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });
        const st = String(paidSub.status ?? "").toLowerCase();
        if (st === "active" || st === "trialing" || st !== "incomplete") break;
      }
    }

    await applySubscriptionToCompany(cid, paidSub);
    await syncDealSubscriptionsAfterCompanyPayment(cid);
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
    try {
      await persistInvoicesForSubscription({
        companyId: cid,
        subscriptionId: sub.id,
        customerId,
      });
    } catch (invErr) {
      console.warn("syncCompanySubscriptionPayment invoices:", invErr);
    }
    if (customerId) {
      try {
        await syncCompanyPaymentMethodsFromStripe(cid);
      } catch (pmErr) {
        console.warn("syncCompanySubscriptionPayment payment methods:", pmErr);
      }
    }

    const status = await getCompanyBillingStatus(cid);
    if (!status) {
      return { ok: false, status: 404, message: "Company not found" };
    }
    return { ok: true, status };
  } catch (err) {
    console.error("syncCompanySubscriptionPayment:", err);
    const msg =
      err instanceof Error
        ? err.message
        : "Could not sync subscription payment";
    return { ok: false, status: 502, message: msg };
  }
}

export type PortalResult =
  | { ok: true; url: string }
  | { ok: false; status: number; message: string };

export async function createCompanyBillingPortalSession(params: {
  companyId: string;
  actorUserId: string;
}): Promise<PortalResult> {
  if (!getStripeConfig()) {
    return {
      ok: false,
      status: 503,
      message: "Stripe is not configured on the server.",
    };
  }

  const cid = normalizeCompanyId(params.companyId);
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }

  const frontend = resolveFrontendOrigin();
  if (!frontend) {
    return {
      ok: false,
      status: 503,
      message:
        "BASE_URL must be set so Stripe can redirect after the portal.",
    };
  }

  try {
    const customerId = await ensureStripeCustomer({
      companyId: cid,
      actorUserId: params.actorUserId,
    });
    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontend}/settings?billing=portal_return`,
    });
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("createCompanyBillingPortalSession:", err);
    const msg =
      err instanceof Error ? err.message : "Could not open billing portal";
    return { ok: false, status: 502, message: msg };
  }
}

export type BillingInvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  planId: string | null;
  status: string;
  amount: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  paymentFailureMessage: string | null;
  paymentFailedAt: string | null;
  dealId: string | null;
  dealName: string | null;
  billingScope?: "deal" | "extra_company_user" | null;
};

function extrasFromStripeInvoice(inv: Stripe.Invoice): {
  periodStart: string;
  periodEnd: string;
  planId: string | null;
  dealId: string | null;
} {
  const line = inv.lines?.data?.[0];
  const period =
    line && typeof line === "object" && "period" in line
      ? (line as { period?: { start?: number | null; end?: number | null } })
          .period
      : undefined;
  const legacy = inv as { period_start?: number; period_end?: number };
  const startUnix = period?.start ?? legacy.period_start;
  const endUnix = period?.end ?? legacy.period_end;
  const periodStart =
    startUnix != null && Number.isFinite(startUnix)
      ? isoDateOnly(new Date(startUnix * 1000))
      : "";
  const periodEnd =
    endUnix != null && Number.isFinite(endUnix)
      ? isoDateOnly(new Date(endUnix * 1000))
      : "";

  let priceId: string | null = null;
  if (line && typeof line === "object") {
    const row = line as {
      pricing?: { price_details?: { price?: string | null } | null } | null;
      price?: string | { id?: string } | null;
    };
    const fromPricing = row.pricing?.price_details?.price?.trim();
    if (fromPricing) priceId = fromPricing;
    else if (typeof row.price === "string") priceId = row.price.trim();
    else if (row.price && typeof row.price === "object") {
      priceId = String(row.price.id ?? "").trim() || null;
    }
  }
  const mapped = planAndCycleFromPriceId(priceId);
  const metaDealId = String(inv.metadata?.dealId ?? "").trim().toLowerCase();
  const lineMeta =
    line && typeof line === "object"
      ? String(
          (line as { metadata?: { dealId?: string } }).metadata?.dealId ?? "",
        )
          .trim()
          .toLowerCase()
      : "";
  return {
    periodStart,
    periodEnd,
    planId: mapped.planId,
    dealId: metaDealId || lineMeta || null,
  };
}

function formatMoneyCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
  }).format((cents || 0) / 100);
}

function isoDateOnly(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

async function mapCompanyDealNames(
  companyId: string,
  dealIdFilter?: string[] | null,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const conditions = [eq(addDealForm.organizationId, companyId)];
  if (dealIdFilter && dealIdFilter.length > 0) {
    conditions.push(inArray(addDealForm.id, dealIdFilter));
  }
  const rows = await db
    .select({ id: addDealForm.id, dealName: addDealForm.dealName })
    .from(addDealForm)
    .where(and(...conditions));
  for (const row of rows) {
    names.set(String(row.id).toLowerCase(), String(row.dealName ?? "").trim());
  }
  return names;
}

function extraCompanyUserInvoiceRow(params: {
  id: string;
  createdUnix: number;
  amountCents: number;
  currency: string;
  status: string;
  dealId: string | null;
  dealName: string | null;
  hostedInvoiceUrl?: string | null;
}): BillingInvoiceRow {
  const date = isoDateOnly(new Date(params.createdUnix * 1000));
  return {
    id: params.id,
    invoiceNumber: "Extra company user",
    invoiceDate: date,
    dueDate: date,
    periodStart: date,
    periodEnd: date,
    planId: null,
    status: params.status,
    amount: formatMoneyCents(params.amountCents, params.currency),
    hostedInvoiceUrl: params.hostedInvoiceUrl ?? null,
    invoicePdf: null,
    paymentFailureMessage: null,
    paymentFailedAt: null,
    dealId: params.dealId,
    dealName: params.dealName,
    billingScope: "extra_company_user",
  };
}

async function listExtraCompanyUserInvoiceRows(params: {
  stripe: Stripe;
  customerId: string;
  dealNames: Map<string, string>;
  allowedDealIds?: string[] | null;
}): Promise<BillingInvoiceRow[]> {
  const allowed = Array.isArray(params.allowedDealIds)
    ? new Set(params.allowedDealIds.map((id) => id.toLowerCase()))
    : null;
  const rows: BillingInvoiceRow[] = [];
  const seen = new Set<string>();

  const resolveDeal = (rawId: string, rawName: string) => {
    const dealId = rawId.trim().toLowerCase();
    if (!dealId) {
      return { dealId: null as string | null, dealName: null as string | null };
    }
    if (allowed && !allowed.has(dealId)) return null;
    const dealName = rawName.trim() || params.dealNames.get(dealId) || null;
    return { dealId, dealName };
  };

  try {
    const sessions = await params.stripe.checkout.sessions.list({
      customer: params.customerId,
      limit: 50,
    });
    for (const session of sessions.data) {
      if (String(session.metadata?.billingScope ?? "") !== "extra_company_user") {
        continue;
      }
      const deal = resolveDeal(
        String(session.metadata?.dealId ?? ""),
        String(session.metadata?.dealName ?? ""),
      );
      if (!deal) continue;
      const paid = String(session.payment_status ?? "").toLowerCase() === "paid";
      const pi =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? "";
      if (pi) seen.add(pi);
      seen.add(session.id);
      rows.push(
        extraCompanyUserInvoiceRow({
          id: session.id,
          createdUnix: session.created,
          amountCents: session.amount_total ?? 0,
          currency: session.currency ?? "usd",
          status: paid ? "paid" : String(session.payment_status ?? "open"),
          dealId: deal.dealId,
          dealName: deal.dealName,
          hostedInvoiceUrl: session.url,
        }),
      );
    }
  } catch (err) {
    console.warn("listExtraCompanyUserInvoiceRows checkout sessions:", err);
  }

  try {
    const intents = await params.stripe.paymentIntents.list({
      customer: params.customerId,
      limit: 50,
    });
    for (const pi of intents.data) {
      if (String(pi.metadata?.billingScope ?? "") !== "extra_company_user") {
        continue;
      }
      if (seen.has(pi.id)) continue;
      const deal = resolveDeal(
        String(pi.metadata?.dealId ?? ""),
        String(pi.metadata?.dealName ?? ""),
      );
      if (!deal) continue;
      const succeeded = String(pi.status ?? "").toLowerCase() === "succeeded";
      rows.push(
        extraCompanyUserInvoiceRow({
          id: pi.id,
          createdUnix: pi.created,
          amountCents: pi.amount_received || pi.amount || 0,
          currency: pi.currency ?? "usd",
          status: succeeded ? "paid" : String(pi.status ?? "open"),
          dealId: deal.dealId,
          dealName: deal.dealName,
        }),
      );
    }
  } catch (err) {
    console.warn("listExtraCompanyUserInvoiceRows payment intents:", err);
  }

  return rows;
}

async function recordBillingEvent(params: {
  companyId: string | null;
  stripeEventId?: string | null;
  eventType: string;
  stripeInvoiceId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  message?: string | null;
  payload?: unknown;
}): Promise<{ inserted: boolean }> {
  const eventId = params.stripeEventId?.trim() || null;
  try {
    if (eventId) {
      const inserted = await db
        .insert(companyBillingEvents)
        .values({
          companyId: params.companyId,
          stripeEventId: eventId,
          eventType: params.eventType,
          stripeInvoiceId: params.stripeInvoiceId?.trim() || null,
          stripeSubscriptionId: params.stripeSubscriptionId?.trim() || null,
          stripeCustomerId: params.stripeCustomerId?.trim() || null,
          message: params.message?.trim() || null,
          payload: params.payload ?? null,
        })
        .onConflictDoNothing({
          target: companyBillingEvents.stripeEventId,
        })
        .returning({ id: companyBillingEvents.id });
      return { inserted: inserted.length > 0 };
    }

    await db.insert(companyBillingEvents).values({
      companyId: params.companyId,
      stripeEventId: null,
      eventType: params.eventType,
      stripeInvoiceId: params.stripeInvoiceId?.trim() || null,
      stripeSubscriptionId: params.stripeSubscriptionId?.trim() || null,
      stripeCustomerId: params.stripeCustomerId?.trim() || null,
      message: params.message?.trim() || null,
      payload: params.payload ?? null,
    });
    return { inserted: true };
  } catch (err) {
    console.warn("recordBillingEvent:", err);
    return { inserted: false };
  }
}

/** Returns true if this Stripe event id was newly claimed (not a retry). */
async function claimStripeEvent(params: {
  eventId: string;
  eventType: string;
  companyId?: string | null;
  message?: string | null;
  payload?: unknown;
}): Promise<boolean> {
  const { inserted } = await recordBillingEvent({
    companyId: params.companyId ?? null,
    stripeEventId: params.eventId,
    eventType: params.eventType,
    message: params.message ?? "claimed",
    payload: params.payload,
  });
  return inserted;
}

export async function upsertBillingInvoiceFromStripe(params: {
  companyId: string;
  invoice: Stripe.Invoice;
  paymentFailureMessage?: string | null;
  markFailed?: boolean;
  markPaid?: boolean;
}): Promise<void> {
  const cid = normalizeCompanyId(params.companyId);
  if (!cid) return;
  const inv = params.invoice;
  const invoiceId = String(inv.id ?? "").trim();
  if (!invoiceId) return;

  const customerId =
    typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
  const subscriptionId = subscriptionIdFromInvoice(inv);

  const invoiceDate = inv.created
    ? new Date(inv.created * 1000)
    : null;
  const dueDate = inv.due_date ? new Date(inv.due_date * 1000) : invoiceDate;
  const paidAt =
    params.markPaid || inv.status === "paid"
      ? inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : new Date()
      : null;
  const failureMessage =
    params.paymentFailureMessage?.trim() ||
    (params.markFailed ? "Payment failed" : null);
  const paymentFailedAt = params.markFailed
    ? new Date()
    : failureMessage
      ? new Date()
      : null;

  const preserveFailures = !params.markPaid && !params.markFailed;
  const values = {
    companyId: cid,
    stripeInvoiceId: invoiceId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    invoiceNumber: inv.number || invoiceId,
    status: String(inv.status ?? "open"),
    currency: String(inv.currency ?? "usd"),
    amountDueCents: inv.amount_due ?? inv.total ?? 0,
    amountPaidCents: inv.amount_paid ?? 0,
    amountRemainingCents: inv.amount_remaining ?? 0,
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdf: inv.invoice_pdf ?? null,
    paymentFailureMessage: params.markPaid
      ? null
      : params.markFailed
        ? failureMessage
        : null,
    paymentFailedAt: params.markPaid
      ? null
      : params.markFailed
        ? paymentFailedAt
        : null,
    paidAt,
    invoiceDate,
    dueDate,
    updatedAt: new Date(),
  };

  await db
    .insert(companyBillingInvoices)
    .values(values)
    .onConflictDoUpdate({
      target: companyBillingInvoices.stripeInvoiceId,
      set: {
        stripeCustomerId: values.stripeCustomerId,
        stripeSubscriptionId: values.stripeSubscriptionId,
        invoiceNumber: values.invoiceNumber,
        status: values.status,
        currency: values.currency,
        amountDueCents: values.amountDueCents,
        amountPaidCents: values.amountPaidCents,
        amountRemainingCents: values.amountRemainingCents,
        hostedInvoiceUrl: values.hostedInvoiceUrl,
        invoicePdf: values.invoicePdf,
        // Refreshing from Stripe list must not wipe webhook failure details.
        ...(preserveFailures
          ? {}
          : {
              paymentFailureMessage: values.paymentFailureMessage,
              paymentFailedAt: values.paymentFailedAt,
            }),
        ...(params.markPaid || paidAt ? { paidAt: values.paidAt } : {}),
        invoiceDate: values.invoiceDate,
        dueDate: values.dueDate,
        updatedAt: values.updatedAt,
      },
    });
}

export async function listCompanyStripeInvoices(
  companyId: string,
  options?: { dealIds?: string[] | null },
): Promise<
  | { ok: true; invoices: BillingInvoiceRow[] }
  | { ok: false; status: number; message: string }
> {
  const cid = normalizeCompanyId(companyId);
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }

  const [company] = await db
    .select({
      id: companies.id,
      stripeCustomerId: companies.stripeCustomerId,
    })
    .from(companies)
    .where(eq(companies.id, cid))
    .limit(1);
  if (!company) {
    return { ok: false, status: 404, message: "Company not found" };
  }

  const extrasByInvoice = new Map<
    string,
    ReturnType<typeof extrasFromStripeInvoice>
  >();

  // Prefer refreshing from Stripe when configured, then serve from DB.
  if (getStripeConfig() && company.stripeCustomerId?.trim()) {
    try {
      const stripe = getStripeClient();
      const list = await stripe.invoices.list({
        customer: company.stripeCustomerId.trim(),
        limit: 50,
        expand: ["data.lines"],
      });
      for (const inv of list.data) {
        await upsertBillingInvoiceFromStripe({
          companyId: cid,
          invoice: inv,
          markPaid: inv.status === "paid",
        });
        extrasByInvoice.set(inv.id, extrasFromStripeInvoice(inv));
      }
    } catch (err) {
      console.warn("listCompanyStripeInvoices Stripe refresh:", err);
    }
  }

  const rows = await db
    .select()
    .from(companyBillingInvoices)
    .where(eq(companyBillingInvoices.companyId, cid))
    .orderBy(desc(companyBillingInvoices.invoiceDate))
    .limit(50);

  const { mapStripeSubscriptionsToDeals } = await import(
    "./dealBilling.service.js"
  );
  const dealBySub = await mapStripeSubscriptionsToDeals(
    cid,
    options?.dealIds ?? null,
  );
  const dealNames = await mapCompanyDealNames(cid, options?.dealIds ?? null);
  const scoped = Array.isArray(options?.dealIds);
  if (scoped && (options?.dealIds?.length ?? 0) === 0) {
    return { ok: true, invoices: [] };
  }
  const allowedDealIds = scoped
    ? new Set((options?.dealIds ?? []).map((id) => id.toLowerCase()))
    : null;

  const invoices: BillingInvoiceRow[] = [];
  for (const row of rows) {
    const sub = row.stripeSubscriptionId?.trim() ?? "";
    const deal = sub ? dealBySub.get(sub) : undefined;
    const extras = extrasByInvoice.get(row.stripeInvoiceId);
    const metaDealId = extras?.dealId ?? null;
    const dealId = deal?.dealId ?? metaDealId;
    if (scoped && (!dealId || (allowedDealIds && !allowedDealIds.has(dealId)))) {
      continue;
    }
    const invoiceDate = isoDateOnly(row.invoiceDate);
    const dueDate = isoDateOnly(row.dueDate) || invoiceDate;
    const dealName =
      (deal?.dealName?.trim() ? deal.dealName : null) ||
      (dealId ? dealNames.get(dealId) || null : null);
    invoices.push({
      id: row.stripeInvoiceId,
      invoiceNumber: row.invoiceNumber || row.stripeInvoiceId,
      invoiceDate,
      dueDate,
      periodStart: extras?.periodStart || invoiceDate,
      periodEnd: extras?.periodEnd || dueDate,
      planId: extras?.planId ?? null,
      status: row.status,
      amount: formatMoneyCents(
        row.status === "paid"
          ? row.amountPaidCents || row.amountDueCents
          : row.amountDueCents,
        row.currency,
      ),
      hostedInvoiceUrl: row.hostedInvoiceUrl,
      invoicePdf: row.invoicePdf,
      paymentFailureMessage: row.paymentFailureMessage,
      paymentFailedAt: row.paymentFailedAt
        ? row.paymentFailedAt.toISOString()
        : null,
      dealId,
      dealName,
      billingScope: "deal",
    });
  }

  const customerId = company.stripeCustomerId?.trim();
  if (getStripeConfig() && customerId) {
    const extraRows = await listExtraCompanyUserInvoiceRows({
      stripe: getStripeClient(),
      customerId,
      dealNames,
      allowedDealIds: options?.dealIds ?? null,
    });
    invoices.push(...extraRows);
    invoices.sort((a, b) => String(b.invoiceDate).localeCompare(String(a.invoiceDate)));
  }

  return { ok: true, invoices };
}

function priceIdFromSubscription(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  if (!price) return null;
  return typeof price === "string" ? price : price.id;
}

function subscriptionIdFromInvoice(inv: Stripe.Invoice): string | null {
  const nested = inv.parent?.subscription_details?.subscription;
  if (nested) {
    return typeof nested === "string" ? nested : nested.id ?? null;
  }
  // Legacy fallback for older API payloads / expansions.
  const legacy = (inv as { subscription?: string | { id?: string } | null })
    .subscription;
  if (!legacy) return null;
  return typeof legacy === "string" ? legacy : legacy.id ?? null;
}

async function syncDealSubscriptionsAfterCompanyPayment(
  companyId: string,
): Promise<void> {
  try {
    const { syncCompanyDealSaasSubscriptions } = await import(
      "./dealBilling.service.js"
    );
    await syncCompanyDealSaasSubscriptions(companyId);
  } catch (err) {
    console.warn("syncDealSubscriptionsAfterCompanyPayment:", err);
  }
}

export async function applySubscriptionToCompany(
  companyId: string,
  sub: Stripe.Subscription,
  extras?: { dealId?: string | null },
): Promise<void> {
  const cid = normalizeCompanyId(companyId);
  if (!cid) return;

  const priceId = priceIdFromSubscription(sub);
  const mapped = planAndCycleFromPriceId(priceId);
  const metaPlan = String(sub.metadata?.planId ?? "").trim();
  const metaCycle = String(sub.metadata?.billingCycle ?? "").trim();
  const planId =
    mapped.planId ?? normalizeBillingPlanId(metaPlan);
  const cycle =
    mapped.cycle ??
    (metaCycle === "monthly" || metaCycle === "annual" || metaCycle === "yearly"
      ? metaCycle === "yearly"
        ? "annual"
        : (metaCycle as "monthly" | "annual")
      : null);

  const status = String(sub.status ?? "none");
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

  const clearFailure =
    status === "active" || status === "trialing" || status === "canceled";

  const dealIdRaw = String(
    sub.metadata?.dealId ?? extras?.dealId ?? "",
  ).trim();
  const isDealScoped = Boolean(dealIdRaw);

  const [existing] = await db
    .select({ stripeSubscriptionId: companies.stripeSubscriptionId })
    .from(companies)
    .where(eq(companies.id, cid))
    .limit(1);
  const existingSub = existing?.stripeSubscriptionId?.trim() ?? "";
  const writeCompanySub =
    !existingSub || existingSub === sub.id || !isDealScoped;

  await db
    .update(companies)
    .set({
      stripeCustomerId: customerId,
      ...(writeCompanySub
        ? {
            stripeSubscriptionId: sub.id,
            stripePlanId: planId,
            stripeBillingCycle: cycle,
            stripeSubscriptionStatus: status || "none",
            stripePriceId: priceId,
            stripeCurrentPeriodEnd: periodEndFromSubscription(sub),
          }
        : {}),
      ...(clearFailure
        ? {
            stripeLastPaymentError: null,
            stripeLastPaymentFailedAt: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, cid));

  try {
    const dealBilling = await import("./dealBilling.service.js");
    if (dealIdRaw) {
      await dealBilling.applyStripeSubscriptionToDeal(dealIdRaw, sub);
    }
    await dealBilling.refreshCompanyBillingFromDeals(cid);
  } catch (err) {
    console.warn("applySubscriptionToCompany deal billing:", err);
  }

  if (dealIdRaw && (status === "active" || status === "trialing")) {
    releaseBillingPaymentHold(cid, dealIdRaw);
  }
}

export async function clearCompanySubscription(
  companyId: string,
  opts?: { keepCustomer?: boolean },
): Promise<void> {
  const cid = normalizeCompanyId(companyId);
  if (!cid) return;
  await db
    .update(companies)
    .set({
      stripeSubscriptionId: null,
      stripePlanId: null,
      stripeBillingCycle: null,
      stripeSubscriptionStatus: "canceled",
      stripePriceId: null,
      stripeCurrentPeriodEnd: null,
      ...(opts?.keepCustomer ? {} : {}),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, cid));
}

async function persistInvoicesForSubscription(params: {
  companyId: string;
  subscriptionId: string;
  customerId?: string | null;
}): Promise<void> {
  const cid = normalizeCompanyId(params.companyId);
  if (!cid) return;
  const stripe = getStripeClient();

  const sub = await stripe.subscriptions.retrieve(params.subscriptionId, {
    expand: ["latest_invoice"],
  });

  const latest = sub.latest_invoice;
  if (latest && typeof latest !== "string") {
    await upsertBillingInvoiceFromStripe({
      companyId: cid,
      invoice: latest,
      markPaid: latest.status === "paid",
      markFailed: latest.status === "open" && (latest.attempt_count ?? 0) > 0,
    });
  } else if (typeof latest === "string" && latest.trim()) {
    const inv = await stripe.invoices.retrieve(latest.trim());
    await upsertBillingInvoiceFromStripe({
      companyId: cid,
      invoice: inv,
      markPaid: inv.status === "paid",
    });
  }

  const customerId =
    params.customerId?.trim() ||
    (typeof sub.customer === "string" ? sub.customer : sub.customer?.id) ||
    "";
  if (customerId) {
    const list = await stripe.invoices.list({
      customer: customerId,
      subscription: params.subscriptionId,
      limit: 10,
    });
    for (const inv of list.data) {
      await upsertBillingInvoiceFromStripe({
        companyId: cid,
        invoice: inv,
        markPaid: inv.status === "paid",
        markFailed: inv.status === "open" && (inv.attempt_count ?? 0) > 0,
      });
    }
  }
}

/**
 * Sync company billing from a Checkout Session id (success redirect).
 * Works locally and in production even if the webhook is delayed/missing briefly.
 */
export async function syncCompanyBillingFromCheckoutSession(params: {
  companyId: string;
  checkoutSessionId: string;
}): Promise<
  | { ok: true; status: CompanyBillingStatus; paidDealId: string | null }
  | { ok: false; status: number; message: string }
> {
  if (!getStripeConfig()) {
    return {
      ok: false,
      status: 503,
      message: "Stripe is not configured on the server.",
    };
  }

  const cid = normalizeCompanyId(params.companyId);
  const sessionId = String(params.checkoutSessionId ?? "").trim();
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }
  if (!sessionId.startsWith("cs_")) {
    return { ok: false, status: 400, message: "Invalid checkout session id" };
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.latest_invoice", "invoice"],
    });
    if (session.mode !== "subscription") {
      return {
        ok: false,
        status: 400,
        message: "Checkout session is not a subscription.",
      };
    }

    const metaCompany = String(session.metadata?.companyId ?? "").trim();
    const refCompany = String(session.client_reference_id ?? "").trim();
    const sessionCompany = normalizeCompanyId(metaCompany || refCompany);
    if (!sessionCompany || sessionCompany !== cid) {
      return {
        ok: false,
        status: 403,
        message: "Checkout session does not belong to this company.",
      };
    }
    if (session.status !== "complete") {
      return {
        ok: false,
        status: 409,
        message: "Checkout is not complete yet.",
      };
    }

    const subRef = session.subscription;
    const subId = typeof subRef === "string" ? subRef : subRef?.id;
    if (!subId) {
      return {
        ok: false,
        status: 409,
        message: "Subscription is not ready yet. Try again in a moment.",
      };
    }

    const sub =
      typeof subRef === "string"
        ? await stripe.subscriptions.retrieve(subId, {
            expand: ["items.data.price"],
          })
        : (subRef as Stripe.Subscription);
    const sessionDealId = String(session.metadata?.dealId ?? "").trim();
    await applySubscriptionToCompany(cid, sub, { dealId: sessionDealId });
    await syncDealSubscriptionsAfterCompanyPayment(cid);

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? null;

    // Stripe generates the subscription invoice automatically — persist it in our DB.
    try {
      const sessionInvoice = (
        session as { invoice?: string | Stripe.Invoice | null }
      ).invoice;
      if (sessionInvoice && typeof sessionInvoice !== "string") {
        await upsertBillingInvoiceFromStripe({
          companyId: cid,
          invoice: sessionInvoice,
          markPaid: sessionInvoice.status === "paid",
        });
      } else if (typeof sessionInvoice === "string" && sessionInvoice.trim()) {
        const inv = await stripe.invoices.retrieve(sessionInvoice.trim());
        await upsertBillingInvoiceFromStripe({
          companyId: cid,
          invoice: inv,
          markPaid: inv.status === "paid",
        });
      }
      await persistInvoicesForSubscription({
        companyId: cid,
        subscriptionId: subId,
        customerId,
      });
    } catch (invErr) {
      console.warn("sync checkout invoice snapshot:", invErr);
    }

    await recordBillingEvent({
      companyId: cid,
      eventType: "checkout.session.synced",
      stripeSubscriptionId: subId,
      stripeCustomerId: customerId,
      message: "Checkout session synced from success redirect",
      payload: { sessionId },
    });

    if (customerId) {
      try {
        await syncCompanyPaymentMethodsFromStripe(cid);
      } catch (pmErr) {
        console.warn("sync checkout payment methods:", pmErr);
      }
    }

    const status = await getCompanyBillingStatus(cid);
    if (!status) {
      return { ok: false, status: 404, message: "Company not found" };
    }
    const paidDealId =
      normalizeCompanyId(String(session.metadata?.dealId ?? "")) ||
      normalizeCompanyId(String(sub.metadata?.dealId ?? "")) ||
      null;
    return { ok: true, status, paidDealId };
  } catch (err) {
    console.error("syncCompanyBillingFromCheckoutSession:", err);
    const msg =
      err instanceof Error ? err.message : "Could not sync checkout session";
    return { ok: false, status: 502, message: msg };
  }
}

async function findCompanyIdForStripeCustomer(
  customerId: string,
): Promise<string | null> {
  const id = String(customerId ?? "").trim();
  if (!id) return null;
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.stripeCustomerId, id))
    .limit(1);
  return row?.id ?? null;
}

async function findCompanyIdForSubscription(
  subscriptionId: string,
): Promise<string | null> {
  const id = String(subscriptionId ?? "").trim();
  if (!id) return null;
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.stripeSubscriptionId, id))
    .limit(1);
  if (row?.id) return row.id;
  try {
    const { findCompanyIdForDealSubscription } = await import(
      "./dealBilling.service.js"
    );
    return findCompanyIdForDealSubscription(id);
  } catch (err) {
    console.warn("findCompanyIdForSubscription deal lookup:", err);
    return null;
  }
}

export type CompanyBillingPaymentMethodDto = {
  id: string;
  stripePaymentMethodId: string;
  stripeCustomerId: string | null;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  funding: string | null;
  country: string | null;
  fingerprint: string | null;
  billingName: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
  billingAddress: unknown;
  isDefault: boolean;
  livemode: boolean;
  stripeCreatedAt: string | null;
  /** Full Stripe PaymentMethod object snapshot. */
  stripePayload: unknown;
  detachedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function stripeIdRef(
  value: string | { id?: string | null } | null | undefined,
): string | null {
  if (typeof value === "string") {
    const s = value.trim();
    return s || null;
  }
  if (value && typeof value === "object" && typeof value.id === "string") {
    const s = value.id.trim();
    return s || null;
  }
  return null;
}

function paymentMethodRowFields(
  pm: Stripe.PaymentMethod,
  opts?: { isDefault?: boolean },
) {
  const card = pm.card ?? null;
  const bank = pm.us_bank_account ?? null;
  const billing = pm.billing_details ?? null;
  const brand =
    card?.brand?.trim() ||
    bank?.bank_name?.trim() ||
    (pm.type === "link" ? "link" : null);
  const last4 = card?.last4?.trim() || bank?.last4?.trim() || null;
  const fingerprint =
    card?.fingerprint?.trim() || bank?.fingerprint?.trim() || null;
  const country = card?.country?.trim() || null;
  const funding = card?.funding?.trim() || null;

  return {
    stripePaymentMethodId: pm.id,
    stripeCustomerId: stripeIdRef(pm.customer),
    type: (pm.type || "card").trim() || "card",
    brand,
    last4,
    expMonth: card?.exp_month ?? null,
    expYear: card?.exp_year ?? null,
    funding,
    country,
    fingerprint,
    billingName: billing?.name?.trim() || null,
    billingEmail: billing?.email?.trim() || null,
    billingPhone: billing?.phone?.trim() || null,
    billingAddress: billing?.address ?? null,
    isDefault: Boolean(opts?.isDefault),
    livemode: Boolean(pm.livemode),
    stripeCreatedAt:
      typeof pm.created === "number" ? new Date(pm.created * 1000) : null,
    stripePayload: pm as unknown as Record<string, unknown>,
    detachedAt: null as Date | null,
    updatedAt: new Date(),
  };
}

export async function upsertPaymentMethodFromStripe(params: {
  companyId: string;
  paymentMethod: Stripe.PaymentMethod;
  isDefault?: boolean;
}): Promise<void> {
  const cid = normalizeCompanyId(params.companyId);
  if (!cid || !params.paymentMethod?.id) return;
  const fields = paymentMethodRowFields(params.paymentMethod, {
    isDefault: params.isDefault,
  });

  await db
    .insert(companyBillingPaymentMethods)
    .values({
      companyId: cid,
      ...fields,
    })
    .onConflictDoUpdate({
      target: companyBillingPaymentMethods.stripePaymentMethodId,
      set: {
        companyId: cid,
        ...fields,
      },
    });

  if (params.isDefault) {
    await db
      .update(companyBillingPaymentMethods)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(companyBillingPaymentMethods.companyId, cid),
          ne(
            companyBillingPaymentMethods.stripePaymentMethodId,
            params.paymentMethod.id,
          ),
          eq(companyBillingPaymentMethods.isDefault, true),
        ),
      );
  }
}

async function markPaymentMethodDetached(
  stripePaymentMethodId: string,
): Promise<void> {
  const pmId = String(stripePaymentMethodId ?? "").trim();
  if (!pmId) return;
  await db
    .update(companyBillingPaymentMethods)
    .set({
      isDefault: false,
      detachedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companyBillingPaymentMethods.stripePaymentMethodId, pmId));
}

async function resolveDefaultPaymentMethodId(
  customerId: string,
): Promise<string | null> {
  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || ("deleted" in customer && customer.deleted)) return null;
  return stripeIdRef(customer.invoice_settings?.default_payment_method);
}

async function syncDefaultPaymentMethodFlags(params: {
  companyId: string;
  customerId: string;
}): Promise<void> {
  const defaultPmId = await resolveDefaultPaymentMethodId(params.customerId);
  await db
    .update(companyBillingPaymentMethods)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(companyBillingPaymentMethods.companyId, params.companyId));
  if (!defaultPmId) return;
  await db
    .update(companyBillingPaymentMethods)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(
      and(
        eq(companyBillingPaymentMethods.companyId, params.companyId),
        eq(companyBillingPaymentMethods.stripePaymentMethodId, defaultPmId),
        isNull(companyBillingPaymentMethods.detachedAt),
      ),
    );
}

export async function listCompanyPaymentMethods(
  companyId: string,
  opts?: { includeDetached?: boolean },
): Promise<CompanyBillingPaymentMethodDto[]> {
  const cid = normalizeCompanyId(companyId);
  if (!cid) return [];

  const rows = await db
    .select()
    .from(companyBillingPaymentMethods)
    .where(
      opts?.includeDetached
        ? eq(companyBillingPaymentMethods.companyId, cid)
        : and(
            eq(companyBillingPaymentMethods.companyId, cid),
            isNull(companyBillingPaymentMethods.detachedAt),
          ),
    )
    .orderBy(
      desc(companyBillingPaymentMethods.isDefault),
      desc(companyBillingPaymentMethods.createdAt),
    );

  return rows.map((row) => ({
    id: row.id,
    stripePaymentMethodId: row.stripePaymentMethodId,
    stripeCustomerId: row.stripeCustomerId,
    type: row.type,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.expMonth,
    expYear: row.expYear,
    funding: row.funding,
    country: row.country,
    fingerprint: row.fingerprint,
    billingName: row.billingName,
    billingEmail: row.billingEmail,
    billingPhone: row.billingPhone,
    billingAddress: row.billingAddress,
    isDefault: row.isDefault,
    livemode: row.livemode,
    stripeCreatedAt: row.stripeCreatedAt
      ? row.stripeCreatedAt.toISOString()
      : null,
    stripePayload: row.stripePayload,
    detachedAt: row.detachedAt ? row.detachedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Pull all PaymentMethods for the company Stripe customer into the local DB.
 * Safe to call after portal return / checkout when webhooks may be delayed.
 */
export async function syncCompanyPaymentMethodsFromStripe(
  companyId: string,
): Promise<
  | { ok: true; paymentMethods: CompanyBillingPaymentMethodDto[] }
  | { ok: false; status: number; message: string }
> {
  if (!getStripeConfig()) {
    return {
      ok: false,
      status: 503,
      message: "Stripe is not configured on the server.",
    };
  }

  const cid = normalizeCompanyId(companyId);
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }

  const [co] = await db
    .select({
      id: companies.id,
      stripeCustomerId: companies.stripeCustomerId,
    })
    .from(companies)
    .where(eq(companies.id, cid))
    .limit(1);
  if (!co) {
    return { ok: false, status: 404, message: "Company not found" };
  }
  const customerId = co.stripeCustomerId?.trim() ?? "";
  if (!customerId) {
    return { ok: true, paymentMethods: [] };
  }

  try {
    const stripe = getStripeClient();
    const defaultPmId = await resolveDefaultPaymentMethodId(customerId);
    const listed = await stripe.customers.listPaymentMethods(customerId, {
      limit: 100,
    });
    const activeIds = new Set<string>();

    for (const pm of listed.data) {
      activeIds.add(pm.id);
      await upsertPaymentMethodFromStripe({
        companyId: cid,
        paymentMethod: pm,
        isDefault: defaultPmId ? pm.id === defaultPmId : false,
      });
    }

    const existing = await db
      .select({
        stripePaymentMethodId:
          companyBillingPaymentMethods.stripePaymentMethodId,
        detachedAt: companyBillingPaymentMethods.detachedAt,
      })
      .from(companyBillingPaymentMethods)
      .where(eq(companyBillingPaymentMethods.companyId, cid));

    for (const row of existing) {
      if (!activeIds.has(row.stripePaymentMethodId) && !row.detachedAt) {
        await markPaymentMethodDetached(row.stripePaymentMethodId);
      }
    }

    if (defaultPmId) {
      await db
        .update(companyBillingPaymentMethods)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(companyBillingPaymentMethods.companyId, cid),
            isNull(companyBillingPaymentMethods.detachedAt),
            ne(companyBillingPaymentMethods.stripePaymentMethodId, defaultPmId),
          ),
        );
      await db
        .update(companyBillingPaymentMethods)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(
          and(
            eq(companyBillingPaymentMethods.companyId, cid),
            eq(
              companyBillingPaymentMethods.stripePaymentMethodId,
              defaultPmId,
            ),
          ),
        );
    }

    await recordBillingEvent({
      companyId: cid,
      eventType: "payment_method.synced",
      stripeCustomerId: customerId,
      message: `Synced ${listed.data.length} payment method(s) from Stripe`,
      payload: {
        count: listed.data.length,
        defaultPaymentMethodId: defaultPmId,
      },
    });

    try {
      const { refreshDealSaasSubscriptionsFromStripe } = await import(
        "./dealBilling.service.js"
      );
      await refreshDealSaasSubscriptionsFromStripe(cid);
    } catch (subErr) {
      console.warn(
        "syncCompanyPaymentMethodsFromStripe deal subscriptions:",
        subErr,
      );
    }

    const paymentMethods = await listCompanyPaymentMethods(cid, {
      includeDetached: false,
    });
    return { ok: true, paymentMethods };
  } catch (err) {
    console.error("syncCompanyPaymentMethodsFromStripe:", err);
    const msg =
      err instanceof Error
        ? err.message
        : "Could not sync payment methods from Stripe";
    return { ok: false, status: 502, message: msg };
  }
}

export type ExtraCompanyUserPayResult =
  | { ok: true; extraUsersPaid: number; amountDueCents: number }
  | { ok: false; status: number; message: string };

export type ExtraCompanyUserCheckoutResult =
  | { ok: true; url: string; extraUsersToPay: number; amountDueCents: number }
  | { ok: false; status: number; message: string };

async function resolveExtraCompanyUserCharge(params: {
  companyId: string;
  dealId: string;
  allowedDealIds?: string[] | null;
  quantity?: number;
}): Promise<
  | {
      ok: true;
      dealId: string;
      dealName: string;
      extraUsersToPay: number;
      amountDueCents: number;
    }
  | { ok: false; status: number; message: string }
> {
  const cid = normalizeCompanyId(params.companyId);
  const {
    getDealCompanyUserSnapshot,
    extraCompanyUsersToCharge,
  } = await import("./dealExtraCompanyUser.service.js");
  const snapshot = await getDealCompanyUserSnapshot(params.dealId);
  if (!snapshot) {
    return { ok: false, status: 404, message: "Deal not found" };
  }
  if (
    snapshot.organizationId &&
    cid &&
    snapshot.organizationId.toLowerCase() !== cid
  ) {
    return { ok: false, status: 404, message: "Deal not found" };
  }
  if (
    params.allowedDealIds &&
    !params.allowedDealIds.some(
      (id) => id.toLowerCase() === snapshot.dealId,
    )
  ) {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  const extraUsersToPay = extraCompanyUsersToCharge(
    snapshot,
    params.quantity,
  );
  if (extraUsersToPay <= 0) {
    return {
      ok: false,
      status: 400,
      message: "No extra company users need payment for this deal.",
    };
  }
  return {
    ok: true,
    dealId: snapshot.dealId,
    dealName: snapshot.dealName,
    extraUsersToPay,
    amountDueCents: extraUsersToPay * snapshot.extraUserFeeCents,
  };
}

/**
 * One-time $10-per-extra-company-user Checkout (deal already billed).
 */
export async function createExtraCompanyUserCheckoutSession(params: {
  companyId: string;
  actorUserId: string;
  dealId: string;
  quantity?: number;
  allowedDealIds?: string[] | null;
}): Promise<ExtraCompanyUserCheckoutResult> {
  const cfg = getStripeConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      message: "Stripe is not configured on the server.",
    };
  }
  const cid = normalizeCompanyId(params.companyId);
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }
  const charge = await resolveExtraCompanyUserCharge({
    companyId: cid,
    dealId: params.dealId,
    allowedDealIds: params.allowedDealIds,
    quantity: params.quantity,
  });
  if (!charge.ok) return charge;

  const frontend = resolveFrontendOrigin();
  if (!frontend) {
    return {
      ok: false,
      status: 503,
      message: "BASE_URL must be set so Stripe can redirect after checkout.",
    };
  }

  try {
    const customerId = await ensureStripeCustomer({
      companyId: cid,
      actorUserId: params.actorUserId,
    });
    const stripe = getStripeClient();
    const {
      extraCompanyUserCheckoutLineItems,
    } = await import("./dealExtraCompanyUser.service.js");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      payment_method_types: ["card", "us_bank_account"],
      line_items: extraCompanyUserCheckoutLineItems(charge.extraUsersToPay),
      success_url: `${frontend}/deals/${encodeURIComponent(charge.dealId)}?tab=deal_members&extraCompanyUser=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/deals/${encodeURIComponent(charge.dealId)}?tab=deal_members&extraCompanyUser=cancel`,
      client_reference_id: cid,
      metadata: {
        companyId: cid,
        dealId: charge.dealId,
        dealName: charge.dealName,
        billingScope: "extra_company_user",
        extraCompanyUsers: String(charge.extraUsersToPay),
        payerUserId: params.actorUserId,
      },
      payment_intent_data: {
        description: `${charge.extraUsersToPay} extra company user${charge.extraUsersToPay === 1 ? "" : "s"} at $10 each`,
        metadata: {
          companyId: cid,
          dealId: charge.dealId,
          dealName: charge.dealName,
          billingScope: "extra_company_user",
          extraCompanyUsers: String(charge.extraUsersToPay),
          payerUserId: params.actorUserId,
        },
      },
    });
    if (!session.url) {
      return {
        ok: false,
        status: 502,
        message: "Stripe did not return a checkout URL.",
      };
    }
    return {
      ok: true,
      url: session.url,
      extraUsersToPay: charge.extraUsersToPay,
      amountDueCents: charge.amountDueCents,
    };
  } catch (err) {
    console.error("createExtraCompanyUserCheckoutSession:", err);
    const msg =
      err instanceof Error ? err.message : "Could not create extra user checkout";
    return { ok: false, status: 502, message: msg };
  }
}

export async function payExtraCompanyUserWithSavedMethod(params: {
  companyId: string;
  actorUserId: string;
  dealId: string;
  paymentMethodId: string;
  quantity?: number;
  allowedDealIds?: string[] | null;
}): Promise<ExtraCompanyUserPayResult> {
  const cfg = getStripeConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      message: "Stripe is not configured on the server.",
    };
  }
  const cid = normalizeCompanyId(params.companyId);
  if (!cid) {
    return { ok: false, status: 400, message: "Invalid company id" };
  }
  const rawPm = String(params.paymentMethodId ?? "").trim();
  if (!rawPm) {
    return {
      ok: false,
      status: 400,
      message: "Select a saved payment method, or pay in Stripe.",
    };
  }

  const charge = await resolveExtraCompanyUserCharge({
    companyId: cid,
    dealId: params.dealId,
    allowedDealIds: params.allowedDealIds,
    quantity: params.quantity,
  });
  if (!charge.ok) return charge;

  try {
    const methods = await listCompanyPaymentMethods(cid);
    const found = methods.find(
      (m) => m.stripePaymentMethodId === rawPm || m.id === rawPm,
    );
    if (!found?.stripePaymentMethodId) {
      return {
        ok: false,
        status: 400,
        message:
          "That payment method is not available. Choose another, or pay in Stripe.",
      };
    }
    const paymentMethodId = found.stripePaymentMethodId;
    const customerId = await ensureStripeCustomer({
      companyId: cid,
      actorUserId: params.actorUserId,
    });
    const stripe = getStripeClient();
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    } catch (attachErr) {
      const alreadyAttached =
        attachErr instanceof Stripe.errors.StripeInvalidRequestError &&
        (attachErr.code === "resource_already_exists" ||
          /already been attached/i.test(attachErr.message ?? ""));
      if (!alreadyAttached) throw attachErr;
    }

    const intent = await stripe.paymentIntents.create({
      amount: charge.amountDueCents,
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description: `${charge.extraUsersToPay} extra company user${charge.extraUsersToPay === 1 ? "" : "s"} at $10 each`,
      metadata: {
        companyId: cid,
        dealId: charge.dealId,
        dealName: charge.dealName,
        billingScope: "extra_company_user",
        extraCompanyUsers: String(charge.extraUsersToPay),
        payerUserId: params.actorUserId,
      },
    });
    const status = String(intent.status ?? "").toLowerCase();
    if (status !== "succeeded") {
      return {
        ok: false,
        status: 402,
        message:
          "This payment method needs extra verification or was declined. Pay in Stripe instead.",
      };
    }
    const { creditExtraCompanyUsersPaid } = await import(
      "./dealExtraCompanyUser.service.js"
    );
    await creditExtraCompanyUsersPaid({
      dealId: charge.dealId,
      quantity: charge.extraUsersToPay,
      paymentRef: intent.id,
    });
    return {
      ok: true,
      extraUsersPaid: charge.extraUsersToPay,
      amountDueCents: charge.amountDueCents,
    };
  } catch (err) {
    console.error("payExtraCompanyUserWithSavedMethod:", err);
    if (err instanceof Stripe.errors.StripeCardError) {
      return {
        ok: false,
        status: 402,
        message:
          err.message || "The card was declined. Pay in Stripe or try another method.",
      };
    }
    const msg =
      err instanceof Error ? err.message : "Could not pay for extra company users";
    return { ok: false, status: 502, message: msg };
  }
}

export async function syncExtraCompanyUserFromCheckoutSession(params: {
  companyId: string;
  sessionId: string;
  allowedDealIds?: string[] | null;
}): Promise<ExtraCompanyUserPayResult> {
  const cid = normalizeCompanyId(params.companyId);
  const sessionId = String(params.sessionId ?? "").trim();
  if (!cid || !sessionId.startsWith("cs_")) {
    return { ok: false, status: 400, message: "Missing checkout session." };
  }
  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (String(session.metadata?.billingScope ?? "") !== "extra_company_user") {
      return { ok: false, status: 400, message: "Not an extra company user payment." };
    }
    const dealId = String(session.metadata?.dealId ?? "").trim();
    const extraUsers = Number.parseInt(
      String(session.metadata?.extraCompanyUsers ?? "0"),
      10,
    );
    if (!dealId || !Number.isFinite(extraUsers) || extraUsers <= 0) {
      return { ok: false, status: 400, message: "Checkout session is missing extra user details." };
    }
    if (
      params.allowedDealIds &&
      !params.allowedDealIds.some((id) => id.toLowerCase() === dealId.toLowerCase())
    ) {
      return { ok: false, status: 403, message: "Forbidden" };
    }
    if (String(session.payment_status ?? "").toLowerCase() !== "paid") {
      return {
        ok: false,
        status: 402,
        message: "Extra company user payment is not complete yet.",
      };
    }
    const { creditExtraCompanyUsersPaid } = await import(
      "./dealExtraCompanyUser.service.js"
    );
    await creditExtraCompanyUsersPaid({
      dealId,
      quantity: extraUsers,
      paymentRef: session.id,
    });
    return {
      ok: true,
      extraUsersPaid: extraUsers,
      amountDueCents: extraUsers * 1000,
    };
  } catch (err) {
    console.error("syncExtraCompanyUserFromCheckoutSession:", err);
    const msg =
      err instanceof Error ? err.message : "Could not sync extra user payment";
    return { ok: false, status: 502, message: msg };
  }
}

export async function handleStripeWebhookEvent(
  event: Stripe.Event,
): Promise<void> {
  // Idempotency: claim event id first so concurrent Stripe retries are no-ops.
  // If processing throws, release the claim so Stripe can retry successfully.
  const claimed = await claimStripeEvent({
    eventId: event.id,
    eventType: event.type,
    message: "webhook received",
    payload: { livemode: event.livemode },
  });
  if (!claimed) {
    return;
  }

  try {
    await processStripeWebhookEvent(event);
  } catch (err) {
    try {
      await db
        .delete(companyBillingEvents)
        .where(eq(companyBillingEvents.stripeEventId, event.id));
    } catch (releaseErr) {
      console.error(
        "[stripe webhook] failed to release event claim after error:",
        releaseErr,
      );
    }
    throw err;
  }
}

async function processStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (
        session.mode === "payment" &&
        String(session.metadata?.billingScope ?? "") === "extra_company_user"
      ) {
        const dealId = String(session.metadata?.dealId ?? "").trim();
        const extraUsers = Number.parseInt(
          String(session.metadata?.extraCompanyUsers ?? "0"),
          10,
        );
        if (dealId && Number.isFinite(extraUsers) && extraUsers > 0) {
          const { creditExtraCompanyUsersPaid } = await import(
            "./dealExtraCompanyUser.service.js"
          );
          await creditExtraCompanyUsersPaid({
            dealId,
            quantity: extraUsers,
            paymentRef: session.id,
          });
        }
        return;
      }
      if (session.mode !== "subscription") return;
      const companyIdRaw =
        String(session.metadata?.companyId ?? "").trim() ||
        String(session.client_reference_id ?? "").trim();
      const companyId = normalizeCompanyId(companyIdRaw);
      const subRef = session.subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (!companyId || !subId) {
        console.warn(
          `[stripe webhook] ${event.type}: missing companyId/subId`,
          { companyIdRaw, subId },
        );
        return;
      }
      const stripe = getStripeClient();
      const sub = await stripe.subscriptions.retrieve(subId);
      await applySubscriptionToCompany(companyId, sub);
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;
      try {
        await persistInvoicesForSubscription({
          companyId,
          subscriptionId: subId,
          customerId,
        });
      } catch (invErr) {
        console.warn("[stripe webhook] persist invoice after checkout:", invErr);
      }
      if (customerId) {
        try {
          await syncCompanyPaymentMethodsFromStripe(companyId);
        } catch (pmErr) {
          console.warn(
            "[stripe webhook] sync payment methods after checkout:",
            pmErr,
          );
        }
      }
      await syncDealSubscriptionsAfterCompanyPayment(companyId);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const fromMeta = String(sub.metadata?.companyId ?? "").trim();
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      const companyId =
        normalizeCompanyId(fromMeta) ||
        (await findCompanyIdForSubscription(sub.id)) ||
        (customerId ? await findCompanyIdForStripeCustomer(customerId) : null);
      if (!companyId) {
        console.warn(
          `[stripe webhook] ${event.type}: no company for subscription ${sub.id}`,
        );
        return;
      }
      await applySubscriptionToCompany(companyId, sub);
      return;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const fromMeta = String(sub.metadata?.companyId ?? "").trim();
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      const companyId =
        normalizeCompanyId(fromMeta) ||
        (await findCompanyIdForSubscription(sub.id)) ||
        (customerId ? await findCompanyIdForStripeCustomer(customerId) : null);
      if (!companyId) return;
      try {
        const dealBilling = await import("./dealBilling.service.js");
        const dealId =
          String(sub.metadata?.dealId ?? "").trim() ||
          (await dealBilling.findDealIdForStripeSubscription(sub.id));
        if (dealId) {
          await dealBilling.clearDealSaasSubscription(dealId);
        }
        await dealBilling.refreshCompanyBillingFromDeals(companyId);
      } catch (err) {
        console.warn("[stripe webhook] deal subscription deleted:", err);
      }
      const [company] = await db
        .select({ stripeSubscriptionId: companies.stripeSubscriptionId })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (company?.stripeSubscriptionId?.trim() === sub.id) {
        await clearCompanySubscription(companyId, { keepCustomer: true });
        try {
          const { refreshCompanyBillingFromDeals } = await import(
            "./dealBilling.service.js"
          );
          await refreshCompanyBillingFromDeals(companyId);
        } catch {
          /* already logged */
        }
      }
      return;
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      const subId = subscriptionIdFromInvoice(inv);
      let companyId = customerId
        ? await findCompanyIdForStripeCustomer(customerId)
        : null;
      if (!companyId && subId) {
        companyId = await findCompanyIdForSubscription(subId);
      }
      if (!companyId && subId) {
        try {
          const stripe = getStripeClient();
          const sub = await stripe.subscriptions.retrieve(subId);
          companyId = normalizeCompanyId(sub.metadata?.companyId ?? null);
        } catch {
          /* ignore */
        }
      }
      if (!companyId) {
        console.warn(
          `[stripe webhook] ${event.type}: no company for invoice ${inv.id}`,
        );
        return;
      }
      await upsertBillingInvoiceFromStripe({
        companyId,
        invoice: inv,
        markPaid: true,
      });

      if (subId) {
        try {
          const stripe = getStripeClient();
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscriptionToCompany(companyId, sub);
        } catch (err) {
          console.warn("[stripe webhook] invoice.paid sub refresh:", err);
          await db
            .update(companies)
            .set({
              stripeLastPaymentError: null,
              stripeLastPaymentFailedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(companies.id, companyId));
        }
      } else {
        await db
          .update(companies)
          .set({
            stripeLastPaymentError: null,
            stripeLastPaymentFailedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(companies.id, companyId));
      }
      return;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      const subId = subscriptionIdFromInvoice(inv);
      let companyId = customerId
        ? await findCompanyIdForStripeCustomer(customerId)
        : null;
      if (!companyId && subId) {
        companyId = await findCompanyIdForSubscription(subId);
      }
      if (!companyId) {
        console.warn(
          `[stripe webhook] ${event.type}: no company for invoice ${inv.id}`,
        );
        return;
      }

      const failMsg =
        inv.last_finalization_error?.message?.trim() ||
        "Invoice payment failed. Update your payment method in Manage billing.";

      await upsertBillingInvoiceFromStripe({
        companyId,
        invoice: inv,
        markFailed: true,
        paymentFailureMessage: failMsg,
      });

      const [row] = await db
        .select({ status: companies.stripeSubscriptionStatus })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      const current = String(row?.status ?? "none");
      const canMarkPastDue = new Set([
        "active",
        "trialing",
        "past_due",
        "unpaid",
        "incomplete",
        "none",
      ]).has(current);

      if (subId) {
        try {
          const stripe = getStripeClient();
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscriptionToCompany(companyId, sub);
        } catch (err) {
          console.warn("[stripe webhook] invoice.payment_failed sub refresh:", err);
        }
      }

      await db
        .update(companies)
        .set({
          ...(canMarkPastDue ? { stripeSubscriptionStatus: "past_due" } : {}),
          stripeLastPaymentError: failMsg,
          stripeLastPaymentFailedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
      return;
    }
    case "payment_method.attached":
    case "payment_method.updated":
    case "payment_method.automatically_updated": {
      const pm = event.data.object as Stripe.PaymentMethod;
      const customerId = stripeIdRef(pm.customer);
      const companyId = customerId
        ? await findCompanyIdForStripeCustomer(customerId)
        : null;
      if (!companyId || !customerId) {
        console.warn(
          `[stripe webhook] ${event.type}: no company for payment method ${pm.id}`,
        );
        return;
      }
      let isDefault = false;
      try {
        const defaultPmId = await resolveDefaultPaymentMethodId(customerId);
        isDefault = Boolean(defaultPmId && defaultPmId === pm.id);
      } catch (err) {
        console.warn(
          `[stripe webhook] ${event.type}: could not resolve default PM:`,
          err,
        );
      }
      await upsertPaymentMethodFromStripe({
        companyId,
        paymentMethod: pm,
        isDefault,
      });
      return;
    }
    case "payment_method.detached": {
      const pm = event.data.object as Stripe.PaymentMethod;
      await markPaymentMethodDetached(pm.id);
      return;
    }
    case "customer.updated": {
      const customer = event.data.object as Stripe.Customer;
      const companyId = await findCompanyIdForStripeCustomer(customer.id);
      if (!companyId) return;
      try {
        await syncDefaultPaymentMethodFlags({
          companyId,
          customerId: customer.id,
        });
      } catch (err) {
        console.warn("[stripe webhook] customer.updated default PM sync:", err);
      }
      return;
    }
    case "payment_intent.succeeded":
    case "payment_intent.processing":
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const customerId = stripeIdRef(pi.customer);
      let companyId = customerId
        ? await findCompanyIdForStripeCustomer(customerId)
        : null;
      const metaCompany = normalizeCompanyId(
        String(pi.metadata?.companyId ?? "").trim(),
      );
      if (metaCompany) companyId = metaCompany;

      const invoiceId = stripeIdRef(
        (pi as Stripe.PaymentIntent & { invoice?: string | { id?: string } | null })
          .invoice,
      );

      if (invoiceId) {
        try {
          const stripe = getStripeClient();
          const inv = await stripe.invoices.retrieve(invoiceId);
          const subId = subscriptionIdFromInvoice(inv);
          if (!companyId && customerId) {
            companyId = await findCompanyIdForStripeCustomer(customerId);
          }
          if (!companyId && subId) {
            companyId = await findCompanyIdForSubscription(subId);
          }
          if (companyId && subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            await applySubscriptionToCompany(companyId, sub);
          }
          if (companyId) {
            if (event.type === "payment_intent.succeeded") {
              await upsertBillingInvoiceFromStripe({
                companyId,
                invoice: inv,
                markPaid: true,
              });
              await db
                .update(companies)
                .set({
                  stripeLastPaymentError: null,
                  stripeLastPaymentFailedAt: null,
                  updatedAt: new Date(),
                })
                .where(eq(companies.id, companyId));
            } else if (event.type === "payment_intent.processing") {
              // ACH / bank transfers settle asynchronously.
              await db
                .update(companies)
                .set({
                  stripeLastPaymentError: null,
                  updatedAt: new Date(),
                })
                .where(eq(companies.id, companyId));
            } else {
              const failMsg =
                pi.last_payment_error?.message?.trim() ||
                "Payment failed. Try another card or bank account.";
              await upsertBillingInvoiceFromStripe({
                companyId,
                invoice: inv,
                markFailed: true,
                paymentFailureMessage: failMsg,
              });
              await db
                .update(companies)
                .set({
                  stripeLastPaymentError: failMsg,
                  stripeLastPaymentFailedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(companies.id, companyId));
            }
          }
        } catch (err) {
          console.warn(`[stripe webhook] ${event.type} invoice sync:`, err);
        }
      } else if (companyId && event.type === "payment_intent.payment_failed") {
        const failMsg =
          pi.last_payment_error?.message?.trim() ||
          "Payment failed. Try another card or bank account.";
        await db
          .update(companies)
          .set({
            stripeLastPaymentError: failMsg,
            stripeLastPaymentFailedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(companies.id, companyId));
      }

      if (companyId && customerId && event.type === "payment_intent.succeeded") {
        try {
          await syncCompanyPaymentMethodsFromStripe(companyId);
        } catch (pmErr) {
          console.warn(
            "[stripe webhook] payment_intent.succeeded PM sync:",
            pmErr,
          );
        }
      }
      return;
    }
    case "setup_intent.succeeded": {
      const si = event.data.object as Stripe.SetupIntent;
      const customerId = stripeIdRef(si.customer);
      const companyId =
        normalizeCompanyId(String(si.metadata?.companyId ?? "").trim()) ||
        (customerId ? await findCompanyIdForStripeCustomer(customerId) : null);
      if (!companyId || !customerId) return;
      try {
        const stripe = getStripeClient();
        await syncCompanyPaymentMethodsFromStripe(companyId);
        const pmId = stripeIdRef(si.payment_method);
        if (pmId) {
          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: pmId },
          });
          await syncDefaultPaymentMethodFlags({ companyId, customerId });
        }
      } catch (err) {
        console.warn("[stripe webhook] setup_intent.succeeded:", err);
      }
      return;
    }
    default:
      return;
  }
}

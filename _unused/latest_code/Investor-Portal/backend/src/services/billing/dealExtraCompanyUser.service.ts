import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "../../database/db.js";
import { addDealForm, dealInvestorClass, dealMember } from "../../schema/schema.js";
import {
  EXTRA_COMPANY_USER_FEE_CENTS,
  EXTRA_COMPANY_USER_PAYMENT_REQUIRED,
  includedCompanyUsersForPlan,
  MAX_SELF_SERVE_COMPANY_USERS,
  normalizeBillingPlanId,
  type StripeBillingPlanId,
} from "../../config/stripe.config.js";
import {
  DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER,
  isDealCompanyUserStoredRole,
  isLpInvestorRole,
} from "../deal/dealInvestment.service.js";

const STARTER_MAX_CENTS = 3_000_000;
const RUNNING_MAX_CENTS = 5_000_000;
const DEAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeDealId(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return DEAL_UUID_RE.test(s) ? s : null;
}

function parseMoneyAmount(raw: string | null | undefined): number {
  const n = Number.parseFloat(String(raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function planIdForDealRaiseAmount(raiseAmount: number): StripeBillingPlanId {
  if (raiseAmount > RUNNING_MAX_CENTS) return "growth";
  if (raiseAmount > STARTER_MAX_CENTS) return "running";
  return "starter";
}

function extraUserProductData(): Stripe.Checkout.SessionCreateParams.LineItem.PriceData.ProductData {
  return {
    name: "Extra company user",
    description:
      "$10 per extra company user beyond the number included in the deal plan",
  };
}

export function extraCompanyUserCheckoutLineItems(
  quantity: number,
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const qty = Math.max(0, Math.floor(quantity));
  if (qty <= 0) return [];
  return [
    {
      price_data: {
        currency: "usd",
        unit_amount: EXTRA_COMPANY_USER_FEE_CENTS,
        product_data: extraUserProductData(),
      },
      quantity: qty,
    },
  ];
}

export async function attachExtraCompanyUserInvoiceItems(params: {
  stripe: Stripe;
  customerId: string;
  quantity: number;
  dealId: string;
}): Promise<void> {
  const qty = Math.max(0, Math.floor(params.quantity));
  if (qty <= 0) return;
  await params.stripe.invoiceItems.create({
    customer: params.customerId,
    amount: qty * EXTRA_COMPANY_USER_FEE_CENTS,
    currency: "usd",
    description: `${qty} extra company user${qty === 1 ? "" : "s"} at $10 each`,
    metadata: {
      dealId: params.dealId,
      billingScope: "extra_company_user",
      extraCompanyUsers: String(qty),
    },
  });
}

export type DealCompanyUserSnapshot = {
  dealId: string;
  dealName: string;
  organizationId: string | null;
  planId: StripeBillingPlanId;
  includedCompanyUsers: number;
  currentCompanyUsers: number;
  extraCompanyUsersPaid: number;
  extraCompanyUsersDue: number;
  extraUserFeeCents: number;
};

export type ExtraCompanyUserPaymentRequiredPayload = {
  code: typeof EXTRA_COMPANY_USER_PAYMENT_REQUIRED;
  message: string;
  dealId: string;
  dealName: string;
  planId: StripeBillingPlanId;
  includedCompanyUsers: number;
  currentCompanyUsers: number;
  extraUsersToPay: number;
  extraUserFeeCents: number;
  amountDueCents: number;
};

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

export async function countDealCompanyUsers(dealId: string): Promise<number> {
  const did = normalizeDealId(dealId);
  if (!did) return 0;
  const rows = await db
    .select({
      contactMemberId: dealMember.contactMemberId,
      dealMemberRole: dealMember.dealMemberRole,
    })
    .from(dealMember)
    .where(eq(dealMember.dealId, did));
  const ids = new Set<string>();
  for (const row of rows) {
    const contactId = String(row.contactMemberId ?? "").trim();
    if (!contactId || contactId === DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER) {
      continue;
    }
    if (!isDealCompanyUserStoredRole(row.dealMemberRole)) continue;
    ids.add(contactId.toLowerCase());
  }
  return ids.size;
}

export async function contactIsDealCompanyUser(
  dealId: string,
  contactId: string,
): Promise<boolean> {
  const did = normalizeDealId(dealId);
  const cid = String(contactId ?? "").trim();
  if (!did || !cid || cid === DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER) {
    return false;
  }
  const rows = await db
    .select({
      contactMemberId: dealMember.contactMemberId,
      dealMemberRole: dealMember.dealMemberRole,
    })
    .from(dealMember)
    .where(
      and(
        eq(dealMember.dealId, did),
        sql`lower(trim(${dealMember.contactMemberId})) = ${cid.toLowerCase()}`,
      ),
    );
  return rows.some((row) => isDealCompanyUserStoredRole(row.dealMemberRole));
}

async function resolveDealPlanId(
  dealId: string,
  stripePlanId: string | null | undefined,
): Promise<StripeBillingPlanId> {
  const fromSub = normalizeBillingPlanId(stripePlanId);
  if (fromSub) return fromSub;
  const raise = await raiseAmountForDeal(dealId);
  return planIdForDealRaiseAmount(raise);
}

export async function getDealCompanyUserSnapshot(
  dealId: string,
): Promise<DealCompanyUserSnapshot | null> {
  const did = normalizeDealId(dealId);
  if (!did) return null;
  const [deal] = await db
    .select({
      id: addDealForm.id,
      dealName: addDealForm.dealName,
      organizationId: addDealForm.organizationId,
      stripePlanId: addDealForm.stripePlanId,
      extraCompanyUsersPaid: addDealForm.extraCompanyUsersPaid,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, did))
    .limit(1);
  if (!deal) return null;
  const planId = await resolveDealPlanId(did, deal.stripePlanId);
  const included = includedCompanyUsersForPlan(planId);
  const current = await countDealCompanyUsers(did);
  const paid = Math.max(0, Number(deal.extraCompanyUsersPaid ?? 0) || 0);
  return {
    dealId: did,
    dealName: deal.dealName ?? "",
    organizationId: deal.organizationId ? String(deal.organizationId) : null,
    planId,
    includedCompanyUsers: included,
    currentCompanyUsers: current,
    extraCompanyUsersPaid: paid,
    extraCompanyUsersDue: Math.max(0, current - included - paid),
    extraUserFeeCents: EXTRA_COMPANY_USER_FEE_CENTS,
  };
}

export function extraCompanyUsersToCharge(
  snapshot: DealCompanyUserSnapshot,
  requestedExtra?: number | null,
): number {
  const requested = Math.max(0, Math.floor(Number(requestedExtra ?? 0) || 0));
  return Math.max(snapshot.extraCompanyUsersDue, requested);
}

export async function assertExtraCompanyUserAllowedForAdd(params: {
  dealId: string;
  contactId: string;
  investorRole: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; payload: ExtraCompanyUserPaymentRequiredPayload }
> {
  if (isLpInvestorRole(params.investorRole)) {
    return { ok: true };
  }
  if (!isDealCompanyUserStoredRole(params.investorRole)) {
    return { ok: true };
  }
  const contactId = String(params.contactId ?? "").trim();
  if (!contactId || contactId === DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER) {
    return { ok: true };
  }
  if (await contactIsDealCompanyUser(params.dealId, contactId)) {
    return { ok: true };
  }
  const snapshot = await getDealCompanyUserSnapshot(params.dealId);
  if (!snapshot) return { ok: true };

  const nextCount = snapshot.currentCompanyUsers + 1;
  if (nextCount > MAX_SELF_SERVE_COMPANY_USERS) {
    return {
      ok: false,
      status: 400,
      payload: {
        code: EXTRA_COMPANY_USER_PAYMENT_REQUIRED,
        message:
          "This deal would have 25 or more company users. Contact sales for custom pricing.",
        dealId: snapshot.dealId,
        dealName: snapshot.dealName,
        planId: snapshot.planId,
        includedCompanyUsers: snapshot.includedCompanyUsers,
        currentCompanyUsers: snapshot.currentCompanyUsers,
        extraUsersToPay: 0,
        extraUserFeeCents: EXTRA_COMPANY_USER_FEE_CENTS,
        amountDueCents: 0,
      },
    };
  }

  const allowed = snapshot.includedCompanyUsers + snapshot.extraCompanyUsersPaid;
  if (nextCount <= allowed) return { ok: true };

  const extraUsersToPay = nextCount - allowed;
  const amountDueCents = extraUsersToPay * EXTRA_COMPANY_USER_FEE_CENTS;
  const includedLabel = `${snapshot.includedCompanyUsers} company user${
    snapshot.includedCompanyUsers === 1 ? "" : "s"
  }`;
  return {
    ok: false,
    status: 402,
    payload: {
      code: EXTRA_COMPANY_USER_PAYMENT_REQUIRED,
      message: `This deal’s ${snapshot.planId} plan includes ${includedLabel}. Pay $${(amountDueCents / 100).toFixed(0)} ($10 each) to add ${extraUsersToPay} extra company user${extraUsersToPay === 1 ? "" : "s"}.`,
      dealId: snapshot.dealId,
      dealName: snapshot.dealName,
      planId: snapshot.planId,
      includedCompanyUsers: snapshot.includedCompanyUsers,
      currentCompanyUsers: snapshot.currentCompanyUsers,
      extraUsersToPay,
      extraUserFeeCents: EXTRA_COMPANY_USER_FEE_CENTS,
      amountDueCents,
    },
  };
}

export async function creditExtraCompanyUsersPaid(params: {
  dealId: string;
  quantity: number;
  paymentRef: string;
}): Promise<void> {
  const did = normalizeDealId(params.dealId);
  const qty = Math.max(0, Math.floor(params.quantity));
  const paymentRef = String(params.paymentRef ?? "").trim();
  if (!did || qty <= 0 || !paymentRef) return;

  await db
    .update(addDealForm)
    .set({
      extraCompanyUsersPaid: sql`${addDealForm.extraCompanyUsersPaid} + ${qty}`,
      extraCompanyUsersLastPaymentRef: paymentRef,
    })
    .where(
      and(
        eq(addDealForm.id, did),
        sql`coalesce(${addDealForm.extraCompanyUsersLastPaymentRef}, '') <> ${paymentRef}`,
      ),
    );
}

export function parseExtraCompanyUsersQuantity(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  if (typeof raw === "string" && raw.trim()) {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

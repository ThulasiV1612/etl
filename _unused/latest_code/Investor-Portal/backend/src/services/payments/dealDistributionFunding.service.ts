import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
  getStripeConfig,
  resolveStripeRedirectOrigin,
} from "../../config/stripe.config.js";
import { addDealForm, users } from "../../schema/schema.js";
import { getStripeClient } from "../billing/companyBilling.service.js";
import { isPortalUserLeadOrAdminSponsorOnDeal } from "../deal/dealMemberScope.service.js";
import {
  isCompanyAdminRole,
  isPlatformAdminRole,
} from "../../constants/roles.js";
import { userHasAccessToOrganization } from "../org/orgResolution.service.js";
import {
  resolveConnectBankAccountSummary,
  type ConnectBankAccountSummary,
} from "./connectBankAccountSummary.js";
import {
  V2_ACCOUNT_INCLUDE,
  V2_ONBOARDING_CONFIGURATIONS,
  hasMerchantCardPayments,
  v2RecipientWithMerchantConfiguration,
} from "./connectV2AccountConfig.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConnectRecipientAccount = Awaited<
  ReturnType<
    ReturnType<typeof getStripeClient>["v2"]["core"]["accounts"]["retrieve"]
  >
>;

function uuid(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return UUID_RE.test(value) ? value : null;
}

function recipientBalanceCapabilities(account: ConnectRecipientAccount) {
  const balance =
    account.configuration?.recipient?.capabilities?.stripe_balance;
  return {
    transfersStatus: balance?.stripe_transfers?.status ?? null,
    payoutsStatus: balance?.payouts?.status ?? null,
    transferDetails: balance?.stripe_transfers?.status_details ?? [],
    payoutDetails: balance?.payouts?.status_details ?? [],
  };
}

function fundingReadyForAccount(account: ConnectRecipientAccount): boolean {
  const { transfersStatus, payoutsStatus } =
    recipientBalanceCapabilities(account);
  // Bank linked + transfers capability active means we can move deal funds.
  return transfersStatus === "active" && payoutsStatus === "active";
}

function detailsSubmittedForAccount(account: ConnectRecipientAccount): boolean {
  const { transfersStatus, payoutsStatus } =
    recipientBalanceCapabilities(account);
  if (transfersStatus === "active" || payoutsStatus === "active") return true;
  if (transfersStatus === "pending" || payoutsStatus === "pending") return true;
  return Boolean(account.identity?.entity_type);
}

function fundingStatusForAccount(account: ConnectRecipientAccount): string {
  const { transfersStatus, payoutsStatus, transferDetails, payoutDetails } =
    recipientBalanceCapabilities(account);
  if (transfersStatus === "active" && payoutsStatus === "active") return "ready";
  if (transfersStatus === "unsupported" || payoutsStatus === "unsupported") {
    return "restricted";
  }
  const detailCodes = [...transferDetails, ...payoutDetails].map((d) => d.code);
  if (
    detailCodes.includes("requirements_past_due") ||
    detailCodes.includes("unsupported_business") ||
    detailCodes.includes("unsupported_country") ||
    detailCodes.includes("unsupported_entity_type")
  ) {
    return "restricted";
  }
  if (transfersStatus === "pending" || payoutsStatus === "pending") {
    return "pending";
  }
  if (detailsSubmittedForAccount(account)) return "pending";
  return "onboarding";
}

async function retrieveConnectAccount(
  accountId: string,
): Promise<ConnectRecipientAccount> {
  return getStripeClient().v2.core.accounts.retrieve(accountId, {
    include: [...V2_ACCOUNT_INCLUDE],
  });
}

async function listDealFundingBankAccounts(
  accountId: string,
  displayName?: string | null,
): Promise<DealFundingBankAccountSummary | null> {
  return resolveConnectBankAccountSummary({ accountId, displayName });
}

async function persistDealFundingFromAccount(
  dealId: string,
  account: ConnectRecipientAccount,
  setupByUserId?: string | null,
): Promise<void> {
  await db
    .update(addDealForm)
    .set({
      stripeDistributionFundingAccountId: account.id,
      stripeDistributionFundingStatus: fundingStatusForAccount(account),
      stripeDistributionFundingDetailsSubmitted:
        detailsSubmittedForAccount(account),
      stripeDistributionFundingPayoutsEnabled: fundingReadyForAccount(account),
      ...(setupByUserId
        ? { stripeDistributionFundingSetupByUserId: setupByUserId }
        : {}),
      stripeDistributionFundingUpdatedAt: new Date(),
    })
    .where(eq(addDealForm.id, dealId));
}

export type DealFundingBankAccountSummary = ConnectBankAccountSummary;

export type DealFundingStatusResult =
  | {
      ok: true;
      accountId: string | null;
      status: string;
      detailsSubmitted: boolean;
      fundingReady: boolean;
      canManage: boolean;
      bankAccount: DealFundingBankAccountSummary | null;
    }
  | { ok: false; status: number; message: string };

export type DealFundingOnboardingResult =
  | {
      ok: true;
      url: string;
      accountId: string;
      status: string;
      fundingReady: boolean;
    }
  | { ok: false; status: number; message: string };

async function resolveUserRole(
  userId: string,
  jwtRole?: string,
): Promise<string> {
  const fromJwt = String(jwtRole ?? "").trim();
  if (fromJwt) return fromJwt;
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return String(row?.role ?? "").trim();
}

async function canManageDealFunding(params: {
  dealId: string;
  userId: string;
  userRole?: string;
}): Promise<boolean> {
  const role = await resolveUserRole(params.userId, params.userRole);
  if (isPlatformAdminRole(role)) return true;
  if (await isPortalUserLeadOrAdminSponsorOnDeal(params.dealId, params.userId)) {
    return true;
  }
  if (isCompanyAdminRole(role)) {
    const [deal] = await db
      .select({ organizationId: addDealForm.organizationId })
      .from(addDealForm)
      .where(eq(addDealForm.id, params.dealId))
      .limit(1);
    const orgId = deal?.organizationId ?? null;
    if (orgId && (await userHasAccessToOrganization(params.userId, orgId))) {
      return true;
    }
  }
  return false;
}

async function assertCanManageDealFunding(params: {
  dealId: string;
  userId: string;
  userRole?: string;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (await canManageDealFunding(params)) return { ok: true };
  return {
    ok: false,
    status: 403,
    message:
      "Only the lead sponsor, admin sponsor, or company admin for this deal can manage the deal bank account.",
  };
}

/** Hosted Stripe Connect onboarding for the deal's distribution funding bank. */
export async function createDealDistributionFundingOnboardingLink(params: {
  dealId: string;
  userId: string;
  userRole?: string;
}): Promise<DealFundingOnboardingResult> {
  const dealId = uuid(params.dealId);
  const userId = uuid(params.userId);
  if (!dealId || !userId) {
    return { ok: false, status: 400, message: "Invalid deal or user." };
  }

  const access = await assertCanManageDealFunding({
    dealId,
    userId,
    userRole: params.userRole,
  });
  if (!access.ok) return access;

  const [deal] = await db
    .select({
      id: addDealForm.id,
      dealName: addDealForm.dealName,
      fundingAccountId: addDealForm.stripeDistributionFundingAccountId,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, dealId))
    .limit(1);
  if (!deal) return { ok: false, status: 404, message: "Deal not found" };

  const [sponsorUser] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const redirect = resolveStripeRedirectOrigin(
    getStripeConfig()?.testMode ?? false,
  );
  if (!redirect.ok) return redirect;
  const frontend = redirect.origin;

  const stripe = getStripeClient();
  try {
    let accountId = deal.fundingAccountId?.trim() || "";
    let account: ConnectRecipientAccount;
    if (!accountId) {
      account = await stripe.v2.core.accounts.create(
        {
          contact_email: sponsorUser?.email || undefined,
          display_name: `${deal.dealName} · Distributions`.slice(0, 150),
          dashboard: "express",
          identity: { country: "us" },
          defaults: {
            responsibilities: {
              fees_collector: "application",
              losses_collector: "application",
            },
            profile: {
              product_description:
                "Deal bank account for investor ACH distributions",
            },
          },
          configuration: v2RecipientWithMerchantConfiguration(),
          metadata: {
            flow: "deal_distribution_funding",
            dealId,
            setupByUserId: userId,
          },
          include: [...V2_ACCOUNT_INCLUDE],
        },
        { idempotencyKey: `deal_dist_funding_v2m_${dealId}` },
      );
      accountId = account.id;
      await persistDealFundingFromAccount(dealId, account, userId);
    } else {
      account = await retrieveConnectAccount(accountId);
      if (!hasMerchantCardPayments(account)) {
        account = await stripe.v2.core.accounts.update(accountId, {
          configuration: v2RecipientWithMerchantConfiguration(),
          include: [...V2_ACCOUNT_INCLUDE],
        });
      }
      await persistDealFundingFromAccount(dealId, account, userId);
    }

    const encodedDeal = encodeURIComponent(dealId);
    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: [...V2_ONBOARDING_CONFIGURATIONS],
          refresh_url: `${frontend}/deals/${encodedDeal}?tab=distributions&stripe_deal_funding=refresh`,
          return_url: `${frontend}/deals/${encodedDeal}?tab=distributions&stripe_deal_funding=return`,
          collection_options: {
            fields: "eventually_due",
            future_requirements: "include",
          },
        },
      },
    });

    return {
      ok: true,
      url: link.url,
      accountId,
      status: fundingStatusForAccount(account),
      fundingReady: fundingReadyForAccount(account),
    };
  } catch (err) {
    console.error("createDealDistributionFundingOnboardingLink:", err);
    return {
      ok: false,
      status: 502,
      message:
        err instanceof Error
          ? err.message
          : "Could not start deal bank setup",
    };
  }
}

export async function getDealDistributionFundingStatus(params: {
  dealId: string;
  userId: string;
  userRole?: string;
}): Promise<DealFundingStatusResult> {
  const dealId = uuid(params.dealId);
  const userId = uuid(params.userId);
  if (!dealId || !userId) {
    return { ok: false, status: 400, message: "Invalid deal or user." };
  }

  const [deal] = await db
    .select({
      accountId: addDealForm.stripeDistributionFundingAccountId,
      status: addDealForm.stripeDistributionFundingStatus,
      detailsSubmitted: addDealForm.stripeDistributionFundingDetailsSubmitted,
      fundingReady: addDealForm.stripeDistributionFundingPayoutsEnabled,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, dealId))
    .limit(1);
  if (!deal) return { ok: false, status: 404, message: "Deal not found" };

  const canManage = await canManageDealFunding({
    dealId,
    userId,
    userRole: params.userRole,
  });

  const accountId = deal.accountId?.trim() || null;
  if (!accountId) {
    return {
      ok: true,
      accountId: null,
      status: "not_started",
      detailsSubmitted: false,
      fundingReady: false,
      canManage,
      bankAccount: null,
    };
  }

  try {
    const account = await retrieveConnectAccount(accountId);
    await persistDealFundingFromAccount(dealId, account);
    const bankAccount = await listDealFundingBankAccounts(
      accountId,
      account.display_name,
    );
    return {
      ok: true,
      accountId,
      status: fundingStatusForAccount(account),
      detailsSubmitted: detailsSubmittedForAccount(account),
      fundingReady: fundingReadyForAccount(account),
      canManage,
      bankAccount,
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      message:
        err instanceof Error
          ? err.message
          : "Could not retrieve deal bank account status",
    };
  }
}

export type DealFundingSource =
  | {
      ok: true;
      accountId: string;
      status: string;
    }
  | { ok: false; status: number; message: string };

/** Fresh Stripe sync used by ACH payout execution. */
export async function requireDealDistributionFundingSource(
  dealIdRaw: string,
): Promise<DealFundingSource> {
  const dealId = uuid(dealIdRaw);
  if (!dealId) {
    return { ok: false, status: 400, message: "Invalid deal." };
  }
  const [deal] = await db
    .select({
      accountId: addDealForm.stripeDistributionFundingAccountId,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, dealId))
    .limit(1);
  if (!deal) return { ok: false, status: 404, message: "Deal not found" };

  const accountId = deal.accountId?.trim() || "";
  if (!accountId) {
    return {
      ok: false,
      status: 409,
      message:
        "Add this deal's bank account first (lead sponsor). ACH payouts are sent from the deal bank account, not SyndicationX billing.",
    };
  }

  try {
    const account = await retrieveConnectAccount(accountId);
    await persistDealFundingFromAccount(dealId, account);
    if (!fundingReadyForAccount(account)) {
      return {
        ok: false,
        status: 409,
        message:
          "Deal bank account is not ready. The lead sponsor must finish bank setup for this deal.",
      };
    }
    return {
      ok: true,
      accountId,
      status: fundingStatusForAccount(account),
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      message:
        err instanceof Error
          ? err.message
          : "Could not verify deal bank account.",
    };
  }
}

/**
 * Pull funds from the deal Connect balance onto the platform so investor
 * transfers can be funded from the deal account (not SaaS billing float).
 */
export async function debitDealFundingAccountForDistribution(params: {
  dealAccountId: string;
  amountCents: number;
  dealId: string;
  distributionId: string;
  idempotencyKey: string;
}): Promise<{ ok: true; chargeId: string } | { ok: false; message: string }> {
  if (!Number.isSafeInteger(params.amountCents) || params.amountCents <= 0) {
    return { ok: false, message: "Invalid debit amount." };
  }
  const stripe = getStripeClient();
  try {
    // Account debit: charge the connected account's Stripe balance.
    const charge = await stripe.charges.create(
      {
        amount: params.amountCents,
        currency: "usd",
        source: params.dealAccountId,
        description: `Deal distribution funding · ${params.distributionId}`,
        metadata: {
          flow: "deal_distribution_funding_debit",
          dealId: params.dealId,
          distributionId: params.distributionId,
          dealAccountId: params.dealAccountId,
        },
      },
      { idempotencyKey: params.idempotencyKey },
    );
    return { ok: true, chargeId: charge.id };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not debit deal bank account";
    console.error("debitDealFundingAccountForDistribution:", err);
    return {
      ok: false,
      message:
        message.includes("insufficient") || message.includes("balance")
          ? `${message} Fund this deal's distribution account balance before sending ACH payouts.`
          : message,
    };
  }
}

/** Sync deal funding row when Connect webhooks fire for the deal account. */
export async function syncDealDistributionFundingFromAccountId(
  accountId: string,
): Promise<boolean> {
  const id = String(accountId ?? "").trim();
  if (!id.startsWith("acct_")) return false;
  const [deal] = await db
    .select({ id: addDealForm.id })
    .from(addDealForm)
    .where(eq(addDealForm.stripeDistributionFundingAccountId, id))
    .limit(1);
  if (!deal) return false;
  const account = await retrieveConnectAccount(id);
  await persistDealFundingFromAccount(deal.id, account);
  return true;
}

export async function handleDealDistributionFundingWebhookEvent(
  event: Stripe.Event,
): Promise<boolean> {
  const type = String(event.type ?? "");
  let accountId: string | null = null;
  if (type === "account.updated") {
    accountId = (event.data.object as Stripe.Account)?.id?.trim() || null;
  } else if (
    type.startsWith("v2.core.account") ||
    type.includes("account[requirements]")
  ) {
    const obj = event.data?.object as { id?: string } | undefined;
    if (obj?.id?.startsWith("acct_")) accountId = obj.id;
  }
  if (!accountId) return false;
  return syncDealDistributionFundingFromAccountId(accountId);
}

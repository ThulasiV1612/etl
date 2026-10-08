import Stripe from "stripe";
import { and, eq, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../database/db.js";
import {
  getStripeConfig,
  resolveStripeRedirectOrigin,
} from "../../config/stripe.config.js";
import {
  dealInvestment,
  investorDistributionPayouts,
  userInvestorProfiles,
  users,
} from "../../schema/schema.js";
import { getStripeClient } from "../billing/companyBilling.service.js";
import { listCoSponsorVisibleInvestorMatchKeys } from "../deal/dealLpInvestor.service.js";
import { getDistributionSetupBundle } from "../distributionSetup/distributionSetup.service.js";
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
import {
  debitDealFundingAccountForDistribution,
  handleDealDistributionFundingWebhookEvent,
  requireDealDistributionFundingSource,
} from "./dealDistributionFunding.service.js";

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

function payoutsEnabledForAccount(account: ConnectRecipientAccount): boolean {
  const { transfersStatus, payoutsStatus } =
    recipientBalanceCapabilities(account);
  return transfersStatus === "active" && payoutsStatus === "active";
}

function detailsSubmittedForAccount(account: ConnectRecipientAccount): boolean {
  const { transfersStatus, payoutsStatus } =
    recipientBalanceCapabilities(account);
  if (transfersStatus === "active" || payoutsStatus === "active") return true;
  if (transfersStatus === "pending" || payoutsStatus === "pending") return true;
  return Boolean(account.identity?.entity_type);
}

function payoutStatusForAccount(account: ConnectRecipientAccount): string {
  const { transfersStatus, payoutsStatus, transferDetails, payoutDetails } =
    recipientBalanceCapabilities(account);
  if (transfersStatus === "active" && payoutsStatus === "active") return "ready";
  if (
    transfersStatus === "unsupported" ||
    payoutsStatus === "unsupported"
  ) {
    return "restricted";
  }
  const detailCodes = [...transferDetails, ...payoutDetails].map(
    (detail) => detail.code,
  );
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

async function retrieveConnectRecipientAccount(
  accountId: string,
): Promise<ConnectRecipientAccount> {
  return getStripeClient().v2.core.accounts.retrieve(accountId, {
    include: [...V2_ACCOUNT_INCLUDE],
  });
}

export type InvestorConnectBankAccountSummary = ConnectBankAccountSummary;

async function listInvestorConnectBankAccount(
  accountId: string,
  displayName?: string | null,
): Promise<InvestorConnectBankAccountSummary | null> {
  return resolveConnectBankAccountSummary({ accountId, displayName });
}

async function syncConnectAccount(
  account: ConnectRecipientAccount,
): Promise<void> {
  await db
    .update(userInvestorProfiles)
    .set({
      stripeConnectDetailsSubmitted: detailsSubmittedForAccount(account),
      // Recipient accounts do not take charges; keep column for status APIs.
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: payoutsEnabledForAccount(account),
      stripeConnectStatus: payoutStatusForAccount(account),
      stripeConnectUpdatedAt: new Date(),
    })
    .where(eq(userInvestorProfiles.stripeConnectAccountId, account.id));
}

function connectFieldsFromAccount(account: ConnectRecipientAccount) {
  return {
    stripeConnectAccountId: account.id,
    stripeConnectStatus: payoutStatusForAccount(account),
    stripeConnectDetailsSubmitted: detailsSubmittedForAccount(account),
    stripeConnectChargesEnabled: false as const,
    stripeConnectPayoutsEnabled: payoutsEnabledForAccount(account),
    stripeConnectUpdatedAt: new Date(),
  };
}

/** Attach a ready Connect bank to every other active profile that has no bank yet. */
async function shareConnectAccountToProfilesWithoutBank(params: {
  userId: string;
  account: ConnectRecipientAccount;
}): Promise<number> {
  if (!payoutsEnabledForAccount(params.account)) return 0;
  const fields = connectFieldsFromAccount(params.account);
  const updated = await db
    .update(userInvestorProfiles)
    .set(fields)
    .where(
      and(
        eq(userInvestorProfiles.userId, params.userId),
        eq(userInvestorProfiles.archived, false),
        eq(userInvestorProfiles.isDraft, false),
        or(
          isNull(userInvestorProfiles.stripeConnectAccountId),
          eq(userInvestorProfiles.stripeConnectAccountId, ""),
        ),
      ),
    )
    .returning({ id: userInvestorProfiles.id });
  return updated.length;
}

export type InvestorSharedConnectBank = {
  accountId: string;
  status: string;
  payoutsEnabled: boolean;
  bankAccount: InvestorConnectBankAccountSummary | null;
  profileIds: string[];
};

export async function listInvestorSharedConnectBanks(params: {
  investorUserId: string;
}): Promise<
  | { ok: true; banks: InvestorSharedConnectBank[] }
  | { ok: false; status: number; message: string }
> {
  const userId = uuid(params.investorUserId);
  if (!userId) {
    return { ok: false, status: 400, message: "Invalid user." };
  }

  // Include any profile that already has a Connect account, even if still draft,
  // so the Bank accounts tab shows banks right after Stripe return.
  const rows = await db
    .select({
      id: userInvestorProfiles.id,
      accountId: userInvestorProfiles.stripeConnectAccountId,
      status: userInvestorProfiles.stripeConnectStatus,
      payoutsEnabled: userInvestorProfiles.stripeConnectPayoutsEnabled,
      archived: userInvestorProfiles.archived,
      isDraft: userInvestorProfiles.isDraft,
    })
    .from(userInvestorProfiles)
    .where(eq(userInvestorProfiles.userId, userId));

  const byAccount = new Map<
    string,
    {
      status: string;
      payoutsEnabled: boolean;
      profileIds: string[];
    }
  >();
  for (const row of rows) {
    const accountId = row.accountId?.trim() || "";
    if (!accountId) continue;
    const existing = byAccount.get(accountId);
    // Prefer active non-draft profile ids in "Used by", but still keep the bank.
    const includeProfileId = !row.archived && !row.isDraft;
    if (existing) {
      if (includeProfileId) existing.profileIds.push(row.id);
      if (row.payoutsEnabled) existing.payoutsEnabled = true;
      if (row.status === "ready") existing.status = "ready";
    } else {
      byAccount.set(accountId, {
        status: row.status || "not_started",
        payoutsEnabled: Boolean(row.payoutsEnabled),
        profileIds: includeProfileId ? [row.id] : [],
      });
    }
  }

  const banks: InvestorSharedConnectBank[] = [];
  for (const [accountId, meta] of byAccount) {
    let status = meta.status;
    let payoutsEnabled = meta.payoutsEnabled;
    let bankAccount: InvestorConnectBankAccountSummary | null = null;
    try {
      const account = await retrieveConnectRecipientAccount(accountId);
      await syncConnectAccount(account);
      status = payoutStatusForAccount(account);
      payoutsEnabled = payoutsEnabledForAccount(account);
      bankAccount = await listInvestorConnectBankAccount(
        accountId,
        account.display_name,
      );
      if (payoutsEnabled) {
        await shareConnectAccountToProfilesWithoutBank({
          userId,
          account,
        });
      }
    } catch (err) {
      console.error("listInvestorSharedConnectBanks:", accountId, err);
      // Keep the row visible even if Stripe detail sync fails.
      bankAccount = await listInvestorConnectBankAccount(accountId);
    }
    banks.push({
      accountId,
      status,
      payoutsEnabled,
      bankAccount,
      profileIds: meta.profileIds,
    });
  }

  banks.sort((a, b) => {
    if (a.payoutsEnabled !== b.payoutsEnabled) {
      return a.payoutsEnabled ? -1 : 1;
    }
    return a.accountId.localeCompare(b.accountId);
  });

  return { ok: true, banks };
}

export async function attachInvestorConnectBankToProfile(params: {
  profileId: string;
  investorUserId: string;
  accountId: string;
}): Promise<
  | {
      ok: true;
      accountId: string;
      status: string;
      payoutsEnabled: boolean;
      bankAccount: InvestorConnectBankAccountSummary | null;
      sharedToProfileCount: number;
    }
  | { ok: false; status: number; message: string }
> {
  const profileId = uuid(params.profileId);
  const userId = uuid(params.investorUserId);
  const accountId = String(params.accountId ?? "").trim();
  if (!profileId || !userId || !accountId) {
    return { ok: false, status: 400, message: "Invalid profile or bank account." };
  }

  const [profile] = await db
    .select({ id: userInvestorProfiles.id })
    .from(userInvestorProfiles)
    .where(
      and(
        eq(userInvestorProfiles.id, profileId),
        eq(userInvestorProfiles.userId, userId),
        eq(userInvestorProfiles.isDraft, false),
      ),
    )
    .limit(1);
  if (!profile) {
    return { ok: false, status: 404, message: "Investor profile not found" };
  }

  const [owned] = await db
    .select({ id: userInvestorProfiles.id })
    .from(userInvestorProfiles)
    .where(
      and(
        eq(userInvestorProfiles.userId, userId),
        eq(userInvestorProfiles.stripeConnectAccountId, accountId),
      ),
    )
    .limit(1);
  if (!owned) {
    return {
      ok: false,
      status: 403,
      message: "That bank account is not linked to any of your profiles.",
    };
  }

  try {
    const account = await retrieveConnectRecipientAccount(accountId);
    const fields = connectFieldsFromAccount(account);
    await db
      .update(userInvestorProfiles)
      .set(fields)
      .where(eq(userInvestorProfiles.id, profileId));
    await syncConnectAccount(account);
    const sharedToProfileCount = await shareConnectAccountToProfilesWithoutBank({
      userId,
      account,
    });
    const bankAccount = await listInvestorConnectBankAccount(
      accountId,
      account.display_name,
    );
    return {
      ok: true,
      accountId,
      status: payoutStatusForAccount(account),
      payoutsEnabled: payoutsEnabledForAccount(account),
      bankAccount,
      sharedToProfileCount,
    };
  } catch (err) {
    console.error("attachInvestorConnectBankToProfile:", err);
    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (
      /duplicate key|unique constraint|user_investor_profiles_stripe_connect_account_uidx/i.test(
        msg,
      )
    ) {
      return {
        ok: false,
        status: 409,
        message:
          "This bank could not be linked because the database still enforces one Connect account per profile. Apply migration 0078 (shared Stripe Connect), then try again.",
      };
    }
    return {
      ok: false,
      status: 502,
      message:
        err instanceof Error
          ? err.message
          : "Could not attach bank account to this profile",
    };
  }
}

export type ConnectOnboardingResult =
  | {
      ok: true;
      url: string;
      accountId: string;
      status: string;
      payoutsEnabled: boolean;
    }
  | { ok: false; status: number; message: string };

/** Hosted Stripe Connect onboarding for one profile owned by the signed-in user. */
export async function createInvestorConnectOnboardingLink(params: {
  profileId: string;
  investorUserId: string;
  /** Start a new Connect account even if this profile already has one. */
  forceNew?: boolean;
}): Promise<ConnectOnboardingResult> {
  const profileId = uuid(params.profileId);
  const userId = uuid(params.investorUserId);
  if (!profileId || !userId) {
    return { ok: false, status: 400, message: "Invalid investor profile" };
  }

  const [row] = await db
    .select({
      id: userInvestorProfiles.id,
      userId: userInvestorProfiles.userId,
      profileName: userInvestorProfiles.profileName,
      stripeConnectAccountId: userInvestorProfiles.stripeConnectAccountId,
      email: users.email,
    })
    .from(userInvestorProfiles)
    .innerJoin(users, eq(users.id, userInvestorProfiles.userId))
    .where(
      and(
        eq(userInvestorProfiles.id, profileId),
        eq(userInvestorProfiles.userId, userId),
      ),
    )
    .limit(1);
  if (!row) {
    return { ok: false, status: 404, message: "Investor profile not found" };
  }

  const redirect = resolveStripeRedirectOrigin(
    getStripeConfig()?.testMode ?? false,
  );
  if (!redirect.ok) return redirect;
  const frontend = redirect.origin;

  const stripe = getStripeClient();
  try {
    let accountId = params.forceNew
      ? ""
      : row.stripeConnectAccountId?.trim() || "";
    let account: ConnectRecipientAccount;
    if (!accountId) {
      const idempotencyKey = params.forceNew
        ? `investor_connect_v2m_${profileId}_${randomUUID()}`
        : `investor_connect_v2m_${profileId}`;
      account = await stripe.v2.core.accounts.create(
        {
          contact_email: row.email,
          display_name: row.profileName?.trim() || "Investor",
          dashboard: "express",
          identity: {
            country: "us",
          },
          defaults: {
            responsibilities: {
              fees_collector: "application",
              losses_collector: "application",
            },
            profile: {
              product_description:
                "Investor distributions from private investment offerings",
            },
          },
          configuration: v2RecipientWithMerchantConfiguration(),
          metadata: {
            flow: "investor_distribution_recipient",
            investorUserId: userId,
            userInvestorProfileId: profileId,
          },
          include: [...V2_ACCOUNT_INCLUDE],
        },
        { idempotencyKey },
      );
      accountId = account.id;
      await db
        .update(userInvestorProfiles)
        .set(connectFieldsFromAccount(account))
        .where(eq(userInvestorProfiles.id, profileId));
    } else {
      account = await retrieveConnectRecipientAccount(accountId);
      if (!hasMerchantCardPayments(account)) {
        account = await stripe.v2.core.accounts.update(accountId, {
          configuration: v2RecipientWithMerchantConfiguration(),
          include: [...V2_ACCOUNT_INCLUDE],
        });
      }
      await syncConnectAccount(account);
    }

    const encodedProfile = encodeURIComponent(profileId);
    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: [...V2_ONBOARDING_CONFIGURATIONS],
          refresh_url: `${frontend}/investing/profiles?stripe_connect=refresh&profile_id=${encodedProfile}`,
          return_url: `${frontend}/investing/profiles?stripe_connect=return&profile_id=${encodedProfile}`,
          collection_options: {
            fields: "eventually_due",
            future_requirements: "include",
          },
        },
      },
    });

    if (payoutsEnabledForAccount(account)) {
      await shareConnectAccountToProfilesWithoutBank({
        userId,
        account,
      });
    }

    return {
      ok: true,
      url: link.url,
      accountId,
      status: payoutStatusForAccount(account),
      payoutsEnabled: payoutsEnabledForAccount(account),
    };
  } catch (err) {
    console.error("createInvestorConnectOnboardingLink:", err);
    return {
      ok: false,
      status: 502,
      message:
        err instanceof Error
          ? err.message
          : "Could not start bank setup",
    };
  }
}

export async function getInvestorConnectStatus(params: {
  profileId: string;
  investorUserId: string;
}): Promise<
  | {
      ok: true;
      accountId: string | null;
      status: string;
      detailsSubmitted: boolean;
      payoutsEnabled: boolean;
      bankAccount: InvestorConnectBankAccountSummary | null;
      sharedToProfileCount?: number;
    }
  | { ok: false; status: number; message: string }
> {
  const profileId = uuid(params.profileId);
  const userId = uuid(params.investorUserId);
  if (!profileId || !userId) {
    return { ok: false, status: 400, message: "Invalid investor profile" };
  }
  const [profile] = await db
    .select()
    .from(userInvestorProfiles)
    .where(
      and(
        eq(userInvestorProfiles.id, profileId),
        eq(userInvestorProfiles.userId, userId),
      ),
    )
    .limit(1);
  if (!profile) {
    return { ok: false, status: 404, message: "Investor profile not found" };
  }

  const accountId = profile.stripeConnectAccountId?.trim() || null;
  if (!accountId) {
    return {
      ok: true,
      accountId: null,
      status: "not_started",
      detailsSubmitted: false,
      payoutsEnabled: false,
      bankAccount: null,
    };
  }

  try {
    const account = await retrieveConnectRecipientAccount(accountId);
    await syncConnectAccount(account);
    const bankAccount = await listInvestorConnectBankAccount(
      accountId,
      account.display_name,
    );
    let sharedToProfileCount = 0;
    if (payoutsEnabledForAccount(account)) {
      sharedToProfileCount = await shareConnectAccountToProfilesWithoutBank({
        userId,
        account,
      });
    }
    return {
      ok: true,
      accountId,
      status: payoutStatusForAccount(account),
      detailsSubmitted: detailsSubmittedForAccount(account),
      payoutsEnabled: payoutsEnabledForAccount(account),
      bankAccount,
      sharedToProfileCount,
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      message:
        err instanceof Error
          ? err.message
          : "Could not retrieve bank account status",
    };
  }
}

type PayoutLineResult = {
  investmentId: string;
  investorName: string;
  amountCents: number;
  status: string;
  message?: string;
};

export type ExecuteDistributionPayoutsResult =
  | {
      ok: true;
      results: PayoutLineResult[];
      initiated: number;
      skipped: number;
      failed: number;
    }
  | { ok: false; status: number; message: string };

/**
 * Debits the deal's distribution funding account, transfers each line to the
 * investor's Connect account, then creates a standard ACH payout to their bank.
 * Pass `investmentIds` to pay one (or a subset of) investor lines.
 */
export async function executeDistributionPayouts(params: {
  dealId: string;
  distributionId: string;
  initiatedByUserId: string;
  /** When set, only these investment / investor line ids are paid. */
  investmentIds?: string[];
}): Promise<ExecuteDistributionPayoutsResult> {
  const dealId = uuid(params.dealId);
  const initiatedByUserId = uuid(params.initiatedByUserId);
  const distributionId = String(params.distributionId ?? "").trim();
  if (!dealId || !initiatedByUserId || !distributionId) {
    return {
      ok: false,
      status: 400,
      message: "Invalid deal, distribution, or initiating user.",
    };
  }

  const onlyInvestmentIds = new Set(
    (params.investmentIds ?? [])
      .map((id) => uuid(id))
      .filter((id): id is string => Boolean(id)),
  );
  if ((params.investmentIds?.length ?? 0) > 0 && onlyInvestmentIds.size === 0) {
    return {
      ok: false,
      status: 400,
      message: "Invalid investment id for payout.",
    };
  }

  const funding = await requireDealDistributionFundingSource(dealId);
  if (!funding.ok) {
    return {
      ok: false,
      status: funding.status,
      message: funding.message,
    };
  }

  const bundle = await getDistributionSetupBundle(dealId);
  const distribution = bundle?.priorDistributions.find(
    (row) => row.id === distributionId,
  );
  if (!bundle || !distribution) {
    return { ok: false, status: 404, message: "Distribution not found" };
  }
  if (!distribution.investorPayments?.length) {
    return {
      ok: false,
      status: 409,
      message: "This distribution has no persisted investor payment lines.",
    };
  }

  const stripe = getStripeClient();
  const results: PayoutLineResult[] = [];
  const paymentLines =
    onlyInvestmentIds.size > 0
      ? distribution.investorPayments.filter((line) => {
          const id = uuid(line.investorId);
          return id != null && onlyInvestmentIds.has(id);
        })
      : distribution.investorPayments;

  const coSponsorKeys = await listCoSponsorVisibleInvestorMatchKeys(
    dealId,
    params.initiatedByUserId,
  );
  const visiblePaymentLines = coSponsorKeys
    ? paymentLines.filter((line) => {
        const invId = String(line.investorId ?? "").trim().toLowerCase();
        const contactId = String(line.contactId ?? "").trim().toLowerCase();
        const email = String(line.userEmail ?? "").trim().toLowerCase();
        if (invId && coSponsorKeys.investmentIds.has(invId)) return true;
        if (contactId && coSponsorKeys.contactIds.has(contactId)) return true;
        if (invId && coSponsorKeys.contactIds.has(invId)) return true;
        if (email.includes("@") && coSponsorKeys.emails.has(email)) return true;
        return false;
      })
    : paymentLines;

  if (onlyInvestmentIds.size > 0 && visiblePaymentLines.length === 0) {
    return {
      ok: false,
      status: 404,
      message: "Investor payment line not found on this distribution.",
    };
  }

  for (const line of visiblePaymentLines) {
    const investmentId = uuid(line.investorId);
    const amount = Number(String(line.payment ?? "").replace(/[$,\s]/g, ""));
    const amountCents = Math.round(amount * 100);
    const investorName = line.investorName || "Investor";
    if (!investmentId || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
      results.push({
        investmentId: line.investorId,
        investorName,
        amountCents: Math.max(0, amountCents || 0),
        status: "skipped",
        message: "Invalid investment id or payout amount.",
      });
      continue;
    }

    const [investment] = await db
      .select({
        id: dealInvestment.id,
        userInvestorProfileId: dealInvestment.userInvestorProfileId,
        profileUserId: userInvestorProfiles.userId,
        connectAccountId: userInvestorProfiles.stripeConnectAccountId,
        connectStatus: userInvestorProfiles.stripeConnectStatus,
        payoutsEnabled: userInvestorProfiles.stripeConnectPayoutsEnabled,
      })
      .from(dealInvestment)
      .leftJoin(
        userInvestorProfiles,
        eq(userInvestorProfiles.id, dealInvestment.userInvestorProfileId),
      )
      .where(
        and(
          eq(dealInvestment.id, investmentId),
          eq(dealInvestment.dealId, dealId),
        ),
      )
      .limit(1);

    const profileId = uuid(investment?.userInvestorProfileId);
    const investorUserId = uuid(investment?.profileUserId);
    const accountId = String(investment?.connectAccountId ?? "").trim();
    let payoutsEnabled = Boolean(investment?.payoutsEnabled);
    // DB flags can lag Stripe (webhooks/local return). Refresh before skipping.
    if (accountId && !payoutsEnabled) {
      try {
        const connectAccount = await retrieveConnectRecipientAccount(accountId);
        await syncConnectAccount(connectAccount);
        payoutsEnabled = payoutsEnabledForAccount(connectAccount);
      } catch (err) {
        console.error(
          "executeDistributionPayouts: refresh Connect status failed",
          accountId,
          err,
        );
      }
    }
    if (
      !investment ||
      !profileId ||
      !investorUserId ||
      !accountId ||
      !payoutsEnabled
    ) {
      const reason = !investment
        ? "Investment line was not found for this distribution payout."
        : !profileId
          ? "This investment is not linked to an investor profile."
          : !accountId
            ? "This investor profile has no bank account. Add a bank account on Investing → Profiles."
            : !payoutsEnabled
              ? "Bank setup is incomplete for the investor profile linked to this investment."
              : "Investor must add a bank account before payout.";
      results.push({
        investmentId,
        investorName,
        amountCents,
        status: "skipped",
        message: reason,
      });
      continue;
    }

    await db
      .insert(investorDistributionPayouts)
      .values({
        dealId,
        distributionId,
        investmentId,
        userInvestorProfileId: profileId,
        investorUserId,
        initiatedByUserId,
        amountCents,
        currency: "usd",
        stripeConnectedAccountId: accountId,
        status: "pending",
      })
      .onConflictDoNothing();

    const [local] = await db
      .select()
      .from(investorDistributionPayouts)
      .where(
        and(
          eq(investorDistributionPayouts.dealId, dealId),
          eq(investorDistributionPayouts.distributionId, distributionId),
          eq(investorDistributionPayouts.investmentId, investmentId),
        ),
      )
      .limit(1);
    if (!local) {
      results.push({
        investmentId,
        investorName,
        amountCents,
        status: "failed",
        message: "Could not create the local payout record.",
      });
      continue;
    }
    if (local.status === "paid" || local.status === "processing") {
      results.push({
        investmentId,
        investorName,
        amountCents,
        status: local.status,
      });
      continue;
    }
    if (local.amountCents !== amountCents) {
      results.push({
        investmentId,
        investorName,
        amountCents,
        status: "failed",
        message:
          "The distribution amount changed after payout preparation. Create a new distribution run.",
      });
      continue;
    }

    const isRetry =
      local.status === "failed" ||
      local.status === "canceled" ||
      local.status === "reversed";

    try {
      let transferId =
        isRetry && local.status === "reversed"
          ? ""
          : local.stripeTransferId?.trim() || "";
      if (!transferId) {
        // Pull funds from the deal funding Connect balance (not SyndicationX billing).
        const debit = await debitDealFundingAccountForDistribution({
          dealAccountId: funding.accountId,
          amountCents,
          dealId,
          distributionId,
          idempotencyKey: isRetry
            ? `deal_funding_debit_${local.id}_${local.updatedAt.getTime()}`
            : `deal_funding_debit_${local.id}`,
        });
        if (!debit.ok) {
          await db
            .update(investorDistributionPayouts)
            .set({
              status: "failed",
              failureCode: "deal_funding_debit_failed",
              failureMessage: debit.message,
              updatedAt: new Date(),
            })
            .where(eq(investorDistributionPayouts.id, local.id));
          results.push({
            investmentId,
            investorName,
            amountCents,
            status: "failed",
            message: debit.message,
          });
          continue;
        }

        const transfer = await stripe.transfers.create(
          {
            amount: amountCents,
            currency: "usd",
            destination: accountId,
            transfer_group: `distribution_${distributionId}`,
            metadata: {
              flow: "investor_distribution",
              fundingSource: "deal_distribution_funding",
              dealFundingAccountId: funding.accountId,
              dealFundingChargeId: debit.chargeId,
              payoutRecordId: local.id,
              dealId,
              distributionId,
              investmentId,
            },
          },
          {
            idempotencyKey: isRetry
              ? `distribution_transfer_${local.id}_${local.updatedAt.getTime()}`
              : `distribution_transfer_${local.id}`,
          },
        );
        transferId = transfer.id;
        await db
          .update(investorDistributionPayouts)
          .set({
            stripeTransferId: transferId,
            status: "transferred",
            initiatedAt: new Date(),
            failureCode: null,
            failureMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(investorDistributionPayouts.id, local.id));
      }

      // Failed/canceled payouts keep their Stripe id; clear so a new ACH can be created.
      let payoutId = isRetry ? "" : local.stripePayoutId?.trim() || "";
      if (!payoutId) {
        const payout = await stripe.payouts.create(
          {
            amount: amountCents,
            currency: "usd",
            method: "standard",
            metadata: {
              flow: "investor_distribution",
              payoutRecordId: local.id,
              dealId,
              distributionId,
              investmentId,
              transferId,
            },
          },
          {
            stripeAccount: accountId,
            idempotencyKey: isRetry
              ? `distribution_payout_${local.id}_${local.updatedAt.getTime()}`
              : `distribution_payout_${local.id}`,
          },
        );
        payoutId = payout.id;
      }

      await db
        .update(investorDistributionPayouts)
        .set({
          stripeTransferId: transferId,
          stripePayoutId: payoutId,
          status: "processing",
          initiatedAt: local.initiatedAt ?? new Date(),
          failureCode: null,
          failureMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(investorDistributionPayouts.id, local.id));
      results.push({
        investmentId,
        investorName,
        amountCents,
        status: "processing",
      });
    } catch (err) {
      const stripeError = err as Stripe.errors.StripeError;
      const message =
        err instanceof Error ? err.message : "Stripe payout creation failed";
      await db
        .update(investorDistributionPayouts)
        .set({
          status: "failed",
          failureCode: stripeError?.code ?? null,
          failureMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(investorDistributionPayouts.id, local.id));
      results.push({
        investmentId,
        investorName,
        amountCents,
        status: "failed",
        message,
      });
    }
  }

  return {
    ok: true,
    results,
    initiated: results.filter((r) => r.status === "processing").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}

export async function listDistributionPayouts(params: {
  dealId: string;
  distributionId: string;
  viewerUserId?: string | null;
}) {
  const dealId = uuid(params.dealId);
  const distributionId = String(params.distributionId ?? "").trim();
  if (!dealId || !distributionId) return [];
  const rows = await db
    .select()
    .from(investorDistributionPayouts)
    .where(
      and(
        eq(investorDistributionPayouts.dealId, dealId),
        eq(investorDistributionPayouts.distributionId, distributionId),
      ),
    );
  const keys = await listCoSponsorVisibleInvestorMatchKeys(
    dealId,
    String(params.viewerUserId ?? "").trim(),
  );
  if (!keys) return rows;
  return rows.filter((row) => {
    const invId = String(row.investmentId ?? "").trim().toLowerCase();
    return Boolean(invId && keys.investmentIds.has(invId));
  });
}

function connectAccountIdFromWebhookEvent(event: Stripe.Event): string | null {
  const type = String(event.type ?? "");
  if (type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    return account?.id?.trim() || null;
  }
  // Accounts v2 requirement updates (thin/thick event destinations).
  if (
    type.startsWith("v2.core.account") ||
    type.includes("account[requirements]")
  ) {
    const obj = event.data?.object as { id?: string } | undefined;
    if (obj?.id?.startsWith("acct_")) return obj.id;
    const related = (
      event as Stripe.Event & {
        related_object?: { id?: string };
      }
    ).related_object;
    if (related?.id?.startsWith("acct_")) return related.id;
  }
  return null;
}

/** Handles Connect account/payout events; false means unrelated event. */
export async function handleDistributionConnectWebhookEvent(
  event: Stripe.Event,
): Promise<boolean> {
  if (await handleDealDistributionFundingWebhookEvent(event)) {
    return true;
  }

  const connectAccountId = connectAccountIdFromWebhookEvent(event);
  if (connectAccountId) {
    const [profile] = await db
      .select({ id: userInvestorProfiles.id })
      .from(userInvestorProfiles)
      .where(
        eq(userInvestorProfiles.stripeConnectAccountId, connectAccountId),
      )
      .limit(1);
    if (!profile) return false;
    const account = await retrieveConnectRecipientAccount(connectAccountId);
    await syncConnectAccount(account);
    return true;
  }

  if (
    event.type === "payout.paid" ||
    event.type === "payout.failed" ||
    event.type === "payout.canceled"
  ) {
    const payout = event.data.object as Stripe.Payout;
    const [local] = await db
      .select()
      .from(investorDistributionPayouts)
      .where(eq(investorDistributionPayouts.stripePayoutId, payout.id))
      .limit(1);
    if (!local) return false;
    const status =
      event.type === "payout.paid"
        ? "paid"
        : event.type === "payout.canceled"
          ? "canceled"
          : "failed";
    await db
      .update(investorDistributionPayouts)
      .set({
        status,
        failureCode: payout.failure_code ?? null,
        failureMessage: payout.failure_message ?? null,
        paidAt: status === "paid" ? new Date() : local.paidAt,
        updatedAt: new Date(),
      })
      .where(eq(investorDistributionPayouts.id, local.id));
    return true;
  }

  if (event.type === "transfer.reversed") {
    const transfer = event.data.object as Stripe.Transfer;
    const [local] = await db
      .select()
      .from(investorDistributionPayouts)
      .where(eq(investorDistributionPayouts.stripeTransferId, transfer.id))
      .limit(1);
    if (!local) return false;
    await db
      .update(investorDistributionPayouts)
      .set({
        status: "reversed",
        failureMessage: "Stripe transfer was reversed.",
        updatedAt: new Date(),
      })
      .where(eq(investorDistributionPayouts.id, local.id));
    return true;
  }

  return false;
}

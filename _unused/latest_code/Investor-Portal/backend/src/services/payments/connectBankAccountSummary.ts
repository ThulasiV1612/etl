import type Stripe from "stripe";
import { getStripeClient } from "../billing/companyBilling.service.js";

export type ConnectBankAccountSummary = {
  bankName: string | null;
  last4: string | null;
  routingNumber: string | null;
  accountHolderName: string | null;
  currency: string | null;
  status: string | null;
};

type PayoutMethodBank = {
  bank_name?: string | null;
  last4?: string | null;
  routing_number?: string | null;
  account_holder_name?: string | null;
  supported_currencies?: string[] | null;
};

type PayoutMethodRow = {
  type?: string | null;
  bank_account?: PayoutMethodBank | null;
  usage_status?: { transfers?: string | null; payments?: string | null } | null;
};

function summaryFromV1Bank(
  bank: Stripe.BankAccount,
): ConnectBankAccountSummary {
  return {
    bankName: bank.bank_name?.trim() || null,
    last4: bank.last4?.trim() || null,
    routingNumber: bank.routing_number?.trim() || null,
    accountHolderName: bank.account_holder_name?.trim() || null,
    currency: bank.currency?.trim()?.toUpperCase() || null,
    status: bank.status?.trim() || null,
  };
}

function summaryFromV2PayoutMethod(
  row: PayoutMethodRow,
): ConnectBankAccountSummary | null {
  const bank = row.bank_account;
  if (!bank) return null;
  const currency = Array.isArray(bank.supported_currencies)
    ? bank.supported_currencies[0]?.trim()?.toUpperCase() || null
    : null;
  const transfers = row.usage_status?.transfers?.trim() || null;
  return {
    bankName: bank.bank_name?.trim() || null,
    last4: bank.last4?.trim() || null,
    routingNumber: bank.routing_number?.trim() || null,
    accountHolderName: bank.account_holder_name?.trim() || null,
    currency,
    status: transfers,
  };
}

function hasUsefulBankDetails(summary: ConnectBankAccountSummary | null): boolean {
  if (!summary) return false;
  return Boolean(
    summary.last4 ||
      summary.bankName ||
      summary.routingNumber ||
      summary.accountHolderName,
  );
}

/**
 * Resolve masked bank details for a Connect account.
 * Tries classic external accounts first, then Accounts v2 payout methods.
 */
export async function resolveConnectBankAccountSummary(params: {
  accountId: string;
  /** Optional display name fallback when Stripe has not returned bank fields yet. */
  displayName?: string | null;
}): Promise<ConnectBankAccountSummary | null> {
  const accountId = params.accountId.trim();
  if (!accountId) return null;
  const stripe = getStripeClient();

  try {
    const listed = await stripe.accounts.listExternalAccounts(accountId, {
      object: "bank_account",
      limit: 5,
    });
    const bank = listed.data.find(
      (row): row is Stripe.BankAccount => row.object === "bank_account",
    );
    if (bank) {
      const summary = summaryFromV1Bank(bank);
      if (hasUsefulBankDetails(summary)) return summary;
    }
  } catch (err) {
    console.error("resolveConnectBankAccountSummary.listExternalAccounts:", err);
  }

  try {
    // Payout Methods is a Stripe preview API; GA versions like *.dahlia 404
    // unless Stripe-Version uses an explicit *.preview header.
    const response = (await stripe.rawRequest(
      "GET",
      "/v2/money_management/payout_methods",
      undefined,
      {
        stripeContext: accountId,
        apiVersion: "2026-06-24.preview",
      },
    )) as { data?: PayoutMethodRow[] };
    const rows = Array.isArray(response?.data) ? response.data : [];
    for (const row of rows) {
      if (row.type && row.type !== "bank_account") continue;
      const summary = summaryFromV2PayoutMethod(row);
      if (hasUsefulBankDetails(summary)) return summary;
    }
  } catch (err) {
    console.error("resolveConnectBankAccountSummary.payoutMethods:", err);
  }

  const displayName = params.displayName?.trim() || null;
  if (displayName) {
    return {
      bankName: displayName,
      last4: null,
      routingNumber: null,
      accountHolderName: null,
      currency: null,
      status: "linked",
    };
  }

  // Still return a stub so UIs can show that a Connect bank setup exists.
  return {
    bankName: "Bank account on file",
    last4: null,
    routingNumber: null,
    accountHolderName: null,
    currency: null,
    status: "linked",
  };
}

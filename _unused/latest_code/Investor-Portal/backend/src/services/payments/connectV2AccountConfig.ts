/**
 * Stripe Accounts v2 now requires merchant card_payments whenever
 * recipient stripe_balance.stripe_transfers is requested.
 */
export const V2_ACCOUNT_INCLUDE = [
  "configuration.recipient",
  "configuration.merchant",
  "identity",
  "requirements",
] as const;

export const V2_ONBOARDING_CONFIGURATIONS = ["recipient", "merchant"] as const;

export function v2RecipientWithMerchantConfiguration() {
  return {
    merchant: {
      capabilities: {
        card_payments: { requested: true as const },
      },
    },
    recipient: {
      capabilities: {
        stripe_balance: {
          stripe_transfers: { requested: true as const },
        },
      },
    },
  };
}

export function hasMerchantCardPayments(account: {
  configuration?: {
    merchant?: {
      capabilities?: { card_payments?: { status?: string | null } | null };
    } | null;
  } | null;
}): boolean {
  return Boolean(
    account.configuration?.merchant?.capabilities?.card_payments?.status,
  );
}

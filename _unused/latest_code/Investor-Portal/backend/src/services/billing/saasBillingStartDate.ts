/**
 * CHANGE THE PLATFORM SAAS BILLING START DATE HERE.
 *
 * Midnight UTC on this calendar day is the first due date: complimentary
 * access ends and unpaid lead sponsors must pay. After a deal is on a
 * Stripe subscription, next billing dates come from Stripe — this value
 * is not reused as the renewal date.
 *
 * The Settings → Billing date picker is commented out; every company and
 * deal uses this value for that first due date only.
 *
 * Edit year / month / day below (month is 1–12, not 0-based).
 */
export const HARDCODED_SAAS_BILLING_START_YEAR = 2026;
export const HARDCODED_SAAS_BILLING_START_MONTH = 9; // September
export const HARDCODED_SAAS_BILLING_START_DAY = 10;

export const HARDCODED_SAAS_BILLING_STARTS_AT = new Date(
  Date.UTC(
    HARDCODED_SAAS_BILLING_START_YEAR,
    HARDCODED_SAAS_BILLING_START_MONTH - 1,
    HARDCODED_SAAS_BILLING_START_DAY,
    0,
    0,
    0,
    0,
  ),
);

/**
 * Stripe SaaS billing — credentials from environment only.
 *
 * Seat-band Price IDs (preferred), e.g.:
 *   STARTER_5_MONTH_PRICING / STARTER_5_YEARLY_PRICING
 *   STARTER_10_MONTH_PRICING / STARTER_10_YEARLY_PRICING
 *   STARTER_10_PLUS_MONTH_PRICING / STARTER_10_PLUS_YEARLY_PRICING
 *   (same for RUNNING_*, GROWTH_*)
 *
 * Legacy flat Price IDs (fallback when a seat-band var is unset):
 *   STARTER_MONTH_PRICING / STARTER_YEARLY_PRICING
 *   RUNNING_MONTH_PRICING / RUNNING_YEARLY_PRICING
 *   GROWTH_MONTH_PRICING / GROWTH_YEARLY_PRICING
 *
 * Also:
 *   STRIPE_SECRET_KEY=sk_test_... | sk_live_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 */

export type StripeBillingPlanId = "starter" | "running" | "growth";
export type StripeBillingCycle = "monthly" | "annual";
export type StripeBillingSeatBand = "5" | "10" | "10plus";

/** Included company users (team members) per deal plan. Extra users are $10 each. */
export const INCLUDED_COMPANY_USERS_BY_PLAN: Record<
  StripeBillingPlanId,
  number
> = {
  starter: 1,
  running: 2,
  growth: 3,
};

/** One-time fee in cents for each company user beyond the plan included count. */
export const EXTRA_COMPANY_USER_FEE_CENTS = 1000;

/** Self-serve cap; 25+ company users is custom / contact sales. */
export const MAX_SELF_SERVE_COMPANY_USERS = 24;

export const EXTRA_COMPANY_USER_PAYMENT_REQUIRED =
  "EXTRA_COMPANY_USER_PAYMENT_REQUIRED";

export function includedCompanyUsersForPlan(
  planId: string | null | undefined,
): number {
  const plan = normalizeBillingPlanId(planId);
  if (!plan) return INCLUDED_COMPANY_USERS_BY_PLAN.starter;
  return INCLUDED_COMPANY_USERS_BY_PLAN[plan];
}

export const STRIPE_BILLING_PLAN_IDS: readonly StripeBillingPlanId[] = [
  "starter",
  "running",
  "growth",
] as const;

export const STRIPE_BILLING_SEAT_BANDS: readonly StripeBillingSeatBand[] = [
  "5",
  "10",
  "10plus",
] as const;

/** Env suffix for each seat band (STARTER_10_PLUS_MONTH_PRICING). */
const SEAT_ENV_SUFFIX: Record<StripeBillingSeatBand, string> = {
  "5": "5",
  "10": "10",
  "10plus": "10_PLUS",
};

type CyclePriceMap = Record<StripeBillingCycle, string | null>;
type SeatPriceMap = Record<StripeBillingSeatBand, CyclePriceMap>;

export type StripeConfig = {
  secretKey: string;
  /** pk_test_… / pk_live_… — safe to expose to the SPA for Payment Element */
  publishableKey: string | null;
  webhookSecret: string | null;
  testMode: boolean;
  prices: Record<StripeBillingPlanId, SeatPriceMap>;
};

function isStripeTestKey(secretKey: string): boolean {
  return secretKey.startsWith("sk_test_");
}

function envPrice(name: string): string | null {
  const v = process.env[name]?.trim() ?? "";
  return v.startsWith("price_") ? v : null;
}

function seatPriceEnvName(
  planId: StripeBillingPlanId,
  seatBand: StripeBillingSeatBand,
  cycle: StripeBillingCycle,
): string {
  const plan = planId.toUpperCase();
  const seat = SEAT_ENV_SUFFIX[seatBand];
  const cyclePart = cycle === "monthly" ? "MONTH" : "YEARLY";
  return `${plan}_${seat}_${cyclePart}_PRICING`;
}

function legacyPriceEnvName(
  planId: StripeBillingPlanId,
  cycle: StripeBillingCycle,
): string {
  const plan = planId.toUpperCase();
  const cyclePart = cycle === "monthly" ? "MONTH" : "YEARLY";
  return `${plan}_${cyclePart}_PRICING`;
}

function emptySeatPriceMap(): SeatPriceMap {
  return {
    "5": { monthly: null, annual: null },
    "10": { monthly: null, annual: null },
    "10plus": { monthly: null, annual: null },
  };
}

function buildPriceMap(): StripeConfig["prices"] {
  const prices = {
    starter: emptySeatPriceMap(),
    running: emptySeatPriceMap(),
    growth: emptySeatPriceMap(),
  } as StripeConfig["prices"];

  for (const planId of STRIPE_BILLING_PLAN_IDS) {
    const legacyMonthly = envPrice(legacyPriceEnvName(planId, "monthly"));
    const legacyAnnual = envPrice(legacyPriceEnvName(planId, "annual"));
    for (const seatBand of STRIPE_BILLING_SEAT_BANDS) {
      prices[planId][seatBand] = {
        monthly:
          envPrice(seatPriceEnvName(planId, seatBand, "monthly")) ??
          legacyMonthly,
        annual:
          envPrice(seatPriceEnvName(planId, seatBand, "annual")) ??
          legacyAnnual,
      };
    }
  }
  return prices;
}

export function isStripeBillingPlanId(v: string): v is StripeBillingPlanId {
  return (STRIPE_BILLING_PLAN_IDS as readonly string[]).includes(v);
}

export function isStripeBillingSeatBand(v: string): v is StripeBillingSeatBand {
  return (STRIPE_BILLING_SEAT_BANDS as readonly string[]).includes(v);
}

/** Accept starter_5 etc. from older UI and map to tier. */
export function normalizeBillingPlanId(
  raw: string | null | undefined,
): StripeBillingPlanId | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (isStripeBillingPlanId(s)) return s;
  if (s.startsWith("starter")) return "starter";
  if (s.startsWith("running")) return "running";
  if (s.startsWith("growth")) return "growth";
  return null;
}

/** Normalize UI/API seat values: 5 | 10 | 10plus | 10+ | 10_plus. */
export function normalizeBillingSeatBand(
  raw: string | null | undefined,
): StripeBillingSeatBand | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!s) return null;
  if (s === "5" || s === "5users" || s === "users_5") return "5";
  if (s === "10" || s === "10users" || s === "users_10") return "10";
  if (
    s === "10plus" ||
    s === "10+" ||
    s === "10_plus" ||
    s === "10-plus" ||
    s === "10plususers" ||
    s === "users_10plus" ||
    s === "users_10_plus"
  ) {
    return "10plus";
  }
  return null;
}

function envPublishableKey(): string | null {
  const v = process.env.STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  return v.startsWith("pk_") ? v : null;
}

export function getStripeConfig(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!secretKey.startsWith("sk_")) return null;

  return {
    secretKey,
    publishableKey: envPublishableKey(),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
    testMode: isStripeTestKey(secretKey),
    prices: buildPriceMap(),
  };
}

export function requireStripeConfig(): StripeConfig {
  const cfg = getStripeConfig();
  if (!cfg) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env.",
    );
  }
  return cfg;
}

export function resolveStripePriceId(
  planId: string,
  cycle: string,
  seatBand?: string | null,
): string | null {
  const cfg = getStripeConfig();
  if (!cfg) return null;
  const plan = normalizeBillingPlanId(planId);
  if (!plan) return null;
  const c: StripeBillingCycle | null =
    cycle === "monthly"
      ? "monthly"
      : cycle === "annual" || cycle === "annually" || cycle === "yearly"
        ? "annual"
        : null;
  if (!c) return null;
  const seat = normalizeBillingSeatBand(seatBand) ?? "5";
  return cfg.prices[plan][seat][c];
}

export function priceEnvNameFor(
  planId: StripeBillingPlanId,
  cycle: StripeBillingCycle,
  seatBand: StripeBillingSeatBand = "5",
): string {
  return seatPriceEnvName(planId, seatBand, cycle);
}

export function planAndCycleFromPriceId(
  priceId: string | null | undefined,
): {
  planId: StripeBillingPlanId | null;
  cycle: StripeBillingCycle | null;
  seatBand: StripeBillingSeatBand | null;
} {
  const id = String(priceId ?? "").trim();
  if (!id) return { planId: null, cycle: null, seatBand: null };
  const cfg = getStripeConfig();
  if (!cfg) return { planId: null, cycle: null, seatBand: null };
  for (const planId of STRIPE_BILLING_PLAN_IDS) {
    for (const seatBand of STRIPE_BILLING_SEAT_BANDS) {
      for (const cycle of ["monthly", "annual"] as const) {
        if (cfg.prices[planId][seatBand][cycle] === id) {
          return { planId, cycle, seatBand };
        }
      }
    }
  }
  return { planId: null, cycle: null, seatBand: null };
}

/** Safe for API responses — never exposes the secret key. */
export function getStripePublicConfig(): {
  configured: boolean;
  testMode: boolean;
  webhookConfigured: boolean;
  publishableKey: string | null;
  paymentElementReady: boolean;
  plans: Array<{
    id: StripeBillingPlanId;
    monthlyPriceId: string | null;
    annualPriceId: string | null;
    monthlyEnv: string;
    annualEnv: string;
    seats: Array<{
      seatBand: StripeBillingSeatBand;
      monthlyPriceId: string | null;
      annualPriceId: string | null;
      monthlyEnv: string;
      annualEnv: string;
    }>;
  }>;
} {
  const cfg = getStripeConfig();
  if (!cfg) {
    return {
      configured: false,
      testMode: false,
      webhookConfigured: false,
      publishableKey: null,
      paymentElementReady: false,
      plans: [],
    };
  }
  return {
    configured: true,
    testMode: cfg.testMode,
    webhookConfigured: Boolean(cfg.webhookSecret),
    publishableKey: cfg.publishableKey,
    paymentElementReady: Boolean(cfg.publishableKey),
    plans: STRIPE_BILLING_PLAN_IDS.map((id) => {
      const seats = STRIPE_BILLING_SEAT_BANDS.map((seatBand) => ({
        seatBand,
        monthlyPriceId: cfg.prices[id][seatBand].monthly,
        annualPriceId: cfg.prices[id][seatBand].annual,
        monthlyEnv: seatPriceEnvName(id, seatBand, "monthly"),
        annualEnv: seatPriceEnvName(id, seatBand, "annual"),
      }));
      // Top-level readiness: any seat configured (used by startup checks).
      const anyMonthly = seats.find((s) => s.monthlyPriceId) ?? seats[0];
      const anyAnnual = seats.find((s) => s.annualPriceId) ?? seats[0];
      return {
        id,
        monthlyPriceId: anyMonthly.monthlyPriceId,
        annualPriceId: anyAnnual.annualPriceId,
        monthlyEnv: anyMonthly.monthlyEnv,
        annualEnv: anyAnnual.annualEnv,
        seats,
      };
    }),
  };
}

const LOCALHOST_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

function stripEnvUrl(raw: string): string {
  return raw.trim().replace(/^['"]+|['"]+$/g, "").replace(/\/$/, "");
}

function parseHttpOrigin(raw: string): URL | null {
  const cleaned = stripEnvUrl(raw);
  if (!cleaned) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)
      ? cleaned
      : `http://${cleaned}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function resolveFrontendOrigin(): string {
  // This app uses BASE_URL as the SPA / portal origin for Stripe redirects.
  const raw =
    process.env.BASE_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.CLIENT_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    "";
  return stripEnvUrl(raw);
}

/**
 * Origin Stripe Account Links / Checkout may redirect back to.
 * Live mode requires https:// and forbids localhost.
 */
export function resolveStripeRedirectOrigin(testMode: boolean):
  | { ok: true; origin: string }
  | { ok: false; status: number; message: string } {
  const candidates = [
    process.env.STRIPE_RETURN_ORIGIN,
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.CLIENT_URL,
    process.env.PUBLIC_APP_URL,
    process.env.BASE_URL,
  ]
    .map((value) => parseHttpOrigin(value ?? ""))
    .filter((url): url is URL => Boolean(url));

  if (candidates.length === 0) {
    return {
      ok: false,
      status: 503,
      message: "BASE_URL must be configured for bank setup.",
    };
  }

  const chosen =
    candidates.find((url) => {
      if (LOCALHOST_HOST_RE.test(url.hostname)) return testMode;
      if (!testMode && url.protocol !== "https:") return false;
      return true;
    }) ?? null;

  if (!chosen) {
    if (!testMode && candidates.some((url) => LOCALHOST_HOST_RE.test(url.hostname))) {
      return {
        ok: false,
        status: 503,
        message:
          "Stripe live mode cannot use localhost return URLs. Use test API keys (sk_test_...) for local bank setup, or set STRIPE_RETURN_ORIGIN to an https:// public origin (for example an ngrok URL for this app).",
      };
    }
    return {
      ok: false,
      status: 503,
      message:
        "Stripe return URLs must start with https:// in live mode (http:// localhost is only allowed with test keys). Set STRIPE_RETURN_ORIGIN or FRONTEND_URL to a valid https origin.",
    };
  }

  return { ok: true, origin: chosen.origin };
}

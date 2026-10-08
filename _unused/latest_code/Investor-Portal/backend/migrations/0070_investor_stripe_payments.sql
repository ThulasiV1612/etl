ALTER TABLE "user_investor_profiles"
  ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_connect_details_submitted" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_connect_charges_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_connect_payouts_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_connect_status" varchar(32) DEFAULT 'not_started' NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_connect_updated_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "user_investor_profiles_stripe_connect_account_uidx"
  ON "user_investor_profiles" ("stripe_connect_account_id")
  WHERE "stripe_connect_account_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "investor_checkout_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "investment_id" uuid NOT NULL REFERENCES "deal_investment"("id") ON DELETE CASCADE,
  "deal_id" uuid NOT NULL REFERENCES "add_deal_form"("id") ON DELETE CASCADE,
  "investor_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "stripe_checkout_session_id" varchar(255) NOT NULL,
  "stripe_payment_intent_id" varchar(255),
  "amount_cents" integer NOT NULL,
  "currency" varchar(16) DEFAULT 'usd' NOT NULL,
  "status" varchar(32) DEFAULT 'created' NOT NULL,
  "failure_message" text,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "investor_checkout_payments_session_uidx"
  ON "investor_checkout_payments" ("stripe_checkout_session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "investor_checkout_payments_pi_uidx"
  ON "investor_checkout_payments" ("stripe_payment_intent_id")
  WHERE "stripe_payment_intent_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "investor_checkout_payments_investment_idx"
  ON "investor_checkout_payments" ("investment_id");
CREATE INDEX IF NOT EXISTS "investor_checkout_payments_deal_idx"
  ON "investor_checkout_payments" ("deal_id");

CREATE TABLE IF NOT EXISTS "investor_distribution_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL REFERENCES "add_deal_form"("id") ON DELETE CASCADE,
  "distribution_id" varchar(255) NOT NULL,
  "investment_id" uuid NOT NULL REFERENCES "deal_investment"("id") ON DELETE RESTRICT,
  "user_investor_profile_id" uuid NOT NULL REFERENCES "user_investor_profiles"("id") ON DELETE RESTRICT,
  "investor_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "initiated_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "amount_cents" integer NOT NULL,
  "currency" varchar(16) DEFAULT 'usd' NOT NULL,
  "stripe_connected_account_id" varchar(255) NOT NULL,
  "stripe_transfer_id" varchar(255),
  "stripe_payout_id" varchar(255),
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "failure_code" varchar(128),
  "failure_message" text,
  "initiated_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "investor_distribution_payouts_line_uidx"
  ON "investor_distribution_payouts" ("deal_id", "distribution_id", "investment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "investor_distribution_payouts_transfer_uidx"
  ON "investor_distribution_payouts" ("stripe_transfer_id")
  WHERE "stripe_transfer_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "investor_distribution_payouts_payout_uidx"
  ON "investor_distribution_payouts" ("stripe_payout_id")
  WHERE "stripe_payout_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "investor_distribution_payouts_distribution_idx"
  ON "investor_distribution_payouts" ("deal_id", "distribution_id");
CREATE INDEX IF NOT EXISTS "investor_distribution_payouts_profile_idx"
  ON "investor_distribution_payouts" ("user_investor_profile_id");

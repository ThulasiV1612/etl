-- Per-deal Stripe Connect account used as the source of ACH distribution payouts.
-- Lead/admin sponsor onboards bank details here; SaaS billing stays on the platform.

ALTER TABLE "add_deal_form"
  ADD COLUMN IF NOT EXISTS "stripe_distribution_funding_account_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_distribution_funding_status" varchar(32)
    DEFAULT 'not_started' NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_distribution_funding_details_submitted" boolean
    DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_distribution_funding_payouts_enabled" boolean
    DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_distribution_funding_setup_by_user_id" uuid
    REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "stripe_distribution_funding_updated_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "add_deal_form_stripe_dist_funding_acct_idx"
  ON "add_deal_form" ("stripe_distribution_funding_account_id")
  WHERE "stripe_distribution_funding_account_id" IS NOT NULL;

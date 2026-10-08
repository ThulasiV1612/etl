-- Per-deal SaaS billing. The company still owns one Stripe Customer and
-- payment methods; each billable deal (capital raising / asset managing,
-- not draft/archived/liquidated) gets its own Stripe Subscription.

ALTER TABLE "add_deal_form"
  ADD COLUMN IF NOT EXISTS "stripe_subscription_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_plan_id" varchar(64),
  ADD COLUMN IF NOT EXISTS "stripe_billing_cycle" varchar(32),
  ADD COLUMN IF NOT EXISTS "stripe_subscription_status" varchar(64)
    DEFAULT 'none' NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_price_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_current_period_end" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "saas_billing_starts_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "add_deal_form_stripe_subscription_uidx"
  ON "add_deal_form" ("stripe_subscription_id")
  WHERE "stripe_subscription_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "add_deal_form_org_saas_billing_idx"
  ON "add_deal_form" ("organization_id")
  WHERE "stripe_subscription_id" IS NOT NULL;

COMMENT ON COLUMN "add_deal_form"."stripe_subscription_id" IS
  'Stripe Subscription id (sub_…) for this deal''s SaaS fee.';
COMMENT ON COLUMN "add_deal_form"."stripe_current_period_end" IS
  'Next billing / renewal date for this deal''s SaaS subscription.';

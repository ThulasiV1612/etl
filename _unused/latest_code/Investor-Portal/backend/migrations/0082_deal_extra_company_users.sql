-- Paid extra company-user seats beyond the deal plan included count ($10 each).

ALTER TABLE "add_deal_form"
  ADD COLUMN IF NOT EXISTS "extra_company_users_paid" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "extra_company_users_last_payment_ref" varchar(255);
--> statement-breakpoint
COMMENT ON COLUMN "add_deal_form"."extra_company_users_paid" IS
  'Count of extra company users already paid at $10 each (beyond plan included users).';
--> statement-breakpoint
COMMENT ON COLUMN "add_deal_form"."extra_company_users_last_payment_ref" IS
  'Stripe Checkout session / PaymentIntent / subscription id last credited for extra users.';

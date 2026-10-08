-- First SaaS charge / paywall date. The current calendar month stays fully
-- accessible; billing starts at 00:00 UTC on the 1st of the next month.

ALTER TABLE "add_deal_form"
  ADD COLUMN IF NOT EXISTS "saas_billing_starts_at" timestamp with time zone;
--> statement-breakpoint
COMMENT ON COLUMN "add_deal_form"."saas_billing_starts_at" IS
  'When deal SaaS billing and the upgrade paywall start. Set once to the 1st of the next calendar month.';

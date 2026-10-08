-- Hold Capital Raising / Asset Managing until SaaS payment succeeds.
ALTER TABLE "add_deal_form"
  ADD COLUMN IF NOT EXISTS "pending_deal_stage" varchar(64);

COMMENT ON COLUMN "add_deal_form"."pending_deal_stage" IS
  'Intended billable stage while unpaid. deal_stage stays draft until Stripe SaaS payment completes.';

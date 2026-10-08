ALTER TABLE "deal_lp_investor" ADD COLUMN IF NOT EXISTS "percent_of_class_ownership" text DEFAULT '' NOT NULL;
ALTER TABLE "deal_lp_investor" ADD COLUMN IF NOT EXISTS "percent_of_class_distributions" text DEFAULT '' NOT NULL;

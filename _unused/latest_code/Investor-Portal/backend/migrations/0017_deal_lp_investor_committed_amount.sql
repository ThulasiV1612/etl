ALTER TABLE "deal_lp_investor" ADD COLUMN IF NOT EXISTS "committed_amount" text DEFAULT '' NOT NULL;

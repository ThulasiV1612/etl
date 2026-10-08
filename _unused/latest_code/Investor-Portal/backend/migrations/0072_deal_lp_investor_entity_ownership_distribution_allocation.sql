-- Entity Ownership % and Distribution Allocation % (separate from percent_of_class_*).
ALTER TABLE "deal_lp_investor" ADD COLUMN IF NOT EXISTS "entity_ownership_percent" text DEFAULT '' NOT NULL;
ALTER TABLE "deal_lp_investor" ADD COLUMN IF NOT EXISTS "distribution_allocation_percent" text DEFAULT '' NOT NULL;

ALTER TABLE "deal_investment" ADD COLUMN IF NOT EXISTS "user_investor_profile_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "deal_investment"
  ADD CONSTRAINT "deal_investment_user_investor_profile_id_user_investor_profiles_id_fk"
  FOREIGN KEY ("user_investor_profile_id")
  REFERENCES "user_investor_profiles"("id")
  ON DELETE set null
  ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deal_investment_user_investor_profile_id_idx" ON "deal_investment" ("user_investor_profile_id");
--> statement-breakpoint
ALTER TABLE "deal_lp_investor" ADD COLUMN IF NOT EXISTS "user_investor_profile_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "deal_lp_investor"
  ADD CONSTRAINT "deal_lp_investor_user_investor_profile_id_user_investor_profiles_id_fk"
  FOREIGN KEY ("user_investor_profile_id")
  REFERENCES "user_investor_profiles"("id")
  ON DELETE set null
  ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deal_lp_investor_user_investor_profile_id_idx" ON "deal_lp_investor" ("user_investor_profile_id");

-- Shared investor banks: the same Stripe Connect account may be linked to
-- multiple profiles for one user. The unique index from 0070 blocks attach.
DROP INDEX IF EXISTS "user_investor_profiles_stripe_connect_account_uidx";

CREATE INDEX IF NOT EXISTS "user_investor_profiles_stripe_connect_account_idx"
  ON "user_investor_profiles" ("stripe_connect_account_id")
  WHERE "stripe_connect_account_id" IS NOT NULL;

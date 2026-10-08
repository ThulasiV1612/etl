-- Distribution / bank details for LP investor profiles (ACH, check, other).
-- Values are synced from `form_snapshot` on save; backfill existing jsonb rows.

ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "distribution_method" varchar(32) NOT NULL DEFAULT '';
ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "ach_routing_number" varchar(9) NOT NULL DEFAULT '';
ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "ach_account_number" varchar(34) NOT NULL DEFAULT '';
ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "ach_bank_address" text NOT NULL DEFAULT '';
ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "ach_bank_name" varchar(255) NOT NULL DEFAULT '';
ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "ach_bank_account_type" varchar(32) NOT NULL DEFAULT '';
ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "bank_account_query" text NOT NULL DEFAULT '';
ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "check_payee_name" varchar(255) NOT NULL DEFAULT '';
ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "check_mailing_address_id" uuid;

DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_investor_profiles'
      AND column_name = 'form_snapshot'
  ) THEN
    UPDATE "user_investor_profiles"
    SET
      "distribution_method" = COALESCE(NULLIF(btrim("form_snapshot"->>'distributionMethod'), ''), "distribution_method"),
      "ach_routing_number" = COALESCE(NULLIF(btrim("form_snapshot"->>'achRoutingNumber'), ''), "ach_routing_number"),
      "ach_account_number" = COALESCE(NULLIF(btrim("form_snapshot"->>'achAccountNumber'), ''), "ach_account_number"),
      "ach_bank_address" = COALESCE(NULLIF(btrim("form_snapshot"->>'achBankAddress'), ''), "ach_bank_address"),
      "ach_bank_name" = COALESCE(NULLIF(btrim("form_snapshot"->>'achBankName'), ''), "ach_bank_name"),
      "ach_bank_account_type" = COALESCE(NULLIF(btrim("form_snapshot"->>'achBankAccountType'), ''), "ach_bank_account_type"),
      "bank_account_query" = COALESCE(NULLIF(btrim("form_snapshot"->>'bankAccountQuery'), ''), "bank_account_query"),
      "check_payee_name" = COALESCE(NULLIF(btrim("form_snapshot"->>'checkPayeeName'), ''), "check_payee_name"),
      "check_mailing_address_id" = CASE
        WHEN "form_snapshot"->>'checkMailingAddressId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN ("form_snapshot"->>'checkMailingAddressId')::uuid
        ELSE "check_mailing_address_id"
      END
    WHERE "form_snapshot" IS NOT NULL;
  END IF;
END
$migrate$;

COMMENT ON COLUMN "user_investor_profiles"."distribution_method" IS 'ach | check | other — how distributions are paid for this profile.';
COMMENT ON COLUMN "user_investor_profiles"."ach_routing_number" IS '9-digit ABA routing number when distribution_method is ach.';
COMMENT ON COLUMN "user_investor_profiles"."ach_account_number" IS 'Bank account number when distribution_method is ach.';
COMMENT ON COLUMN "user_investor_profiles"."ach_bank_address" IS 'Bank branch / mailing address when distribution_method is ach.';
COMMENT ON COLUMN "user_investor_profiles"."ach_bank_name" IS 'Financial institution name when distribution_method is ach.';
COMMENT ON COLUMN "user_investor_profiles"."ach_bank_account_type" IS 'e.g. checking | savings when distribution_method is ach.';

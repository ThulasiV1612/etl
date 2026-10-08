-- form_snapshot: native jsonb, clear name; drop legacy text column profile_wizard_state from 0025 when present.
-- Idempotent: ADD COLUMN IF NOT EXISTS; data copy only if legacy column exists.

ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "form_snapshot" jsonb;

DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_investor_profiles'
      AND column_name = 'profile_wizard_state'
  ) THEN
    UPDATE "user_investor_profiles"
    SET "form_snapshot" = btrim("profile_wizard_state")::jsonb
    WHERE "profile_wizard_state" IS NOT NULL
      AND btrim("profile_wizard_state") != ''
      AND "form_snapshot" IS NULL;
    ALTER TABLE "user_investor_profiles" DROP COLUMN "profile_wizard_state";
  END IF;
END
$migrate$;

COMMENT ON COLUMN "user_investor_profiles"."form_snapshot" IS
  'Add/edit LP profile wizard: one JSON object with all multi-step form fields (identity, tax, distribution, address IDs, beneficiary). NULL for legacy rows or when only list fields were saved.';

COMMENT ON TABLE "user_investor_profiles" IS
  'Saved investor (LP) profiles: display label, type, and optional add-profile form data per portal user.';

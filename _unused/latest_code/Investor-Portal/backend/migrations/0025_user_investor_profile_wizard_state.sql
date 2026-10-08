-- Transitional: stored wizard JSON as text. Superseded by 0026 (`form_snapshot` jsonb + column drop). Do not add new code against `profile_wizard_state`.
ALTER TABLE "user_investor_profiles" ADD COLUMN IF NOT EXISTS "profile_wizard_state" text;

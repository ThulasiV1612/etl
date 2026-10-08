-- Journal previously skipped 0014 / 0017; some DBs never got these columns.
-- Idempotent: safe when columns already exist (matches 0012 profile_id, 0014 email/role, 0017 committed_amount).

DO $$
BEGIN
  IF to_regclass('public.deal_lp_investor') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.deal_lp_investor
    ADD COLUMN IF NOT EXISTS profile_id text NOT NULL DEFAULT '';
END $$;

ALTER TABLE public.deal_lp_investor
  ADD COLUMN IF NOT EXISTS email character varying(255);

ALTER TABLE public.deal_lp_investor
  ADD COLUMN IF NOT EXISTS role character varying(100) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS deal_lp_investor_email_lower_idx
  ON public.deal_lp_investor (lower(trim(email)))
  WHERE nullif(trim(email), '') IS NOT NULL;

ALTER TABLE public.deal_lp_investor
  ADD COLUMN IF NOT EXISTS committed_amount text DEFAULT '' NOT NULL;

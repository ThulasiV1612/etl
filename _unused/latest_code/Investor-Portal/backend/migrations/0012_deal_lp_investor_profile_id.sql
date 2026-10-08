DO $$
BEGIN
  IF to_regclass('public.deal_lp_investor') IS NOT NULL THEN
    ALTER TABLE public.deal_lp_investor
      ADD COLUMN IF NOT EXISTS profile_id text NOT NULL DEFAULT '';
  END IF;
END $$;

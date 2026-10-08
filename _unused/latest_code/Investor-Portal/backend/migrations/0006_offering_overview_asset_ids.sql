DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS offering_overview_asset_ids text NOT NULL DEFAULT '[]';
  END IF;
END $$;

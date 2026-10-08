DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS address_line_1 text;
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS address_line_2 text;
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS state text;
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS zip_code text;
  END IF;
END $$;

-- Key Highlights metrics (Offering details), JSON array per deal
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS key_highlights_json text;
  END IF;
END $$;

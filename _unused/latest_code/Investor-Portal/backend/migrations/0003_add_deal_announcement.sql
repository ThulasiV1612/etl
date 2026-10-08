-- Deal-wide announcement (shown at top of deal detail for all viewers with access)
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS deal_announcement_title text;
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS deal_announcement_message text;
  END IF;
END $$;

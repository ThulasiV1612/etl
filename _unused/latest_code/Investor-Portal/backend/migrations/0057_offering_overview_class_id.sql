DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'add_deal_form') THEN
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS offering_overview_class_id uuid;
  END IF;
END $$;

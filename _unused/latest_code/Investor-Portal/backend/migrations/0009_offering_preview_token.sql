-- Encrypted preview token for LP offering share links (persisted per deal).
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    ALTER TABLE public.add_deal_form
      ADD COLUMN IF NOT EXISTS offering_preview_token text;
  END IF;
END $$;

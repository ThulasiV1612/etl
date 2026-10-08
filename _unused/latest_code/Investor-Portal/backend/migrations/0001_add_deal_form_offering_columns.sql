-- Offering details (replaces legacy backend/sql/*.sql). Idempotent.
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS investor_summary_html text;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS gallery_cover_image_url text;
  END IF;
END $$;

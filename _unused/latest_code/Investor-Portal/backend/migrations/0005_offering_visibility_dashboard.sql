-- Align offering_visibility with dashboard / investors / link-only options.
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    UPDATE public.add_deal_form
    SET offering_visibility = 'show_on_dashboard'
    WHERE offering_visibility = 'eligible_investors';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    UPDATE public.add_deal_form
    SET offering_visibility = 'only_visible_with_link'
    WHERE offering_visibility IN ('link_only', 'hidden');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    ALTER TABLE public.add_deal_form
      ALTER COLUMN offering_visibility SET DEFAULT 'show_on_dashboard';
  END IF;
END $$;

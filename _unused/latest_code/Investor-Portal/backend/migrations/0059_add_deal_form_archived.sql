-- Syndication deals list: Active vs Archives tab.
ALTER TABLE public.add_deal_form
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.add_deal_form.archived IS
  'When true, deal appears under Archives instead of Active on the syndication deals list.';

-- Deal-level Class Setup configuration (target raise + metadata for Distribution Engine).
ALTER TABLE public.add_deal_form
  ADD COLUMN IF NOT EXISTS class_setup_json text NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.add_deal_form.class_setup_json IS
  'JSON: Class Setup module deal-level config (targetRaise, latestChanges). Per-class terms live on deal_investor_class.';

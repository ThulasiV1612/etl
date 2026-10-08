-- Deal-level Distribution Waterfall configuration (payment rows per cash source).
ALTER TABLE public.add_deal_form
  ADD COLUMN IF NOT EXISTS distribution_setup_json text NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.add_deal_form.distribution_setup_json IS
  'JSON: Distribution Setup — waterfalls.operating / waterfalls.capital payment rows, plus priorDistributions [{amount,date}] from recorded runs. Split cascade is derived from class_setup_json.promote.';

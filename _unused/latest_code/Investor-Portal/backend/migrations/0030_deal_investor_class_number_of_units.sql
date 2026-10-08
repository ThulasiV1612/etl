-- Adds number_of_units if the DB applied an older 0000_deferred_schema before this column existed.
ALTER TABLE public.deal_investor_class ADD COLUMN IF NOT EXISTS number_of_units text NOT NULL DEFAULT '';

ALTER TABLE deal_investment
ADD COLUMN IF NOT EXISTS funding_method text NOT NULL DEFAULT '';

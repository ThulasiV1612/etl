ALTER TABLE deal_investment
  ADD COLUMN IF NOT EXISTS esign_status_json text;

ALTER TABLE deal_lp_investor
  ADD COLUMN IF NOT EXISTS esign_status_json text;

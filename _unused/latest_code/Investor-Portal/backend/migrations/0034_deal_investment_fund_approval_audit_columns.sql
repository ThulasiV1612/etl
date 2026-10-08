ALTER TABLE deal_investment
ADD COLUMN IF NOT EXISTS fund_approved_by text;
--> statement-breakpoint
ALTER TABLE deal_investment
ADD COLUMN IF NOT EXISTS fund_approved_at timestamp with time zone;

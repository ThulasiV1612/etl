-- Persist sponsor fund approval separately from workflow `status` (still synced on migrate from prior behavior).
ALTER TABLE deal_investment ADD COLUMN IF NOT EXISTS fund_approved boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE deal_investment
SET fund_approved = true
WHERE trim(status) IN ('Funding instructions sent', 'Funds fully received (complete)');

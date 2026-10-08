-- Last committed total when sponsor approved fund (LP adds show as snapshot + incremental until re-approved).
ALTER TABLE deal_investment ADD COLUMN IF NOT EXISTS fund_approved_commitment_snapshot text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE deal_investment
SET fund_approved_commitment_snapshot = trim(commitment_amount)
WHERE fund_approved = true
  AND trim(coalesce(fund_approved_commitment_snapshot, '')) = ''
  AND jsonb_array_length(coalesce(extra_contribution_amounts, '[]'::jsonb)) = 0;

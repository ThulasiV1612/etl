-- Per-deal co-sponsor preference: intercept lead-sponsor emails to their LPs.

ALTER TABLE "deal_member"
  ADD COLUMN IF NOT EXISTS "lead_sponsor_email_intercept" text NOT NULL DEFAULT 'yes';
--> statement-breakpoint
COMMENT ON COLUMN "deal_member"."lead_sponsor_email_intercept" IS
  'Co-sponsor only. yes = lead-sponsor deal emails go to this co-sponsor and their investors; no = send those emails to the co-sponsor only so they can later send the same template to their investors.';

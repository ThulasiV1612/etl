-- Align log table with app schema (subject + correct deal FK).
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "subject" varchar(500) NOT NULL DEFAULT '';
--> statement-breakpoint
-- Point deal_id at add_deal_form (portal deal rows), not deals placeholder table.
ALTER TABLE "investor_communication_logs"
  DROP CONSTRAINT IF EXISTS "deal_investor_communication_mail_deal_id_fk";
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  DROP CONSTRAINT IF EXISTS "investor_communication_logs_deal_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investor_communication_logs"
   ADD CONSTRAINT "investor_communication_logs_deal_id_fk"
   FOREIGN KEY ("deal_id")
   REFERENCES "public"."add_deal_form"("id")
   ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "deal_investor_communication_mail";

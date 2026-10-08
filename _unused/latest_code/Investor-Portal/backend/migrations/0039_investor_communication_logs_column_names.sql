-- pgAdmin / manual DDL often creates column names with trailing spaces
-- (e.g. "sent_at ", "created_at "). Drizzle expects trimmed names.
DO $$
DECLARE
  col record;
  trimmed text;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'investor_communication_logs'
      AND right(column_name, 1) = ' '
  LOOP
    trimmed := rtrim(col.column_name);
    IF trimmed = '' OR trimmed = col.column_name THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'investor_communication_logs'
        AND column_name = trimmed
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'ALTER TABLE "investor_communication_logs" RENAME COLUMN %I TO %I',
      col.column_name,
      trimmed
    );
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "template_id" uuid;
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "deal_id" uuid;
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "sender_id" uuid;
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "sender_name" varchar(255) NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "subject" varchar(500) NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "recipient_users" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "mail_status" varchar(32) NOT NULL DEFAULT 'sent';
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

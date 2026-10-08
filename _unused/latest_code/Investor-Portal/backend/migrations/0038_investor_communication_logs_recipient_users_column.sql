-- Manual/pgAdmin table builds sometimes add a trailing space in the column name
-- (`recipient_users `), which breaks Drizzle queries for `recipient_users`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'investor_communication_logs'
      AND column_name = 'recipient_users '
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'investor_communication_logs'
      AND column_name = 'recipient_users'
  ) THEN
    ALTER TABLE "investor_communication_logs"
      RENAME COLUMN "recipient_users " TO "recipient_users";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ADD COLUMN IF NOT EXISTS "recipient_users" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Manual table used `time with time zone` for date columns; app needs `timestamp with time zone`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'investor_communication_logs'
      AND column_name = 'sent_at'
      AND data_type = 'time with time zone'
  ) THEN
    ALTER TABLE "investor_communication_logs"
      ALTER COLUMN "sent_at" TYPE timestamp with time zone
      USING (
        CASE
          WHEN "sent_at" IS NULL THEN NULL
          ELSE (CURRENT_DATE + "sent_at")::timestamp with time zone
        END
      );
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'investor_communication_logs'
      AND column_name = 'created_at'
      AND data_type = 'time with time zone'
  ) THEN
    ALTER TABLE "investor_communication_logs"
      ALTER COLUMN "created_at" TYPE timestamp with time zone
      USING (
        CASE
          WHEN "created_at" IS NULL THEN now()
          ELSE (CURRENT_DATE + "created_at")::timestamp with time zone
        END
      );
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'investor_communication_logs'
      AND column_name = 'updated_at'
      AND data_type = 'time with time zone'
  ) THEN
    ALTER TABLE "investor_communication_logs"
      ALTER COLUMN "updated_at" TYPE timestamp with time zone
      USING (
        CASE
          WHEN "updated_at" IS NULL THEN now()
          ELSE (CURRENT_DATE + "updated_at")::timestamp with time zone
        END
      );
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "investor_communication_logs"
  ALTER COLUMN "updated_at" SET DEFAULT now();

CREATE TABLE IF NOT EXISTS "distribution_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL,
  "distribution_id" varchar(120) NOT NULL,
  "investor_id" varchar(120) DEFAULT '' NOT NULL,
  "contact_member_id" text DEFAULT '' NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "action" varchar(64) NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "changes_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "distribution_logs"
    ADD CONSTRAINT "distribution_logs_deal_id_add_deal_form_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."add_deal_form"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "distribution_logs"
    ADD CONSTRAINT "distribution_logs_actor_user_id_users_id_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "distribution_logs_deal_id_idx"
  ON "distribution_logs" ("deal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "distribution_logs_distribution_id_idx"
  ON "distribution_logs" ("distribution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "distribution_logs_created_at_idx"
  ON "distribution_logs" ("created_at");

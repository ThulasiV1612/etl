CREATE TABLE IF NOT EXISTS "investor_communication_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_id" uuid,
  "deal_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "sender_name" varchar(255) NOT NULL DEFAULT '',
  "subject" varchar(500) NOT NULL DEFAULT '',
  "recipient_users" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "mail_status" varchar(32) NOT NULL DEFAULT 'sent',
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investor_communication_logs"
   ADD CONSTRAINT "investor_communication_logs_template_id_fk"
   FOREIGN KEY ("template_id")
   REFERENCES "public"."contact_email_template"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
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
DO $$ BEGIN
 ALTER TABLE "investor_communication_logs"
   ADD CONSTRAINT "investor_communication_logs_sender_id_fk"
   FOREIGN KEY ("sender_id")
   REFERENCES "public"."users"("id")
   ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investor_communication_logs_deal_id_idx"
  ON "investor_communication_logs" USING btree ("deal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investor_communication_logs_sent_at_idx"
  ON "investor_communication_logs" USING btree ("sent_at");

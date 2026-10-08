CREATE TABLE IF NOT EXISTS "contact_email_template" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid,
  "name" varchar(255) NOT NULL,
  "subject" varchar(255) DEFAULT '' NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "attachment" jsonb,
  "archived" boolean DEFAULT false NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_email_template"
   ADD CONSTRAINT "contact_email_template_organization_id_companies_id_fk"
   FOREIGN KEY ("organization_id")
   REFERENCES "public"."companies"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_email_template"
   ADD CONSTRAINT "contact_email_template_created_by_users_id_fk"
   FOREIGN KEY ("created_by")
   REFERENCES "public"."users"("id")
   ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_email_template_organization_id_idx"
  ON "contact_email_template" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_email_template_created_by_idx"
  ON "contact_email_template" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_email_template_created_at_idx"
  ON "contact_email_template" USING btree ("created_at");

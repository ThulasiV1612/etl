CREATE TABLE IF NOT EXISTS "esign_reusable_template" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid,
  "name" varchar(255) NOT NULL,
  "dropbox_sign_template_id" varchar(128),
  "dropbox_sign_status" varchar(16) DEFAULT 'none' NOT NULL,
  "roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "relative_path" text,
  "original_name" varchar(512),
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "esign_reusable_template"
   ADD CONSTRAINT "esign_reusable_template_organization_id_companies_id_fk"
   FOREIGN KEY ("organization_id")
   REFERENCES "public"."companies"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "esign_reusable_template"
   ADD CONSTRAINT "esign_reusable_template_created_by_users_id_fk"
   FOREIGN KEY ("created_by")
   REFERENCES "public"."users"("id")
   ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "esign_reusable_template_organization_id_idx"
  ON "esign_reusable_template" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "esign_reusable_template_created_by_idx"
  ON "esign_reusable_template" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "esign_reusable_template_created_at_idx"
  ON "esign_reusable_template" USING btree ("created_at");

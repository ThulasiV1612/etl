CREATE TABLE IF NOT EXISTS "user_investor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_name" varchar(255) NOT NULL,
	"profile_type" varchar(100) NOT NULL DEFAULT '',
	"added_by" varchar(255) NOT NULL DEFAULT '',
	"investments_count" integer NOT NULL DEFAULT 0,
	"archived" boolean NOT NULL DEFAULT false,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_investor_profiles" ADD CONSTRAINT "user_investor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_investor_profiles_user_id_idx" ON "user_investor_profiles" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_beneficiaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" varchar(200) NOT NULL DEFAULT '',
	"relationship" varchar(100) NOT NULL DEFAULT '',
	"tax_id" varchar(100) NOT NULL DEFAULT '',
	"phone" varchar(32) NOT NULL DEFAULT '',
	"email" varchar(255) NOT NULL DEFAULT '',
	"address_query" text NOT NULL DEFAULT '',
	"archived" boolean NOT NULL DEFAULT false,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_beneficiaries" ADD CONSTRAINT "user_beneficiaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_beneficiaries_user_id_idx" ON "user_beneficiaries" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_saved_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name_or_company" varchar(255) NOT NULL DEFAULT '',
	"country" varchar(100) NOT NULL DEFAULT '',
	"street1" varchar(255) NOT NULL DEFAULT '',
	"street2" varchar(255) NOT NULL DEFAULT '',
	"city" varchar(100) NOT NULL DEFAULT '',
	"state" varchar(100) NOT NULL DEFAULT '',
	"zip" varchar(32) NOT NULL DEFAULT '',
	"check_memo" varchar(500) NOT NULL DEFAULT '',
	"distribution_note" text NOT NULL DEFAULT '',
	"archived" boolean NOT NULL DEFAULT false,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_saved_addresses" ADD CONSTRAINT "user_saved_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_saved_addresses_user_id_idx" ON "user_saved_addresses" ("user_id");

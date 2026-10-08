ALTER TABLE "contact"
ADD COLUMN IF NOT EXISTS "platform_admin_only" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "platform_signup_notification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "contact"("id") ON DELETE SET NULL,
  "signup_kind" varchar(32) NOT NULL,
  "company_name" varchar(500),
  "organization_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL,
  "user_email" varchar(255) NOT NULL,
  "user_display_name" varchar(400) NOT NULL,
  "user_role" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

UPDATE "contact" c
SET "platform_admin_only" = true
FROM "users" u
WHERE c."created_by" = u."id"
  AND c."organization_id" IS NULL
  AND c."is_portal_user" = true
  AND u."role" = 'investor'
  AND u."organization_id" IS NULL
  AND lower(trim(c."email")) = lower(trim(u."email"));

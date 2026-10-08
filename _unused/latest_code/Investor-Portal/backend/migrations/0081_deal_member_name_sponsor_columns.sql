-- Optional denormalized member / sponsor fields on deal roster.
-- Not required on add; sponsor type stays null unless set later.

ALTER TABLE "deal_member"
  ADD COLUMN IF NOT EXISTS "deal_member_name" text,
  ADD COLUMN IF NOT EXISTS "deal_member_sponsor_name" text,
  ADD COLUMN IF NOT EXISTS "deal_member_sponsor_type" text;
--> statement-breakpoint
COMMENT ON COLUMN "deal_member"."deal_member_name" IS
  'Optional deal member display name. Not required when adding a member.';
--> statement-breakpoint
COMMENT ON COLUMN "deal_member"."deal_member_sponsor_name" IS
  'Optional sponsor display name for this deal member. Not required when adding a member.';
--> statement-breakpoint
COMMENT ON COLUMN "deal_member"."deal_member_sponsor_type" IS
  'Optional sponsor type for this deal member. Defaults to null.';

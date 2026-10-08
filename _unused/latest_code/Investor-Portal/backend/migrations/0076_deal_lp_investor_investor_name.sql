-- Denormalized investor full name on LP roster.

ALTER TABLE "deal_lp_investor"
ADD COLUMN IF NOT EXISTS "investor_name" text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE "deal_lp_investor" AS lp
SET "investor_name" = COALESCE(
  NULLIF(TRIM(c.full_name), ''),
  NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(c.first_name), ''), NULLIF(TRIM(c.last_name), ''))), ''),
  NULLIF(TRIM(c.email), ''),
  lp.investor_name
)
FROM "contact" AS c
WHERE TRIM(lp.contact_member_id) <> ''
  AND LOWER(TRIM(lp.contact_member_id)) = LOWER(TRIM(c.id::text))
  AND TRIM(COALESCE(lp.investor_name, '')) = '';
--> statement-breakpoint
UPDATE "deal_lp_investor" AS lp
SET "investor_name" = COALESCE(
  NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(u.first_name), ''), NULLIF(TRIM(u.last_name), ''))), ''),
  NULLIF(TRIM(u.email), ''),
  lp.investor_name
)
FROM "users" AS u
WHERE TRIM(lp.contact_member_id) <> ''
  AND LOWER(TRIM(lp.contact_member_id)) = LOWER(TRIM(u.id::text))
  AND TRIM(COALESCE(lp.investor_name, '')) = '';
--> statement-breakpoint
UPDATE "deal_lp_investor" AS lp
SET "investor_name" = src.display_name
FROM (
  SELECT DISTINCT ON (di.deal_id, LOWER(TRIM(di.contact_id)))
    di.deal_id,
    LOWER(TRIM(di.contact_id)) AS contact_key,
    NULLIF(TRIM(di.contact_display_name), '') AS display_name
  FROM "deal_investment" AS di
  WHERE NULLIF(TRIM(di.contact_display_name), '') IS NOT NULL
  ORDER BY di.deal_id, LOWER(TRIM(di.contact_id)), di.created_at DESC
) AS src
WHERE lp.deal_id = src.deal_id
  AND LOWER(TRIM(lp.contact_member_id)) = src.contact_key
  AND TRIM(COALESCE(lp.investor_name, '')) = ''
  AND src.display_name IS NOT NULL;

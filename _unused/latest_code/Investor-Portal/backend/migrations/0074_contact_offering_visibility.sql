-- Contact offering visibility management (nullable CRM fields).
-- Migrates legacy show_offerings values into show_offerings_visibility.

ALTER TABLE "contact"
ADD COLUMN IF NOT EXISTS "show_offerings_visibility" varchar(32);

ALTER TABLE "contact"
ADD COLUMN IF NOT EXISTS "accreditation_status" text;

ALTER TABLE "contact"
ADD COLUMN IF NOT EXISTS "known_since" date;

UPDATE "contact"
SET "show_offerings_visibility" = CASE
  WHEN lower(trim(coalesce("show_offerings", ''))) IN ('hide', 'hide_offerings') THEN 'HIDE_OFFERINGS'
  WHEN lower(trim(coalesce("show_offerings", ''))) IN ('506c', '506_c', '506c_only') THEN '506C_ONLY'
  WHEN lower(trim(coalesce("show_offerings", ''))) IN ('show', 'all_offerings', 'all') THEN 'ALL_OFFERINGS'
  WHEN nullif(trim(coalesce("show_offerings", '')), '') IS NULL THEN NULL
  ELSE 'ALL_OFFERINGS'
END
WHERE "show_offerings_visibility" IS NULL
  AND nullif(trim(coalesce("show_offerings", '')), '') IS NOT NULL;

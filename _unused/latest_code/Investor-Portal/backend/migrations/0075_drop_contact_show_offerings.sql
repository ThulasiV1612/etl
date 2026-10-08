-- Drop legacy contact.show_offerings; source of truth is show_offerings_visibility.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contact'
      AND column_name = 'show_offerings'
  ) THEN
    UPDATE "contact"
    SET "show_offerings_visibility" = CASE
      WHEN lower(trim(coalesce("show_offerings", ''))) IN ('hide', 'hide_offerings') THEN 'HIDE_OFFERINGS'
      WHEN lower(trim(coalesce("show_offerings", ''))) IN ('506c', '506_c', '506c_only') THEN '506C_ONLY'
      WHEN lower(trim(coalesce("show_offerings", ''))) IN ('show', 'all_offerings', 'all') THEN 'ALL_OFFERINGS'
      ELSE "show_offerings_visibility"
    END
    WHERE "show_offerings_visibility" IS NULL
      AND nullif(trim(coalesce("show_offerings", '')), '') IS NOT NULL;

    ALTER TABLE "contact" DROP COLUMN IF EXISTS "show_offerings";
  END IF;
END $$;

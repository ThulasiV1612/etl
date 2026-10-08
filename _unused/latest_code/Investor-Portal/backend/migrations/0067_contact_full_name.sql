-- Persist contact full name next to last_name (concat first + last for now).

ALTER TABLE "contact"
ADD COLUMN IF NOT EXISTS "full_name" varchar(400) NOT NULL DEFAULT '';

UPDATE "contact"
SET "full_name" = trim(
  both ' ' FROM concat_ws(
    ' ',
    nullif(trim(both ' ' FROM "first_name"), ''),
    nullif(trim(both ' ' FROM "last_name"), '')
  )
)
WHERE coalesce(trim(both ' ' FROM "full_name"), '') = '';

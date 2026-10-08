-- Per-contact offering visibility (Show Offering / 506c only / Hide).

ALTER TABLE "contact"
ADD COLUMN IF NOT EXISTS "show_offerings" varchar(32) NOT NULL DEFAULT 'show';

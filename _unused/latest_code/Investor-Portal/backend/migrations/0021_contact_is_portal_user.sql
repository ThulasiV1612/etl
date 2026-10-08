-- Some databases never received 0013; idempotent with that migration.
ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS is_portal_user boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.contact c
  SET is_portal_user = true
  WHERE EXISTS (
    SELECT 1
    FROM public.users u
    WHERE lower(trim(u.email)) = lower(trim(c.email))
  );
END $$;

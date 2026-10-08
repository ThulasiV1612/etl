-- Align `users.organization_id` with `contact.organization_id`: both reference `companies(id)`.
-- Clear orphan UUIDs first so ADD CONSTRAINT does not fail on legacy/bad data.
UPDATE public.users u
SET organization_id = NULL
WHERE u.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.id = u.organization_id
  );

DO $$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE t.relname = 'users'
        AND n.nspname = 'public'
        AND c.conname = 'users_organization_id_fkey'
    ) THEN
      ALTER TABLE public.users
        ADD CONSTRAINT users_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.companies(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

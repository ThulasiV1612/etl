-- Scope CRM contacts by company; backfill from creator's users.organization_id.
ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'contact' AND c.conname = 'contact_organization_id_fkey'
    ) THEN
      ALTER TABLE public.contact
        ADD CONSTRAINT contact_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.companies(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contact_organization_id_idx ON public.contact (organization_id);

UPDATE public.contact c
SET organization_id = u.organization_id
FROM public.users u
WHERE u.id = c.created_by
  AND c.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

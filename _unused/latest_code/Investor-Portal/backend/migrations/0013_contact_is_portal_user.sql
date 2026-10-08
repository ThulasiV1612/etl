-- CRM contacts: hide portal accounts from "All contacts" lists.
ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS is_portal_user boolean NOT NULL DEFAULT false;

-- Backfill: any contact whose email matches a portal user row.
UPDATE public.contact c
SET is_portal_user = true
WHERE EXISTS (
  SELECT 1
  FROM public.users u
  WHERE lower(trim(u.email)) = lower(trim(c.email))
);

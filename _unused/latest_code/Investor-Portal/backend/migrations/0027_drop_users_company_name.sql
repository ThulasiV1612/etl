-- Company display name is canonical on public.companies; users.organization_id is the only link.
ALTER TABLE public.users DROP COLUMN IF EXISTS company_name;

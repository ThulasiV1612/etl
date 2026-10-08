-- Canonical org name and link for the seeded platform admin (company name now lives on public.companies only).
-- Company id 380a60f3-6ebf-43d4-9949-f4ee012eb426 is seeded in 0011_seed_companies.sql (Massive org).
UPDATE public.companies
SET
  name = 'Massive Capital',
  updated_at = now()
WHERE id = '380a60f3-6ebf-43d4-9949-f4ee012eb426'::uuid;

-- Seeded platform admin: b2c15cb6-1678-4819-9d24-6fdd8d192064 (0010), email platform.admin@example.com
UPDATE public.users
SET
  organization_id = '380a60f3-6ebf-43d4-9949-f4ee012eb426'::uuid,
  updated_at = now()
WHERE
  id = 'b2c15cb6-1678-4819-9d24-6fdd8d192064'::uuid
  OR (
    role = 'platform_admin'
    AND lower(trim(email)) = lower('platform.admin@example.com')
    AND organization_id IS NULL
  );

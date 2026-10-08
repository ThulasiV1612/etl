-- "Massive" and "Massive Capital" are separate organizations.
-- 380a60f3-... = Massive (e.g. seeded company admin). Do not conflate with platform branding.
-- 3f8a9c1e-... = Massive Capital (dedicated company for the seeded platform admin).
UPDATE public.companies
SET
  name = 'Massive',
  updated_at = now()
WHERE id = '380a60f3-6ebf-43d4-9949-f4ee012eb426'::uuid;

INSERT INTO public.companies (id, name, status, created_at, updated_at)
VALUES
  (
    '3f8a9c1e-2b4d-4f6a-8c7e-1d0e9a8b7c6d'::uuid,
    'Massive Capital',
    'active',
    now(),
    now()
  )
ON CONFLICT (id) DO UPDATE
SET
  name = 'Massive Capital',
  status = 'active',
  updated_at = now();

-- Platform admin only → Massive Capital (not Sanjay's "Massive" org).
UPDATE public.users
SET
  organization_id = '3f8a9c1e-2b4d-4f6a-8c7e-1d0e9a8b7c6d'::uuid,
  updated_at = now()
WHERE
  id = 'b2c15cb6-1678-4819-9d24-6fdd8d192064'::uuid
  OR (
    role = 'platform_admin'
    AND lower(trim(email)) = lower('platform.admin@example.com')
  );

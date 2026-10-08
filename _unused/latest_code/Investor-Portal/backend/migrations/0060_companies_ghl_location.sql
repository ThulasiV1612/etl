-- Per-organization GoHighLevel sub-account (location) mapping.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ghl_location_id varchar(64),
  ADD COLUMN IF NOT EXISTS ghl_location_status varchar(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ghl_location_error text,
  ADD COLUMN IF NOT EXISTS ghl_location_provisioned_at timestamptz;

COMMENT ON COLUMN public.companies.ghl_location_id IS
  'GoHighLevel sub-account (location) id for this organization.';
COMMENT ON COLUMN public.companies.ghl_location_status IS
  'pending | active | failed | skipped — GHL sub-account provisioning state.';
COMMENT ON COLUMN public.companies.ghl_location_error IS
  'Last GHL provisioning error message when ghl_location_status = failed.';
COMMENT ON COLUMN public.companies.ghl_location_provisioned_at IS
  'When the GHL sub-account was successfully created or linked.';

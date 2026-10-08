-- Per-organization Stripe SaaS billing fields.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_plan_id varchar(64),
  ADD COLUMN IF NOT EXISTS stripe_billing_cycle varchar(32),
  ADD COLUMN IF NOT EXISTS stripe_subscription_status varchar(64) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stripe_price_id varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_current_period_end timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_customer_id_uidx
  ON public.companies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_subscription_id_uidx
  ON public.companies (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN public.companies.stripe_customer_id IS
  'Stripe Customer id (cus_…) for this organization.';
COMMENT ON COLUMN public.companies.stripe_subscription_id IS
  'Stripe Subscription id (sub_…) when the company is on a paid plan.';
COMMENT ON COLUMN public.companies.stripe_plan_id IS
  'Local plan key: portal | platform | custom.';
COMMENT ON COLUMN public.companies.stripe_billing_cycle IS
  'Billing interval: monthly | annual.';
COMMENT ON COLUMN public.companies.stripe_subscription_status IS
  'Mirrors Stripe subscription status, or none when unset.';
COMMENT ON COLUMN public.companies.stripe_price_id IS
  'Active Stripe Price id (price_…).';
COMMENT ON COLUMN public.companies.stripe_current_period_end IS
  'End of the current Stripe billing period.';

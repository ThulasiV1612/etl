-- Ensure company Stripe SaaS billing columns exist.
-- Idempotent: safe when 0063 already applied correctly; heals DBs where 0063
-- was recorded in drizzle.__drizzle_migrations but columns were never created.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_plan_id varchar(64),
  ADD COLUMN IF NOT EXISTS stripe_billing_cycle varchar(32),
  ADD COLUMN IF NOT EXISTS stripe_subscription_status varchar(64) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stripe_price_id varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_last_payment_error text,
  ADD COLUMN IF NOT EXISTS stripe_last_payment_failed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_customer_id_uidx
  ON public.companies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_subscription_id_uidx
  ON public.companies (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Local mirror of Stripe PaymentMethods for company SaaS billing.

CREATE TABLE IF NOT EXISTS public.company_billing_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_payment_method_id varchar(255) NOT NULL,
  stripe_customer_id varchar(255),
  type varchar(64) NOT NULL DEFAULT 'card',
  brand varchar(64),
  last4 varchar(8),
  exp_month integer,
  exp_year integer,
  funding varchar(32),
  country varchar(8),
  fingerprint varchar(255),
  billing_name text,
  billing_email varchar(320),
  billing_phone varchar(64),
  billing_address jsonb,
  is_default boolean NOT NULL DEFAULT false,
  livemode boolean NOT NULL DEFAULT false,
  stripe_created_at timestamptz,
  /** Full Stripe PaymentMethod object (no PAN — Stripe never returns full card numbers). */
  stripe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  detached_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_billing_payment_methods_stripe_pm_uidx
  ON public.company_billing_payment_methods (stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS company_billing_payment_methods_company_idx
  ON public.company_billing_payment_methods (company_id);
CREATE INDEX IF NOT EXISTS company_billing_payment_methods_customer_idx
  ON public.company_billing_payment_methods (stripe_customer_id);

COMMENT ON TABLE public.company_billing_payment_methods IS
  'Local copy of Stripe PaymentMethods attached to the company customer (portal + checkout).';
COMMENT ON COLUMN public.company_billing_payment_methods.stripe_payload IS
  'Snapshot of the Stripe PaymentMethod object as returned by the API.';
COMMENT ON COLUMN public.company_billing_payment_methods.detached_at IS
  'Set when the payment method is removed in Stripe; null while active.';

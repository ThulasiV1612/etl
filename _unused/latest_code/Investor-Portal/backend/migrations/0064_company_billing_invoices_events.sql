-- Stripe billing failure tracking on companies + local invoice/event storage.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_last_payment_error text,
  ADD COLUMN IF NOT EXISTS stripe_last_payment_failed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.company_billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_invoice_id varchar(255) NOT NULL,
  stripe_customer_id varchar(255),
  stripe_subscription_id varchar(255),
  invoice_number varchar(128),
  status varchar(64) NOT NULL DEFAULT 'open',
  currency varchar(16) NOT NULL DEFAULT 'usd',
  amount_due_cents integer NOT NULL DEFAULT 0,
  amount_paid_cents integer NOT NULL DEFAULT 0,
  amount_remaining_cents integer NOT NULL DEFAULT 0,
  hosted_invoice_url text,
  invoice_pdf text,
  payment_failure_message text,
  payment_failed_at timestamptz,
  paid_at timestamptz,
  invoice_date timestamptz,
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_billing_invoices_stripe_invoice_uidx
  ON public.company_billing_invoices (stripe_invoice_id);
CREATE INDEX IF NOT EXISTS company_billing_invoices_company_idx
  ON public.company_billing_invoices (company_id);

CREATE TABLE IF NOT EXISTS public.company_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  stripe_event_id varchar(255),
  event_type varchar(128) NOT NULL,
  stripe_invoice_id varchar(255),
  stripe_subscription_id varchar(255),
  stripe_customer_id varchar(255),
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_billing_events_stripe_event_uidx
  ON public.company_billing_events (stripe_event_id);
CREATE INDEX IF NOT EXISTS company_billing_events_company_idx
  ON public.company_billing_events (company_id);

COMMENT ON TABLE public.company_billing_invoices IS
  'Local copy of Stripe invoices for company billing history and failure tracking.';
COMMENT ON TABLE public.company_billing_events IS
  'Append-only log of Stripe billing webhook/sync events.';
COMMENT ON COLUMN public.companies.stripe_last_payment_error IS
  'Last Stripe payment failure message for this company.';

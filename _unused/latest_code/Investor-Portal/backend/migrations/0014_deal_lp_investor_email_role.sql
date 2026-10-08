-- LP investor roster: email + role for portal login / investing-mode scope (single source of truth).
ALTER TABLE public.deal_lp_investor
  ADD COLUMN IF NOT EXISTS email character varying(255);

ALTER TABLE public.deal_lp_investor
  ADD COLUMN IF NOT EXISTS role character varying(100) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS deal_lp_investor_email_lower_idx
  ON public.deal_lp_investor (lower(trim(email)))
  WHERE nullif(trim(email), '') IS NOT NULL;

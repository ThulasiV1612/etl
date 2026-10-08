-- Core tables required before other migrations (auth, deals, audits).
-- Idempotent: safe on empty DB; skips when tables already exist (e.g. restored dump).

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name varchar(255) NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL AND to_regclass('public.deals') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'deals'
        AND c.conname = 'deals_company_id_companies_id_fk'
    ) THEN
      ALTER TABLE public.deals
        ADD CONSTRAINT deals_company_id_companies_id_fk
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  email varchar(255) NOT NULL,
  username varchar(100) NOT NULL,
  password_hash varchar(255) NOT NULL,
  role varchar(50) NOT NULL DEFAULT 'platform_user',
  user_status varchar(50) NOT NULL DEFAULT 'active',
  user_signup_completed varchar(10) NOT NULL DEFAULT 'true',
  organization_id uuid,
  first_name varchar(100) NOT NULL DEFAULT '',
  last_name varchar(100) NOT NULL DEFAULT '',
  company_name varchar(255) NOT NULL DEFAULT '',
  phone varchar(32) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  invite_expires_at timestamptz,
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_username_unique UNIQUE (username)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.add_deal_form (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid,
  deal_name text NOT NULL,
  deal_type text NOT NULL DEFAULT '',
  deal_stage text NOT NULL,
  sec_type text NOT NULL,
  close_date date,
  owning_entity_name text NOT NULL,
  funds_required_before_gp_sign boolean NOT NULL DEFAULT false,
  auto_send_funding_instructions boolean NOT NULL DEFAULT false,
  property_name text NOT NULL,
  country text NOT NULL DEFAULT '',
  address_line_1 text,
  address_line_2 text,
  city text NOT NULL DEFAULT '',
  state text,
  zip_code text,
  asset_image_path text,
  investor_summary_html text,
  gallery_cover_image_url text,
  key_highlights_json text,
  deal_announcement_title text,
  deal_announcement_message text,
  offering_status text NOT NULL DEFAULT 'draft_hidden',
  offering_visibility text NOT NULL DEFAULT 'show_on_dashboard',
  show_on_investbase boolean NOT NULL DEFAULT false,
  internal_name text NOT NULL DEFAULT '',
  offering_overview_asset_ids text NOT NULL DEFAULT '[]',
  offering_gallery_paths text NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  offering_preview_token text,
  CONSTRAINT add_deal_form_deal_stage_check CHECK (
    deal_stage = ANY (
      ARRAY[
        'draft'::text,
        'Draft'::text,
        'raising_capital'::text,
        'capital_raising'::text,
        'asset_managing'::text,
        'managing_asset'::text,
        'liquidated'::text
      ]
    )
  )
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL AND to_regclass('public.add_deal_form') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'add_deal_form'
        AND c.conname = 'add_deal_form_organization_id_fkey'
    ) THEN
      ALTER TABLE public.add_deal_form
        ADD CONSTRAINT add_deal_form_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.companies(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.member_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  action varchar(32) NOT NULL,
  reason text NOT NULL,
  changes_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL AND to_regclass('public.member_admin_audit_logs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'member_admin_audit_logs' AND c.conname = 'member_admin_audit_logs_actor_user_id_users_id_fk'
    ) THEN
      ALTER TABLE public.member_admin_audit_logs
        ADD CONSTRAINT member_admin_audit_logs_actor_user_id_users_id_fk
        FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'member_admin_audit_logs' AND c.conname = 'member_admin_audit_logs_target_user_id_users_id_fk'
    ) THEN
      ALTER TABLE public.member_admin_audit_logs
        ADD CONSTRAINT member_admin_audit_logs_target_user_id_users_id_fk
        FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.company_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id uuid NOT NULL,
  target_company_id uuid NOT NULL,
  action varchar(32) NOT NULL,
  reason text NOT NULL,
  changes_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL AND to_regclass('public.company_admin_audit_logs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'company_admin_audit_logs' AND c.conname = 'company_admin_audit_logs_actor_user_id_users_id_fk'
    ) THEN
      ALTER TABLE public.company_admin_audit_logs
        ADD CONSTRAINT company_admin_audit_logs_actor_user_id_users_id_fk
        FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
    END IF;
  END IF;
  IF to_regclass('public.companies') IS NOT NULL AND to_regclass('public.company_admin_audit_logs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'company_admin_audit_logs' AND c.conname = 'company_admin_audit_logs_target_company_id_companies_id_fk'
    ) THEN
      ALTER TABLE public.company_admin_audit_logs
        ADD CONSTRAINT company_admin_audit_logs_target_company_id_companies_id_fk
        FOREIGN KEY (target_company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

-- Idempotent schema updates previously applied at runtime from database/db.ts.
-- Run via `npm run db:migrate` or automatic migrate on server start.
-- Foreign keys are added in separate steps so CREATE TABLE does not fail when
-- parent tables are created outside this migration chain (or order differs).
-- gen_random_uuid() is built-in on PostgreSQL 13+. On older servers, create the
-- pgcrypto extension once outside a migration transaction (CREATE EXTENSION cannot
-- run inside Drizzle's migrate transaction).

CREATE TABLE IF NOT EXISTS deal_investment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid NOT NULL,
  offering_id text NOT NULL DEFAULT '',
  contact_id text NOT NULL DEFAULT '',
  profile_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  investor_class text NOT NULL DEFAULT '',
  doc_signed_date text,
  commitment_amount text NOT NULL DEFAULT '',
  extra_contribution_amounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  document_storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'deal_investment'
        AND c.conname = 'deal_investment_deal_id_fkey'
    ) THEN
      ALTER TABLE public.deal_investment
        ADD CONSTRAINT deal_investment_deal_id_fkey
        FOREIGN KEY (deal_id) REFERENCES public.add_deal_form(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE deal_investment ADD COLUMN IF NOT EXISTS contact_display_name text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE deal_investment ADD COLUMN IF NOT EXISTS investor_role text NOT NULL DEFAULT '';
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'deal_investment'
      AND c.column_name = 'investor_role'
  ) THEN
    ALTER TABLE deal_investment
      ALTER COLUMN investor_role DROP DEFAULT;
    ALTER TABLE deal_investment
      ALTER COLUMN investor_role TYPE text
      USING trim(both from coalesce(investor_role::text, ''));
    ALTER TABLE deal_investment
      ALTER COLUMN investor_role SET DEFAULT '';
    ALTER TABLE deal_investment
      ALTER COLUMN investor_role SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.deal_investor_class (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  subscription_type text NOT NULL DEFAULT '',
  entity_name text NOT NULL DEFAULT '',
  start_date text NOT NULL DEFAULT '',
  offering_size text NOT NULL DEFAULT '',
  raise_amount_distributions text NOT NULL DEFAULT '',
  billing_raise_quota text NOT NULL DEFAULT '',
  minimum_investment text NOT NULL DEFAULT '',
  price_per_unit text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT '',
  advanced_options_json text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'deal_investor_class'
        AND c.conname = 'deal_investor_class_deal_id_fkey'
    ) THEN
      ALTER TABLE public.deal_investor_class
        ADD CONSTRAINT deal_investor_class_deal_id_fkey
        FOREIGN KEY (deal_id) REFERENCES public.add_deal_form(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.deal_investor_class ADD COLUMN IF NOT EXISTS raise_amount_distributions text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE public.deal_investor_class ADD COLUMN IF NOT EXISTS billing_raise_quota text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE public.deal_investor_class ADD COLUMN IF NOT EXISTS advanced_options_json text NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE public.deal_investor_class ADD COLUMN IF NOT EXISTS number_of_units text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  first_name varchar(200) NOT NULL,
  last_name varchar(200) NOT NULL,
  email varchar(255) NOT NULL,
  phone varchar(64) NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  lists jsonb NOT NULL DEFAULT '[]'::jsonb,
  owners jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'contact'
        AND c.conname = 'contact_created_by_fkey'
    ) THEN
      ALTER TABLE public.contact
        ADD CONSTRAINT contact_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE contact ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE contact ADD COLUMN IF NOT EXISTS last_edit_reason text;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    ALTER TABLE public.add_deal_form ADD COLUMN IF NOT EXISTS organization_id uuid;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL
     AND to_regclass('public.companies') IS NOT NULL THEN
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
DO $ensure_add_deal_form_stage_check$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'add_deal_form'
        AND c.conname = 'add_deal_form_deal_stage_check'
    ) THEN
      ALTER TABLE public.add_deal_form
        DROP CONSTRAINT add_deal_form_deal_stage_check;
    END IF;
    ALTER TABLE public.add_deal_form
      ADD CONSTRAINT add_deal_form_deal_stage_check CHECK (
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
      );
  END IF;
END
$ensure_add_deal_form_stage_check$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS company_workspace_tab_settings (
  company_id uuid NOT NULL,
  tab_key varchar(64) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, tab_key)
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'company_workspace_tab_settings'
        AND c.conname = 'company_workspace_tab_settings_company_id_fkey'
    ) THEN
      ALTER TABLE public.company_workspace_tab_settings
        ADD CONSTRAINT company_workspace_tab_settings_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS deal_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid NOT NULL,
  added_by uuid,
  contact_member_id text NOT NULL DEFAULT '',
  deal_member_role text NOT NULL DEFAULT '',
  send_invitation_mail text NOT NULL DEFAULT 'no',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'deal_member'
        AND c.conname = 'deal_member_deal_id_fkey'
    ) THEN
      ALTER TABLE public.deal_member
        ADD CONSTRAINT deal_member_deal_id_fkey
        FOREIGN KEY (deal_id) REFERENCES public.add_deal_form(id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'deal_member'
        AND c.conname = 'deal_member_added_by_fkey'
    ) THEN
      ALTER TABLE public.deal_member
        ADD CONSTRAINT deal_member_added_by_fkey
        FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DO $migrate_deal_member$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_member' AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE deal_member ADD COLUMN IF NOT EXISTS added_by uuid;
    ALTER TABLE deal_member ADD COLUMN IF NOT EXISTS contact_member_id text;
    ALTER TABLE deal_member ADD COLUMN IF NOT EXISTS deal_member_role text;
    UPDATE deal_member SET
      contact_member_id = COALESCE(NULLIF(TRIM(contact_id), ''), ''),
      deal_member_role = COALESCE(NULLIF(TRIM(investor_role), ''), '');
    ALTER TABLE deal_member ALTER COLUMN contact_member_id SET NOT NULL;
    ALTER TABLE deal_member ALTER COLUMN deal_member_role SET NOT NULL;
    DROP INDEX IF EXISTS deal_member_deal_id_contact_id_uidx;
    ALTER TABLE deal_member DROP COLUMN IF EXISTS offering_id;
    ALTER TABLE deal_member DROP COLUMN IF EXISTS contact_display_name;
    ALTER TABLE deal_member DROP COLUMN IF EXISTS profile_id;
    ALTER TABLE deal_member DROP COLUMN IF EXISTS contact_id;
    ALTER TABLE deal_member DROP COLUMN IF EXISTS investor_role;
    ALTER TABLE deal_member DROP COLUMN IF EXISTS status;
    ALTER TABLE deal_member DROP COLUMN IF EXISTS investor_class;
    IF to_regclass('public.users') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'deal_member' AND c.conname = 'deal_member_added_by_fkey'
      ) THEN
        ALTER TABLE public.deal_member
          ADD CONSTRAINT deal_member_added_by_fkey
          FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END
$migrate_deal_member$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS deal_member_deal_id_contact_member_id_uidx
  ON deal_member (deal_id, contact_member_id);
--> statement-breakpoint
INSERT INTO deal_member (
  deal_id, added_by, contact_member_id, deal_member_role, send_invitation_mail, created_at, updated_at
)
SELECT DISTINCT ON (di.deal_id, di.contact_id)
  di.deal_id,
  NULL,
  COALESCE(NULLIF(TRIM(di.contact_id), ''), ''),
  COALESCE(NULLIF(TRIM(di.investor_role), ''), ''),
  'no',
  di.created_at,
  di.created_at
FROM deal_investment di
WHERE COALESCE(NULLIF(TRIM(di.contact_id), ''), '') <> ''
ORDER BY di.deal_id, di.contact_id, di.created_at DESC
ON CONFLICT (deal_id, contact_member_id) DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS deal_lp_investor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid NOT NULL,
  added_by uuid,
  contact_member_id text NOT NULL DEFAULT '',
  investor_class text NOT NULL DEFAULT '',
  send_invitation_mail text NOT NULL DEFAULT 'no',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'deal_lp_investor' AND c.conname = 'deal_lp_investor_deal_id_fkey'
    ) THEN
      ALTER TABLE public.deal_lp_investor
        ADD CONSTRAINT deal_lp_investor_deal_id_fkey
        FOREIGN KEY (deal_id) REFERENCES public.add_deal_form(id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'deal_lp_investor' AND c.conname = 'deal_lp_investor_added_by_fkey'
    ) THEN
      ALTER TABLE public.deal_lp_investor
        ADD CONSTRAINT deal_lp_investor_added_by_fkey
        FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS deal_lp_investor_deal_id_contact_member_id_uidx
  ON deal_lp_investor (deal_id, contact_member_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS assigning_deal_user (
  deal_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_added_deal uuid,
  PRIMARY KEY (deal_id, user_id)
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.add_deal_form') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'assigning_deal_user' AND c.conname = 'assigning_deal_user_deal_id_fkey'
    ) THEN
      ALTER TABLE public.assigning_deal_user
        ADD CONSTRAINT assigning_deal_user_deal_id_fkey
        FOREIGN KEY (deal_id) REFERENCES public.add_deal_form(id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'assigning_deal_user' AND c.conname = 'assigning_deal_user_user_id_fkey'
    ) THEN
      ALTER TABLE public.assigning_deal_user
        ADD CONSTRAINT assigning_deal_user_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'assigning_deal_user' AND c.conname = 'assigning_deal_user_user_added_deal_fkey'
    ) THEN
      ALTER TABLE public.assigning_deal_user
        ADD CONSTRAINT assigning_deal_user_user_added_deal_fkey
        FOREIGN KEY (user_added_deal) REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DO $ensure_adu_pk$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'assigning_deal_user'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'assigning_deal_user'
      AND c.contype = 'p'
  ) THEN
    ALTER TABLE public.assigning_deal_user
      ADD CONSTRAINT assigning_deal_user_pkey PRIMARY KEY (deal_id, user_id);
  END IF;
END
$ensure_adu_pk$;

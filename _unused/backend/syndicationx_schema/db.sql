-- =============================================================================
-- Investor Portal — consolidated PostgreSQL schema (reference)
-- Generated from Drizzle schema (backend/src/schema) + migrations through 0059.
-- Use for documentation / greenfield setup. For upgrades, run: npm run db:migrate
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Core
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name varchar(255) NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  email varchar(255) NOT NULL,
  username varchar(100) NOT NULL,
  password_hash varchar(255) NOT NULL,
  role varchar(50) NOT NULL DEFAULT 'platform_user',
  user_status varchar(50) NOT NULL DEFAULT 'active',
  user_signup_completed varchar(10) NOT NULL DEFAULT 'true',
  organization_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  first_name varchar(100) NOT NULL DEFAULT '',
  last_name varchar(100) NOT NULL DEFAULT '',
  phone varchar(32) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  invite_expires_at timestamptz,
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_username_unique UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS public.user_company_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role varchar(50) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_company_membership_user_company_uidx UNIQUE (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS public.user_auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_type varchar(16) NOT NULL CHECK (token_type IN ('access', 'refresh')),
  token_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_id uuid REFERENCES public.user_auth_tokens(id) ON DELETE SET NULL,
  portal_session_id uuid,
  user_agent text,
  client_ip varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_auth_tokens_hash_uidx
  ON public.user_auth_tokens (token_hash);

CREATE INDEX IF NOT EXISTS user_auth_tokens_user_type_active_idx
  ON public.user_auth_tokens (user_id, token_type)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS user_auth_tokens_expires_idx
  ON public.user_auth_tokens (expires_at);

-- -----------------------------------------------------------------------------
-- LP investing profiles (before deal_investment FKs)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_investor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_name varchar(255) NOT NULL,
  profile_type varchar(100) NOT NULL DEFAULT '',
  added_by varchar(255) NOT NULL DEFAULT '',
  investments_count integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  last_edit_reason text,
  form_snapshot jsonb,
  distribution_method varchar(32) NOT NULL DEFAULT '',
  ach_routing_number varchar(9) NOT NULL DEFAULT '',
  ach_account_number varchar(34) NOT NULL DEFAULT '',
  ach_bank_address text NOT NULL DEFAULT '',
  ach_bank_name varchar(255) NOT NULL DEFAULT '',
  ach_bank_account_type varchar(32) NOT NULL DEFAULT '',
  bank_account_query text NOT NULL DEFAULT '',
  check_payee_name varchar(255) NOT NULL DEFAULT '',
  check_mailing_address_id uuid,
  source_profile_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name varchar(200) NOT NULL DEFAULT '',
  relationship varchar(100) NOT NULL DEFAULT '',
  tax_id varchar(100) NOT NULL DEFAULT '',
  phone varchar(32) NOT NULL DEFAULT '',
  email varchar(255) NOT NULL DEFAULT '',
  address_query text NOT NULL DEFAULT '',
  archived boolean NOT NULL DEFAULT false,
  client_beneficiary_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_saved_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name_or_company varchar(255) NOT NULL DEFAULT '',
  country varchar(100) NOT NULL DEFAULT '',
  street1 varchar(255) NOT NULL DEFAULT '',
  street2 varchar(255) NOT NULL DEFAULT '',
  city varchar(100) NOT NULL DEFAULT '',
  state varchar(100) NOT NULL DEFAULT '',
  zip varchar(32) NOT NULL DEFAULT '',
  check_memo varchar(500) NOT NULL DEFAULT '',
  distribution_note text NOT NULL DEFAULT '',
  archived boolean NOT NULL DEFAULT false,
  client_address_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Deals / syndication
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.add_deal_form (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
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
  funding_instructions_json text,
  deal_announcement_title text,
  deal_announcement_message text,
  offering_status text NOT NULL DEFAULT 'draft_hidden',
  offering_visibility text NOT NULL DEFAULT 'show_on_dashboard',
  show_on_investbase boolean NOT NULL DEFAULT false,
  internal_name text NOT NULL DEFAULT '',
  offering_overview_asset_ids text NOT NULL DEFAULT '[]',
  offering_overview_class_id uuid,
  class_setup_json text,
  offering_gallery_paths text NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  offering_preview_token text,
  offering_investor_preview_json text,
  esign_templates_json text,
  investor_questionnaire_json text,
  attr_rows_json text,
  additional_info_json text,
  archived boolean NOT NULL DEFAULT false,
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

CREATE TABLE IF NOT EXISTS public.deal_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.add_deal_form(id) ON DELETE CASCADE,
  client_asset_id text NOT NULL,
  property_name text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  street_address_1 text NOT NULL DEFAULT '',
  street_address_2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  zip_code text NOT NULL DEFAULT '',
  address_display text NOT NULL DEFAULT '',
  asset_type text NOT NULL DEFAULT '',
  image_count integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  additional_info_json text NOT NULL DEFAULT '[]',
  attr_rows_json text NOT NULL DEFAULT '[]',
  image_preview_urls_json text NOT NULL DEFAULT '[]',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_asset_deal_client_uidx UNIQUE (deal_id, client_asset_id)
);

CREATE TABLE IF NOT EXISTS public.deal_investor_class (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.add_deal_form(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  subscription_type text NOT NULL DEFAULT '',
  entity_name text NOT NULL DEFAULT '',
  start_date text NOT NULL DEFAULT '',
  offering_size text NOT NULL DEFAULT '',
  raise_amount_distributions text NOT NULL DEFAULT '',
  billing_raise_quota text NOT NULL DEFAULT '',
  minimum_investment text NOT NULL DEFAULT '',
  number_of_units text NOT NULL DEFAULT '',
  price_per_unit text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT '',
  advanced_options_json text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deal_investment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.add_deal_form(id) ON DELETE CASCADE,
  offering_id text NOT NULL DEFAULT '',
  contact_id text NOT NULL DEFAULT '',
  contact_display_name text NOT NULL DEFAULT '',
  profile_id text NOT NULL DEFAULT '',
  user_investor_profile_id uuid REFERENCES public.user_investor_profiles(id) ON DELETE SET NULL,
  investor_role text NOT NULL DEFAULT '',
  fund_approved boolean NOT NULL DEFAULT false,
  fund_approved_by text,
  fund_approved_at timestamptz,
  fund_approved_commitment_snapshot text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  investor_class text NOT NULL DEFAULT '',
  doc_signed_date text,
  esign_status_json text,
  investor_questionnaire_answers_json text,
  investor_w9_form_json text,
  funding_method text NOT NULL DEFAULT '',
  commitment_amount text NOT NULL DEFAULT '',
  extra_contribution_amounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  document_storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deal_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.add_deal_form(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  contact_member_id text NOT NULL DEFAULT '',
  deal_member_role text NOT NULL DEFAULT '',
  send_invitation_mail text NOT NULL DEFAULT 'no',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_member_deal_id_contact_member_id_uidx UNIQUE (deal_id, contact_member_id)
);

CREATE TABLE IF NOT EXISTS public.deal_lp_investor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.add_deal_form(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  contact_member_id text NOT NULL DEFAULT '',
  email text,
  role text NOT NULL DEFAULT '',
  profile_id text NOT NULL DEFAULT '',
  user_investor_profile_id uuid REFERENCES public.user_investor_profiles(id) ON DELETE SET NULL,
  investor_class text NOT NULL DEFAULT '',
  send_invitation_mail text NOT NULL DEFAULT 'no',
  committed_amount text NOT NULL DEFAULT '',
  doc_signed_date text,
  esign_status_json text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_lp_investor_deal_id_contact_member_id_uidx UNIQUE (deal_id, contact_member_id)
);

CREATE TABLE IF NOT EXISTS public.assigning_deal_user (
  deal_id uuid NOT NULL REFERENCES public.add_deal_form(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_added_deal uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (deal_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.investment_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  investment_id uuid NOT NULL REFERENCES public.deal_investment(id) ON DELETE CASCADE,
  investor_id text NOT NULL DEFAULT '',
  signature_request_id text NOT NULL,
  status text NOT NULL DEFAULT 'Sent',
  sign_url text,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  completed_at timestamptz,
  dropbox_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS investment_signatures_signature_request_id_uidx
  ON public.investment_signatures (signature_request_id);

CREATE INDEX IF NOT EXISTS investment_signatures_investment_id_idx
  ON public.investment_signatures (investment_id);

-- -----------------------------------------------------------------------------
-- Contacts / CRM
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  first_name varchar(200) NOT NULL,
  last_name varchar(200) NOT NULL,
  email varchar(255) NOT NULL,
  is_portal_user boolean NOT NULL DEFAULT false,
  platform_admin_only boolean NOT NULL DEFAULT false,
  phone varchar(64) NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  lists jsonb NOT NULL DEFAULT '[]'::jsonb,
  owners jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'active',
  last_edit_reason text,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_email_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  name varchar(255) NOT NULL,
  subject varchar(255) NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  attachment jsonb,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_contact_tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_contact_tag_org_name_uidx UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.organization_contact_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_contact_list_org_name_uidx UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.investor_communication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid REFERENCES public.contact_email_template(id) ON DELETE SET NULL,
  deal_id uuid NOT NULL REFERENCES public.add_deal_form(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  sender_name varchar(255) NOT NULL DEFAULT '',
  subject varchar(500) NOT NULL DEFAULT '',
  recipient_users jsonb NOT NULL DEFAULT '[]'::jsonb,
  mail_status varchar(32) NOT NULL DEFAULT 'sent',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Company workspace
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_workspace_tab_settings (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tab_key varchar(64) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, tab_key)
);

-- -----------------------------------------------------------------------------
-- eSign library
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.esign_reusable_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  name varchar(255) NOT NULL,
  dropbox_sign_template_id varchar(128),
  dropbox_sign_status varchar(16) NOT NULL DEFAULT 'none',
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  relative_path text,
  original_name varchar(512),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived boolean NOT NULL DEFAULT false
);

-- -----------------------------------------------------------------------------
-- Audit / activity / notifications
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.member_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action varchar(32) NOT NULL,
  reason text NOT NULL,
  changes_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  action varchar(32) NOT NULL,
  reason text NOT NULL,
  changes_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.soc_auth_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  event varchar(512) NOT NULL,
  outcome varchar(32) NOT NULL,
  http_status integer NOT NULL,
  duration_ms integer NOT NULL,
  method varchar(16),
  path text,
  identifier text,
  client_ip varchar(128),
  requested_machine_ip varchar(128),
  request_url text,
  user_agent text,
  user_id varchar(36),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.user_page_navigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.user_portal_sessions(id) ON DELETE CASCADE,
  page_path text NOT NULL,
  page_label varchar(255) NOT NULL DEFAULT '',
  visit_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_page_navigations_session_path_uidx
  ON public.user_page_navigations (session_id, page_path);

CREATE TABLE IF NOT EXISTS public.platform_signup_notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contact(id) ON DELETE SET NULL,
  signup_kind varchar(32) NOT NULL,
  company_name varchar(500),
  organization_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_email varchar(255) NOT NULL,
  user_display_name varchar(400) NOT NULL,
  user_role varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Deferred FK: user_auth_tokens.portal_session_id (after user_portal_sessions)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_auth_tokens_portal_session_id_fkey'
  ) THEN
    ALTER TABLE public.user_auth_tokens
      ADD CONSTRAINT user_auth_tokens_portal_session_id_fkey
      FOREIGN KEY (portal_session_id)
      REFERENCES public.user_portal_sessions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

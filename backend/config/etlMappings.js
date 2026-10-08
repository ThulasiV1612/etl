/**
 * Central ETL mapping configuration.
 * Add new upload types here — the ETL engine reads this without code changes.
 *
 * Schema reference: backend/syndicationx_schema/db.sql
 *
 * Upload types cover all SyndicationX tables:
 *   add_deal_form, companies, contact, deal_investment, deal_investor_class,
 *   deal_lp_investor, deal_member, deals, organization_contact_list,
 *   organization_contact_tag, user_auth_tokens, user_beneficiaries,
 *   user_company_membership, user_investor_profiles, user_page_navigations,
 *   user_portal_sessions, user_saved_addresses, users
 *
 * Organization ID (from UI input, not Excel):
 *   Add to defaults → organization_id: { source: 'context', key: 'organizationId' }
 *   Or for company_id columns → company_id: { source: 'context', key: 'organizationId' }
 *   See backend/config/etlOrganizationContext.js
 */
module.exports = {
  // ---------------------------------------------------------------------------
  // Deal creation (add_deal_form)
  // ---------------------------------------------------------------------------
  DEAL_CREATION: {
    targetTable: 'add_deal_form',
    columns: [
      { excelColumn: 'Deal name', databaseColumn: 'deal_name', dataType: 'STRING', required: true },
      { excelColumn: 'Deal stage', databaseColumn: 'deal_stage', dataType: 'STRING', required: true },
      { excelColumn: 'Close date', databaseColumn: 'close_date', dataType: 'DATE', required: false },
      { excelColumn: 'Deal type', databaseColumn: 'deal_type', dataType: 'STRING', required: true },
      { excelColumn: 'SEC type', databaseColumn: 'sec_type', dataType: 'STRING', required: true },
      { excelColumn: 'Owning entity', databaseColumn: 'owning_entity_name', dataType: 'STRING', required: true },
      { excelColumn: 'Property Name', databaseColumn: 'property_name', dataType: 'STRING', required: true },
      { excelColumn: 'Street Address', databaseColumn: 'address_line_1', dataType: 'STRING', required: true },
      { excelColumn: 'City', databaseColumn: 'city', dataType: 'STRING', required: true },
      { excelColumn: 'State', databaseColumn: 'state', dataType: 'STRING', required: true },
      { excelColumn: 'Country', databaseColumn: 'country', dataType: 'STRING', required: true },
      { excelColumn: 'ZIP Code', databaseColumn: 'zip_code', dataType: 'ZIP', required: true },
    ],
    defaults: {
      organization_id: { source: 'context', key: 'organizationId' },
      offering_status: { source: 'static', value: 'Draft' },
      offering_visibility: { source: 'static', value: 'Private' },
      show_on_investbase: { source: 'static', value: false },
      auto_send_funding_instructions: { source: 'static', value: null },
      funds_required_before_gp_sign: { source: 'static', value: null },
      address_line_2: { source: 'static', value: null },
      asset_image_path: { source: 'static', value: null },
      investor_summary_html: { source: 'static', value: null },
      gallery_cover_image_url: { source: 'static', value: null },
      key_highlights_json: { source: 'static', value: null },
      deal_announcement_title: { source: 'static', value: null },
      deal_announcement_message: { source: 'static', value: null },
      internal_name: { source: 'field', key: 'deal_name' },
      offering_overview_asset_ids: { source: 'static', value: '[]' },
      offering_gallery_paths: { source: 'static', value: '[]' },
      offering_preview_token: { source: 'static', value: null },
      offering_investor_preview_json: { source: 'static', value: null },
      esign_templates_json: { source: 'static', value: null },
      investor_questionnaire_json: { source: 'static', value: null },
      funding_instructions_json: { source: 'static', value: null },
      offering_overview_class_id: { source: 'static', value: null },
      archived: { source: 'static', value: false },
      created_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['deal_name', 'deal_stage', 'deal_type', 'sec_type', 'owning_entity_name', 'property_name', 'address_line_1', 'city', 'state', 'country', 'zip_code'] },
      { rule: 'date', field: 'close_date', excelColumn: 'Close date' },
      { rule: 'zip', field: 'zip_code', excelColumn: 'ZIP Code' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Deal assets → deal_asset (dedicated ETL: dealAssetsEtlService.js)
  // Upsert key: deal_id + client_asset_id
  // ---------------------------------------------------------------------------
  DEAL_ASSETS: {
    targetTable: 'deal_asset',
    columns: [
      { excelColumn: 'client_asset_id', databaseColumn: 'client_asset_id', dataType: 'STRING', required: false },
      { excelColumn: 'property_name', databaseColumn: 'property_name', dataType: 'STRING', required: false },
      { excelColumn: 'country', databaseColumn: 'country', dataType: 'STRING', required: false },
      { excelColumn: 'street_address_1', databaseColumn: 'street_address_1', dataType: 'STRING', required: false },
      { excelColumn: 'street_address_2', databaseColumn: 'street_address_2', dataType: 'STRING', required: false },
      { excelColumn: 'city', databaseColumn: 'city', dataType: 'STRING', required: false },
      { excelColumn: 'state', databaseColumn: 'state', dataType: 'STRING', required: false },
      { excelColumn: 'zip_code', databaseColumn: 'zip_code', dataType: 'STRING', required: true },
      { excelColumn: 'address_display', databaseColumn: 'address_display', dataType: 'STRING', required: false },
      { excelColumn: 'asset_type', databaseColumn: 'asset_type', dataType: 'STRING', required: false },
      { excelColumn: 'image_count', databaseColumn: 'image_count', dataType: 'INTEGER', required: false },
      { excelColumn: 'Asset type', databaseColumn: 'attr_asset_type', dataType: 'STRING', required: false },
      { excelColumn: 'Property class', databaseColumn: 'attr_property_class', dataType: 'STRING', required: false },
      { excelColumn: 'Number of units', databaseColumn: 'attr_num_units', dataType: 'STRING', required: false },
      { excelColumn: 'Net asset value', databaseColumn: 'attr_nav', dataType: 'STRING', required: false },
      { excelColumn: 'Acquisition price', databaseColumn: 'attr_acq_price', dataType: 'STRING', required: false },
      { excelColumn: 'Acquisition date', databaseColumn: 'attr_acq_date', dataType: 'DATE', required: false },
      { excelColumn: 'Exit price', databaseColumn: 'attr_exit_price', dataType: 'STRING', required: false },
      { excelColumn: 'Exit date', databaseColumn: 'attr_exit_date', dataType: 'DATE', required: false },
      { excelColumn: 'Year built', databaseColumn: 'attr_year_built', dataType: 'STRING', required: false },
      { excelColumn: 'Year renovated', databaseColumn: 'attr_year_reno', dataType: 'STRING', required: false },
      { excelColumn: 'attr_rows_json', databaseColumn: 'attr_rows_json', dataType: 'STRING', required: false },
      { excelColumn: 'additional_info_json', databaseColumn: 'additional_info_json', dataType: 'STRING', required: false },
      { excelColumn: 'image_preview_urls_json', databaseColumn: 'image_preview_urls_json', dataType: 'STRING', required: false },
      { excelColumn: 'archived', databaseColumn: 'archived', dataType: 'BOOLEAN', required: false },
      { excelColumn: 'sort_order', databaseColumn: 'sort_order', dataType: 'INTEGER', required: false },
    ],
    defaults: {
      deal_id: { source: 'context', key: 'dealId', force: true },
      archived: { source: 'static', value: false },
      image_preview_urls_json: { source: 'static', value: '[]' },
    },
    validations: [
      { rule: 'required', fields: ['deal_id', 'zip_code'] },
    ],
    targetTable: 'add_deal_form',
    columns: [
      { excelColumn: '', databaseColumn: 'deal_id', dataType: 'STRING', required: true },
      { excelColumn: '', databaseColumn: 'asset_image_path', dataType: 'STRING', required: false },
      { excelColumn: '', databaseColumn: 'gallery_cover_image_url', dataType: 'STRING', required: false },
      { excelColumn: '', databaseColumn: 'offering_gallery_paths', dataType: 'STRING', required: false },
      { excelColumn: '', databaseColumn: 'offering_overview_asset_ids', dataType: 'STRING', required: false },
    ],
    defaults: {
      updated_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['deal_id'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // companies
  // ---------------------------------------------------------------------------
  COMPANIES_UPLOAD: {
    targetTable: 'companies',
    columns: [
      { excelColumn: 'Company Name', databaseColumn: 'name', dataType: 'STRING', required: true },
      { excelColumn: 'Status', databaseColumn: 'status', dataType: 'STRING', required: false },
    ],
    defaults: {
      status: { source: 'static', value: 'active' },
      created_at: { source: 'timestamp' },
      updated_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['name'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // deals
  // ---------------------------------------------------------------------------
  DEALS_UPLOAD: {
    targetTable: 'deals',
    columns: [
      { excelColumn: 'Company ID', databaseColumn: 'company_id', dataType: 'STRING', required: true },
    ],
    defaults: {
      created_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['company_id'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // users / company members
  // ---------------------------------------------------------------------------
  USERS_UPLOAD: {
    targetTable: 'users',
    columns: [
      { excelColumn: 'email', databaseColumn: 'email', dataType: 'EMAIL', required: true },
      { excelColumn: 'Username', databaseColumn: 'username', dataType: 'STRING', required: false },
      { excelColumn: 'first_name', databaseColumn: 'first_name', dataType: 'STRING', required: true },
      { excelColumn: 'last_name', databaseColumn: 'last_name', dataType: 'STRING', required: true },
      { excelColumn: 'phone', databaseColumn: 'phone', dataType: 'STRING', required: false },
      { excelColumn: 'role', databaseColumn: 'role', dataType: 'STRING', required: false },
      { excelColumn: 'user_status', databaseColumn: 'user_status', dataType: 'STRING', required: false },
      { excelColumn: 'user_signup_completed', databaseColumn: 'user_signup_completed', dataType: 'STRING', required: false },
      { excelColumn: 'Invite Expires At', databaseColumn: 'invite_expires_at', dataType: 'DATE', required: false },
    ],
    defaults: {
      organization_id: { source: 'context', key: 'organizationId' },
      username: { source: 'invitedUsername' },
      role: { source: 'static', value: 'platform_user' },
      user_status: { source: 'static', value: 'active' },
      user_signup_completed: { source: 'static', value: 'true' },
      phone: { source: 'static', value: '' },
      invite_expires_at: { source: 'static', value: '2026-08-15' },
      created_at: { source: 'timestamp' },
      updated_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['email', 'first_name', 'last_name'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // contact
  // ---------------------------------------------------------------------------
  CONTACT_UPLOAD: {
    targetTable: 'contact',
    columns: [
      { excelColumn: 'full_name', databaseColumn: 'full_name', dataType: 'STRING', required: false },
      { excelColumn: 'first_name', databaseColumn: 'first_name', dataType: 'STRING', required: false },
      { excelColumn: 'last_name', databaseColumn: 'last_name', dataType: 'STRING', required: false },
      { excelColumn: 'email', databaseColumn: 'email', dataType: 'EMAIL', required: true },
      { excelColumn: 'phone', databaseColumn: 'phone', dataType: 'STRING', required: false },
      { excelColumn: 'note', databaseColumn: 'note', dataType: 'STRING', required: false },
      { excelColumn: 'tags', databaseColumn: 'tags', dataType: 'STRING', required: false },
      { excelColumn: 'lists', databaseColumn: 'lists', dataType: 'STRING', required: false },
      { excelColumn: 'owners', databaseColumn: 'owners', dataType: 'STRING', required: false },
      { excelColumn: 'status', databaseColumn: 'status', dataType: 'STRING', required: false },
      {
        excelColumn: 'show_offerings_visibility',
        databaseColumn: 'show_offerings_visibility',
        dataType: 'STRING',
        required: false,
      },
      {
        excelColumn: 'accreditation_status',
        databaseColumn: 'accreditation_status',
        dataType: 'STRING',
        required: false,
      },
      {
        excelColumn: 'known_since',
        databaseColumn: 'known_since',
        dataType: 'DATE',
        required: false,
      },
      { excelColumn: 'is_portal_user', databaseColumn: 'is_portal_user', dataType: 'BOOLEAN', required: false },
      { excelColumn: 'platform_admin_only', databaseColumn: 'platform_admin_only', dataType: 'BOOLEAN', required: false },
      { excelColumn: 'last_edit_reason', databaseColumn: 'last_edit_reason', dataType: 'STRING', required: false },
    ],
    defaults: {
      organization_id: { source: 'context', key: 'organizationId', force: true },
      phone: { source: 'static', value: '' },
      note: { source: 'static', value: '' },
      tags: { source: 'static', value: '[]' },
      lists: { source: 'static', value: '[]' },
      owners: { source: 'static', value: '[]' },
      status: { source: 'static', value: 'active' },
      show_offerings_visibility: { source: 'static', value: 'ALL_OFFERINGS' },
      is_portal_user: { source: 'static', value: false },
      platform_admin_only: { source: 'static', value: false },
      created_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['email'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // deal_investor_class
  // ---------------------------------------------------------------------------
  DEAL_INVESTOR_CLASS_UPLOAD: {
    targetTable: 'deal_investor_class',
    columns: [
      { excelColumn: 'Deal ID', databaseColumn: 'deal_id', dataType: 'STRING', required: true },
      { excelColumn: 'Class Name', databaseColumn: 'name', dataType: 'STRING', required: true },
      { excelColumn: 'Subscription Type', databaseColumn: 'subscription_type', dataType: 'STRING', required: false },
      { excelColumn: 'Entity Name', databaseColumn: 'entity_name', dataType: 'STRING', required: false },
      { excelColumn: 'Start Date', databaseColumn: 'start_date', dataType: 'STRING', required: false },
      { excelColumn: 'Offering Size', databaseColumn: 'offering_size', dataType: 'STRING', required: false },
      { excelColumn: 'Raise Amount Distributions', databaseColumn: 'raise_amount_distributions', dataType: 'STRING', required: false },
      { excelColumn: 'Billing Raise Quota', databaseColumn: 'billing_raise_quota', dataType: 'STRING', required: false },
      { excelColumn: 'Minimum Investment', databaseColumn: 'minimum_investment', dataType: 'STRING', required: false },
      { excelColumn: 'Number Of Units', databaseColumn: 'number_of_units', dataType: 'STRING', required: false },
      { excelColumn: 'Price Per Unit', databaseColumn: 'price_per_unit', dataType: 'STRING', required: false },
      { excelColumn: 'Status', databaseColumn: 'status', dataType: 'STRING', required: false },
      { excelColumn: 'Visibility', databaseColumn: 'visibility', dataType: 'STRING', required: false },
      { excelColumn: 'Advanced Options JSON', databaseColumn: 'advanced_options_json', dataType: 'STRING', required: false },
    ],
    defaults: {
      subscription_type: { source: 'static', value: '' },
      entity_name: { source: 'static', value: '' },
      start_date: { source: 'static', value: '' },
      offering_size: { source: 'static', value: '' },
      raise_amount_distributions: { source: 'static', value: '' },
      billing_raise_quota: { source: 'static', value: '' },
      minimum_investment: { source: 'static', value: '' },
      number_of_units: { source: 'static', value: '' },
      price_per_unit: { source: 'static', value: '' },
      status: { source: 'static', value: 'draft' },
      visibility: { source: 'static', value: '' },
      advanced_options_json: { source: 'static', value: '{}' },
      created_at: { source: 'timestamp' },
      updated_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['deal_id', 'name'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // Deal classes (dedicated ETL: dealClassesEtlService.js)
  // Template: ETL_Class_Mapping_Template_v2.xlsx — Classes / Hurdles / Final Tier
  // ---------------------------------------------------------------------------
  DEAL_CLASSES: {
    targetTable: 'deal_investor_class',
    columns: [
      { excelColumn: 'name', databaseColumn: 'name', dataType: 'STRING', required: true },
      { excelColumn: 'subscription_type', databaseColumn: 'subscription_type', dataType: 'STRING', required: false },
      { excelColumn: 'status', databaseColumn: 'status', dataType: 'STRING', required: false },
      { excelColumn: 'entity_name', databaseColumn: 'entity_name', dataType: 'STRING', required: false },
      { excelColumn: 'start_date', databaseColumn: 'start_date', dataType: 'DATE', required: false },
      { excelColumn: 'offering_size', databaseColumn: 'offering_size', dataType: 'STRING', required: false },
      { excelColumn: 'raise_amount_distributions', databaseColumn: 'raise_amount_distributions', dataType: 'STRING', required: false },
      { excelColumn: 'billing_raise_quota', databaseColumn: 'billing_raise_quota', dataType: 'STRING', required: false },
      { excelColumn: 'minimum_investment', databaseColumn: 'minimum_investment', dataType: 'STRING', required: false },
      { excelColumn: 'number_of_units', databaseColumn: 'number_of_units', dataType: 'STRING', required: false },
      { excelColumn: 'price_per_unit', databaseColumn: 'price_per_unit', dataType: 'STRING', required: false },
      { excelColumn: 'visibility', databaseColumn: 'visibility', dataType: 'STRING', required: false },
    ],
    defaults: {
      deal_id: { source: 'context', key: 'dealId', force: true },
      status: { source: 'static', value: 'draft' },
      advanced_options_json: { source: 'static', value: '{}' },
    },
    validations: [
      { rule: 'required', fields: ['deal_id', 'name'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // deal_investment
  // ---------------------------------------------------------------------------
  DEAL_INVESTMENT_UPLOAD: {
    targetTable: 'deal_investment',
    columns: [
      { excelColumn: 'Deal ID', databaseColumn: 'deal_id', dataType: 'STRING', required: true },
      { excelColumn: 'Offering ID', databaseColumn: 'offering_id', dataType: 'STRING', required: false },
      { excelColumn: 'Contact ID', databaseColumn: 'contact_id', dataType: 'STRING', required: false },
      { excelColumn: 'Contact Display Name', databaseColumn: 'contact_display_name', dataType: 'STRING', required: false },
      { excelColumn: 'Profile ID', databaseColumn: 'profile_id', dataType: 'STRING', required: false },
      { excelColumn: 'User Investor Profile ID', databaseColumn: 'user_investor_profile_id', dataType: 'STRING', required: false },
      { excelColumn: 'Investor Role', databaseColumn: 'investor_role', dataType: 'STRING', required: false },
      { excelColumn: 'Fund Approved', databaseColumn: 'fund_approved', dataType: 'BOOLEAN', required: false },
      { excelColumn: 'Fund Approved By', databaseColumn: 'fund_approved_by', dataType: 'STRING', required: false },
      { excelColumn: 'Fund Approved At', databaseColumn: 'fund_approved_at', dataType: 'DATE', required: false },
      { excelColumn: 'Fund Approved Commitment Snapshot', databaseColumn: 'fund_approved_commitment_snapshot', dataType: 'STRING', required: false },
      { excelColumn: 'Status', databaseColumn: 'status', dataType: 'STRING', required: false },
      { excelColumn: 'Investor Class', databaseColumn: 'investor_class', dataType: 'STRING', required: false },
      { excelColumn: 'Doc Signed Date', databaseColumn: 'doc_signed_date', dataType: 'STRING', required: false },
      { excelColumn: 'Esign Status JSON', databaseColumn: 'esign_status_json', dataType: 'STRING', required: false },
      { excelColumn: 'Investor Questionnaire Answers JSON', databaseColumn: 'investor_questionnaire_answers_json', dataType: 'STRING', required: false },
      { excelColumn: 'Investor W9 Form JSON', databaseColumn: 'investor_w9_form_json', dataType: 'STRING', required: false },
      { excelColumn: 'Funding Method', databaseColumn: 'funding_method', dataType: 'STRING', required: false },
      { excelColumn: 'Commitment Amount', databaseColumn: 'commitment_amount', dataType: 'STRING', required: false },
      { excelColumn: 'Extra Contribution Amounts', databaseColumn: 'extra_contribution_amounts', dataType: 'STRING', required: false },
      { excelColumn: 'Document Storage Path', databaseColumn: 'document_storage_path', dataType: 'STRING', required: false },
    ],
    defaults: {
      offering_id: { source: 'static', value: '' },
      contact_id: { source: 'static', value: '' },
      contact_display_name: { source: 'static', value: '' },
      profile_id: { source: 'static', value: '' },
      investor_role: { source: 'static', value: '' },
      fund_approved: { source: 'static', value: false },
      fund_approved_commitment_snapshot: { source: 'static', value: '' },
      status: { source: 'static', value: '' },
      investor_class: { source: 'static', value: '' },
      funding_method: { source: 'static', value: '' },
      commitment_amount: { source: 'static', value: '' },
      extra_contribution_amounts: { source: 'static', value: '[]' },
      created_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['deal_id'] },
      { rule: 'date', field: 'fund_approved_at', excelColumn: 'Fund Approved At' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Distribution Setup waterfalls (dedicated ETL) — deal resolved from Excel
  // ---------------------------------------------------------------------------
  DEAL_DISTRIBUTION_SETUP: {
    targetTable: 'add_deal_form',
    columns: [
      { excelColumn: 'deal_name', databaseColumn: 'deal_name', dataType: 'STRING', required: false },
      { excelColumn: 'kind', databaseColumn: 'kind', dataType: 'STRING', required: false },
      { excelColumn: 'pay_to_class_name', databaseColumn: 'pay_to_class_name', dataType: 'STRING', required: false },
    ],
    defaults: {},
    validations: [],
  },

  // ---------------------------------------------------------------------------
  // Full Cash Flow investors (Profiles book then Add Investor) — dual Excel
  // ---------------------------------------------------------------------------
  CASHFLOW_INVESTORS: {
    targetTable: 'deal_lp_investor',
    columns: [
      { excelColumn: 'source_profile_id', databaseColumn: 'source_profile_id', dataType: 'STRING', required: false },
      { excelColumn: 'contact_email', databaseColumn: 'email', dataType: 'EMAIL', required: false },
      { excelColumn: 'investor_class_name', databaseColumn: 'investor_class', dataType: 'STRING', required: false },
      { excelColumn: 'profile_id', databaseColumn: 'profile_id', dataType: 'STRING', required: false },
    ],
    defaults: {
      organization_id: { source: 'context', key: 'organizationId' },
      deal_id: { source: 'context', key: 'dealId', force: true },
    },
    validations: [
      { rule: 'required', fields: ['deal_id'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // Investor profiles (dedicated ETL)
  // ---------------------------------------------------------------------------
  INVESTOR_PROFILES: {
    targetTable: 'user_investor_profiles',
    columns: [
      { excelColumn: 'source_profile_id', databaseColumn: 'source_profile_id', dataType: 'STRING', required: true },
      { excelColumn: 'user_email', databaseColumn: 'user_email', dataType: 'EMAIL', required: true },
      { excelColumn: 'profile_name', databaseColumn: 'profile_name', dataType: 'STRING', required: false },
      { excelColumn: 'profile_type', databaseColumn: 'profile_type', dataType: 'STRING', required: false },
    ],
    defaults: {
      organization_id: { source: 'context', key: 'organizationId' },
      deal_id: { source: 'context', key: 'dealId', force: true },
    },
    validations: [
      { rule: 'required', fields: ['source_profile_id', 'deal_id'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // Deal investors roster + investments (dedicated ETL)
  // ---------------------------------------------------------------------------
  DEAL_INVESTORS: {
    targetTable: 'deal_lp_investor',
    columns: [
      { excelColumn: 'contact_email', databaseColumn: 'email', dataType: 'EMAIL', required: false },
      { excelColumn: 'investor_class_name', databaseColumn: 'investor_class', dataType: 'STRING', required: true },
      { excelColumn: 'profile_id', databaseColumn: 'profile_id', dataType: 'STRING', required: false },
    ],
    defaults: {
      deal_id: { source: 'context', key: 'dealId', force: true },
    },
    validations: [
      { rule: 'required', fields: ['deal_id'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // deal_lp_investor
  // ---------------------------------------------------------------------------
  INVESTOR_UPLOAD: {
    targetTable: 'deal_lp_investor',
    columns: [
      { excelColumn: 'Contact Member ID', databaseColumn: 'contact_member_id', dataType: 'STRING', required: true },
      { excelColumn: 'Email', databaseColumn: 'email', dataType: 'EMAIL', required: false },
      { excelColumn: 'Role', databaseColumn: 'role', dataType: 'STRING', required: false },
      { excelColumn: 'Profile ID', databaseColumn: 'profile_id', dataType: 'STRING', required: false },
      { excelColumn: 'User Investor Profile ID', databaseColumn: 'user_investor_profile_id', dataType: 'STRING', required: false },
      { excelColumn: 'Investor Class', databaseColumn: 'investor_class', dataType: 'STRING', required: false },
      { excelColumn: 'Send Invitation Mail', databaseColumn: 'send_invitation_mail', dataType: 'STRING', required: false },
      { excelColumn: 'Committed Amount', databaseColumn: 'committed_amount', dataType: 'DECIMAL', required: true },
      { excelColumn: 'Doc Signed Date', databaseColumn: 'doc_signed_date', dataType: 'STRING', required: false },
      { excelColumn: 'Esign Status JSON', databaseColumn: 'esign_status_json', dataType: 'STRING', required: false },
    ],
    defaults: {
      deal_id: { source: 'context', key: 'dealId', force: true },
      added_by: { source: 'context', key: 'createdBy' },
      role: { source: 'static', value: 'LP' },
      profile_id: { source: 'static', value: '' },
      investor_class: { source: 'static', value: 'Class A' },
      send_invitation_mail: { source: 'static', value: 'no' },
      committed_amount: { source: 'static', value: '' },
      created_at: { source: 'timestamp' },
      updated_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['deal_id', 'contact_member_id', 'committed_amount'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // deal_member
  // ---------------------------------------------------------------------------
  MEMBERS_UPLOAD: {
    targetTable: 'deal_member',
    columns: [
      { excelColumn: 'email', databaseColumn: 'email', dataType: 'EMAIL', required: true },
      { excelColumn: 'deal_member_role', databaseColumn: 'deal_member_role', dataType: 'STRING', required: true },
      { excelColumn: 'send_invitation_mail', databaseColumn: 'send_invitation_mail', dataType: 'STRING', required: false },
      { excelColumn: 'deal_member_name', databaseColumn: 'deal_member_name', dataType: 'STRING', required: false },
      { excelColumn: 'deal_member_sponsor_name', databaseColumn: 'deal_member_sponsor_name', dataType: 'STRING', required: false },
      { excelColumn: 'deal_member_sponsor_type', databaseColumn: 'deal_member_sponsor_type', dataType: 'STRING', required: false },
    ],
    defaults: {
      deal_id: { source: 'context', key: 'dealId', force: true },
      added_by: { source: 'context', key: 'createdBy' },
      send_invitation_mail: { source: 'static', value: 'no' },
      created_at: { source: 'timestamp' },
      updated_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['deal_id', 'email', 'deal_member_role'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // organization_contact_tag
  // ---------------------------------------------------------------------------
  ORGANIZATION_CONTACT_TAG_UPLOAD: {
    targetTable: 'organization_contact_tag',
    columns: [
      { excelColumn: 'Tag Name', databaseColumn: 'name', dataType: 'STRING', required: true },
    ],
    defaults: {
      organization_id: { source: 'context', key: 'organizationId' },
      created_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['name'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // organization_contact_list
  // ---------------------------------------------------------------------------
  ORGANIZATION_CONTACT_LIST_UPLOAD: {
    targetTable: 'organization_contact_list',
    columns: [
      { excelColumn: 'List Name', databaseColumn: 'name', dataType: 'STRING', required: true },
    ],
    defaults: {
      organization_id: { source: 'context', key: 'organizationId' },
      created_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['name'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // user_auth_tokens
  // ---------------------------------------------------------------------------
  USER_AUTH_TOKENS_UPLOAD: {
    targetTable: 'user_auth_tokens',
    columns: [
      { excelColumn: 'User ID', databaseColumn: 'user_id', dataType: 'STRING', required: true },
      { excelColumn: 'Token Type', databaseColumn: 'token_type', dataType: 'STRING', required: true },
      { excelColumn: 'Token Hash', databaseColumn: 'token_hash', dataType: 'STRING', required: true },
      { excelColumn: 'Expires At', databaseColumn: 'expires_at', dataType: 'DATE', required: true },
      { excelColumn: 'Revoked At', databaseColumn: 'revoked_at', dataType: 'DATE', required: false },
      { excelColumn: 'Replaced By ID', databaseColumn: 'replaced_by_id', dataType: 'STRING', required: false },
      { excelColumn: 'Portal Session ID', databaseColumn: 'portal_session_id', dataType: 'STRING', required: false },
      { excelColumn: 'User Agent', databaseColumn: 'user_agent', dataType: 'STRING', required: false },
      { excelColumn: 'Client IP', databaseColumn: 'client_ip', dataType: 'STRING', required: false },
    ],
    defaults: {
      created_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['user_id', 'token_type', 'token_hash', 'expires_at'] },
      { rule: 'date', field: 'expires_at', excelColumn: 'Expires At' },
      { rule: 'date', field: 'revoked_at', excelColumn: 'Revoked At' },
    ],
  },

  // ---------------------------------------------------------------------------
  // user_beneficiaries
  // ---------------------------------------------------------------------------
  USER_BENEFICIARIES_UPLOAD: {
    targetTable: 'user_beneficiaries',
    columns: [
      { excelColumn: 'User ID', databaseColumn: 'user_id', dataType: 'STRING', required: true },
      { excelColumn: 'Full Name', databaseColumn: 'full_name', dataType: 'STRING', required: false },
      { excelColumn: 'Relationship', databaseColumn: 'relationship', dataType: 'STRING', required: false },
      { excelColumn: 'Tax ID', databaseColumn: 'tax_id', dataType: 'STRING', required: false },
      { excelColumn: 'Phone', databaseColumn: 'phone', dataType: 'STRING', required: false },
      { excelColumn: 'Email', databaseColumn: 'email', dataType: 'EMAIL', required: false },
      { excelColumn: 'Address Query', databaseColumn: 'address_query', dataType: 'STRING', required: false },
      { excelColumn: 'Archived', databaseColumn: 'archived', dataType: 'BOOLEAN', required: false },
    ],
    defaults: {
      full_name: { source: 'static', value: '' },
      relationship: { source: 'static', value: '' },
      tax_id: { source: 'static', value: '' },
      phone: { source: 'static', value: '' },
      email: { source: 'static', value: '' },
      address_query: { source: 'static', value: '' },
      archived: { source: 'static', value: false },
      created_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['user_id'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // user_investor_profiles
  // ---------------------------------------------------------------------------
  USER_INVESTOR_PROFILES_UPLOAD: {
    targetTable: 'user_investor_profiles',
    columns: [
      { excelColumn: 'User ID', databaseColumn: 'user_id', dataType: 'STRING', required: true },
      { excelColumn: 'Profile Name', databaseColumn: 'profile_name', dataType: 'STRING', required: true },
      { excelColumn: 'Profile Type', databaseColumn: 'profile_type', dataType: 'STRING', required: false },
      { excelColumn: 'Added By', databaseColumn: 'added_by', dataType: 'STRING', required: false },
      { excelColumn: 'Investments Count', databaseColumn: 'investments_count', dataType: 'INTEGER', required: false },
      { excelColumn: 'Archived', databaseColumn: 'archived', dataType: 'BOOLEAN', required: false },
      { excelColumn: 'Is Draft', databaseColumn: 'is_draft', dataType: 'BOOLEAN', required: false },
      { excelColumn: 'Last Edit Reason', databaseColumn: 'last_edit_reason', dataType: 'STRING', required: false },
      { excelColumn: 'Form Snapshot', databaseColumn: 'form_snapshot', dataType: 'STRING', required: false },
      { excelColumn: 'Distribution Method', databaseColumn: 'distribution_method', dataType: 'STRING', required: false },
      { excelColumn: 'ACH Routing Number', databaseColumn: 'ach_routing_number', dataType: 'STRING', required: false },
      { excelColumn: 'ACH Account Number', databaseColumn: 'ach_account_number', dataType: 'STRING', required: false },
      { excelColumn: 'ACH Bank Address', databaseColumn: 'ach_bank_address', dataType: 'STRING', required: false },
      { excelColumn: 'ACH Bank Name', databaseColumn: 'ach_bank_name', dataType: 'STRING', required: false },
      { excelColumn: 'ACH Bank Account Type', databaseColumn: 'ach_bank_account_type', dataType: 'STRING', required: false },
      { excelColumn: 'Bank Account Query', databaseColumn: 'bank_account_query', dataType: 'STRING', required: false },
      { excelColumn: 'Check Payee Name', databaseColumn: 'check_payee_name', dataType: 'STRING', required: false },
      { excelColumn: 'Check Mailing Address ID', databaseColumn: 'check_mailing_address_id', dataType: 'STRING', required: false },
    ],
    defaults: {
      profile_type: { source: 'static', value: '' },
      added_by: { source: 'static', value: '' },
      investments_count: { source: 'static', value: 0 },
      archived: { source: 'static', value: false },
      is_draft: { source: 'static', value: false },
      distribution_method: { source: 'static', value: '' },
      ach_routing_number: { source: 'static', value: '' },
      ach_account_number: { source: 'static', value: '' },
      ach_bank_address: { source: 'static', value: '' },
      ach_bank_name: { source: 'static', value: '' },
      ach_bank_account_type: { source: 'static', value: '' },
      bank_account_query: { source: 'static', value: '' },
      check_payee_name: { source: 'static', value: '' },
      created_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['user_id', 'profile_name'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // user_saved_addresses
  // ---------------------------------------------------------------------------
  USER_SAVED_ADDRESSES_UPLOAD: {
    targetTable: 'user_saved_addresses',
    columns: [
      { excelColumn: 'User ID', databaseColumn: 'user_id', dataType: 'STRING', required: true },
      { excelColumn: 'Full Name Or Company', databaseColumn: 'full_name_or_company', dataType: 'STRING', required: false },
      { excelColumn: 'Country', databaseColumn: 'country', dataType: 'STRING', required: false },
      { excelColumn: 'Street 1', databaseColumn: 'street1', dataType: 'STRING', required: false },
      { excelColumn: 'Street 2', databaseColumn: 'street2', dataType: 'STRING', required: false },
      { excelColumn: 'City', databaseColumn: 'city', dataType: 'STRING', required: false },
      { excelColumn: 'State', databaseColumn: 'state', dataType: 'STRING', required: false },
      { excelColumn: 'ZIP', databaseColumn: 'zip', dataType: 'ZIP', required: false },
      { excelColumn: 'Check Memo', databaseColumn: 'check_memo', dataType: 'STRING', required: false },
      { excelColumn: 'Distribution Note', databaseColumn: 'distribution_note', dataType: 'STRING', required: false },
      { excelColumn: 'Archived', databaseColumn: 'archived', dataType: 'BOOLEAN', required: false },
    ],
    defaults: {
      full_name_or_company: { source: 'static', value: '' },
      country: { source: 'static', value: '' },
      street1: { source: 'static', value: '' },
      street2: { source: 'static', value: '' },
      city: { source: 'static', value: '' },
      state: { source: 'static', value: '' },
      zip: { source: 'static', value: '' },
      check_memo: { source: 'static', value: '' },
      distribution_note: { source: 'static', value: '' },
      archived: { source: 'static', value: false },
      created_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['user_id'] },
      { rule: 'zip', field: 'zip', excelColumn: 'ZIP' },
    ],
  },

  // ---------------------------------------------------------------------------
  // user_portal_sessions
  // ---------------------------------------------------------------------------
  USER_PORTAL_SESSIONS_UPLOAD: {
    targetTable: 'user_portal_sessions',
    columns: [
      { excelColumn: 'User ID', databaseColumn: 'user_id', dataType: 'STRING', required: true },
      { excelColumn: 'Login At', databaseColumn: 'login_at', dataType: 'DATE', required: false },
      { excelColumn: 'Logout At', databaseColumn: 'logout_at', dataType: 'DATE', required: false },
    ],
    defaults: {
      login_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['user_id'] },
      { rule: 'date', field: 'login_at', excelColumn: 'Login At' },
      { rule: 'date', field: 'logout_at', excelColumn: 'Logout At' },
    ],
  },

  // ---------------------------------------------------------------------------
  // user_page_navigations
  // ---------------------------------------------------------------------------
  USER_PAGE_NAVIGATIONS_UPLOAD: {
    targetTable: 'user_page_navigations',
    columns: [
      { excelColumn: 'User ID', databaseColumn: 'user_id', dataType: 'STRING', required: true },
      { excelColumn: 'Session ID', databaseColumn: 'session_id', dataType: 'STRING', required: true },
      { excelColumn: 'Page Path', databaseColumn: 'page_path', dataType: 'STRING', required: true },
      { excelColumn: 'Page Label', databaseColumn: 'page_label', dataType: 'STRING', required: false },
      { excelColumn: 'Visit Count', databaseColumn: 'visit_count', dataType: 'INTEGER', required: false },
    ],
    defaults: {
      page_label: { source: 'static', value: '' },
      visit_count: { source: 'static', value: 1 },
      updated_at: { source: 'timestamp' },
    },
    validations: [
      { rule: 'required', fields: ['user_id', 'session_id', 'page_path'] },
    ],
  },
}

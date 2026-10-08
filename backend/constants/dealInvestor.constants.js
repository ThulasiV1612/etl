/**

 * ETL_Add_Investor_Mapping_Template.xlsx / Add_Investor_Mapping.xlsx

 * Sheets: Add Investors → deal_lp_investor; Investments → deal_investment

 * Spec: etl-add-investor-mapping.mdc

 */



const DEAL_INVESTOR_SHEET_ALIASES = {

  addInvestors: ['add investors', 'add_investors', 'investors', 'roster'],

  investments: ['investments', 'investment'],

  profileTypeMap: ['profile type map', 'profile_type_map'],

}



const ADD_INVESTOR_COLUMNS = {

  deal_name: ['deal_name', 'deal name'],

  deal_id: ['deal_id', 'deal id'],

  source_profile_id: [

    'source_profile_id',

    'source profile id',

    'unique profile id',

  ],

  source_investment_id: [

    'source_investment_id',

    'source investment id',

    'unique investment id',

  ],

  contact_email: ['contact_email', 'contact email', 'email', 'user_email', 'email address'],

  contact_id: ['contact_id', 'contact id', 'contact_member_id', 'users contact id'],

  contact_display_name: [

    'contact_display_name',

    'contact display name',

    'profile_name',

    'profile name',

  ],

  first_name: ['first_name', 'first name', 'individual first name'],

  last_name: ['last_name', 'last name', 'individual last name'],

  contact_phone: [

    'contact_phone',

    'contact phone',

    'phone',

    'phone number',

    'phone_number',

  ],

  investor_name: [

    'investor_name',

    'investor name',

    'lp investor name',

  ],

  investor_class_name: [

    'investor_class_name',

    'investor class name',

    'class',

    'class_name',

    'investor_class',

  ],

  profile_id: ['profile_id', 'profile id', 'profile_type', 'profile type'],

  user_investor_profile_id: [

    'user_investor_profile_id',

    'user investor profile id',

  ],

  source_profile_key: ['source_profile_key', 'source profile key'],

  role: ['role'],

  send_invitation_mail: ['send_invitation_mail', 'send invitation mail'],

  // Not a DB column — resolve sponsor name/email → users.id → deal_lp_investor.added_by

  selected_sponsors: [
    'selected_sponsors',
    'selected sponsors',
    'selected_sponsors [Selected sponsors]',
    'Selected sponsors',
    'sponsors',
    'sponsor',
    'sponsor email',
    'sponsor emails',
  ],

  percent_of_class_ownership: [
    'percent_of_class_ownership',
    'percent of class ownership',
    'percent of class (by total raised)',
    'percent of class or bucket (by target raise)',
  ],

  percent_of_class_distributions: [
    'percent_of_class_distributions',
    'percent of class distributions',
    'percent of class or bucket (by target raise)',
    'percent of class (by total raised)',
  ],

  entity_ownership_percent: [
    'entity_ownership_percent',
    'entity ownership percent',
    'ownership percentage',
    'ownership percent',
  ],

  distribution_allocation_percent: [
    'distribution_allocation_percent',
    'distribution allocation percent',
    'ownership percentage',
    'ownership percent',
  ],

}



const INVESTMENT_COLUMNS = {

  source_investment_id: [

    'source_investment_id',

    'source investment id',

    'unique investment id',

  ],

  source_profile_id: [

    'source_profile_id',

    'source profile id',

    'unique profile id',

  ],

  deal_name: ['deal_name', 'deal name'],

  deal_id: ['deal_id', 'deal id'],

  contact_email: ['contact_email', 'contact email', 'email', 'user_email', 'email address'],

  contact_id: ['contact_id', 'contact id'],

  contact_display_name: [

    'contact_display_name',

    'contact display name',

    'profile_name',

    'profile name',

  ],

  first_name: ['first_name', 'first name', 'individual first name'],

  last_name: ['last_name', 'last name', 'individual last name'],

  contact_phone: [

    'contact_phone',

    'contact phone',

    'phone',

    'phone number',

    'phone_number',

  ],

  investor_name: [

    'investor_name',

    'investor name',

    'lp investor name',

  ],

  investor_class_name: [

    'investor_class_name',

    'investor class name',

    'class',

    'investor_class',

  ],

  profile_id: ['profile_id', 'profile id', 'profile_type', 'profile type'],

  user_investor_profile_id: [

    'user_investor_profile_id',

    'user investor profile id',

  ],

  investor_role: ['investor_role', 'investor role'],

  commitment_amount: [

    'commitment_amount',

    'commitment amount',

    'invested',

    'invested amount',

  ],

  funded_amount: ['funded_amount', 'funded amount'],

  fund_approved: ['fund_approved', 'fund approved'],

  funding_method: ['funding_method', 'funding method', 'payment method'],

  status: ['status'],

  doc_signed_date: ['doc_signed_date', 'doc signed date', 'document signed on'],

  selected_sponsors: ['selected_sponsors', 'selected sponsors', 'sponsors'],

  accreditation_status: [
    'accreditation_status',
    'accreditation status',
    'accredited status',
    'accredited',
  ],

}



const PROFILE_TYPE_MAP_COLUMNS = {

  cashFlowType: ['cash_flow_profile_type', 'cash flow profile type', 'profile type'],

  ourProfileId: ['our_profile_id', 'our profile id', 'mapped enum', 'profile_id'],

}



const PROFILE_ID_MAP = {

  individual: 'individual',

  joint: 'joint_tenancy',

  'joint tenancy': 'joint_tenancy',

  joint_tenancy: 'joint_tenancy',

  entity: 'llc_corp_trust_etc',

  llc: 'llc_corp_trust_etc',

  llc_corp_trust_etc: 'llc_corp_trust_etc',

  ira: 'custodian_ira_401k',

  '401k': 'custodian_ira_401k',

  custodian_ira_401k: 'custodian_ira_401k',

}



module.exports = {

  DEAL_INVESTOR_SHEET_ALIASES,

  ADD_INVESTOR_COLUMNS,

  INVESTMENT_COLUMNS,

  PROFILE_TYPE_MAP_COLUMNS,

  PROFILE_ID_MAP,

}



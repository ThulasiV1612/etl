/**
 * ETL_Investor_Profile_Mapping_Template.xlsx
 * Import order: Addresses → Beneficiaries (optional) → Profiles
 */

const PROFILE_SHEET_ALIASES = {
  addresses: ['addresses', 'address'],
  beneficiaries: ['beneficiaries', 'beneficiary'],
  profiles: ['profiles', 'profile'],
}

const ADDRESS_COLUMNS = {
  address_key: ['address_key', 'address key'],
  source_profile_id: ['source_profile_id', 'source profile id'],
  user_email: ['user_email', 'user email', 'email'],
  user_id: ['user_id', 'user id'],
  address_role: ['address_role', 'address role'],
  source_raw_address: ['source_raw_address', 'source raw address'],
  full_name_or_company: ['full_name_or_company', 'full name or company'],
  street1: ['street1', 'street 1', 'street'],
  street2: ['street2', 'street 2'],
  city: ['city'],
  state: ['state'],
  zip: ['zip', 'zip_code', 'zip code'],
  country: ['country'],
  check_memo: ['check_memo', 'check memo'],
  distribution_note: ['distribution_note', 'distribution note'],
  archived: ['archived'],
}

const BENEFICIARY_COLUMNS = {
  beneficiary_key: ['beneficiary_key', 'beneficiary key'],
  source_profile_id: ['source_profile_id', 'source profile id'],
  user_email: ['user_email', 'user email', 'email'],
  user_id: ['user_id', 'user id'],
  full_name: ['full_name', 'full name'],
  relationship: ['relationship'],
  tax_id: ['tax_id', 'tax id'],
  phone: ['phone'],
  email: ['email'],
  address_query: ['address_query', 'address query'],
  archived: ['archived'],
  link_to_profile: ['link_to_profile', 'link to profile'],
}

const PROFILE_COLUMNS = {
  source_profile_id: ['source_profile_id', 'source profile id', 'unique profile id'],
  source_investment_id: ['source_investment_id', 'source investment id'],
  user_email: ['user_email', 'user email', 'email'],
  user_id: ['user_id', 'user id'],
  profile_name: ['profile_name', 'profile name'],
  profile_type: ['profile_type', 'profile type'],
  added_by: ['added_by', 'added by'],
  is_draft: ['is_draft', 'is draft'],
  first_name: ['first_name', 'first name'],
  middle_name: ['middle_name', 'middle name'],
  last_name: ['last_name', 'last name'],
  email1: ['email1', 'email'],
  phone: ['phone'],
  ssn: ['ssn'],
  spouse_first_name: ['spouse_first_name', 'spouse first name'],
  spouse_last_name: ['spouse_last_name', 'spouse last name'],
  spouse_email: ['spouse_email', 'spouse email'],
  spouse_ssn: ['spouse_ssn', 'spouse ssn'],
  entity_legal_name: ['entity_legal_name', 'entity legal name'],
  entity_sub_type: ['entity_sub_type', 'entity sub type'],
  entity_ein: ['entity_ein', 'entity ein'],
  federal_tax_classification: ['federal_tax_classification', 'federal tax classification'],
  llc_tax_classification: ['llc_tax_classification', 'llc tax classification'],
  entity_disregarded: ['entity_disregarded', 'entity disregarded'],
  entity_member_count: ['entity_member_count', 'entity member count'],
  ira_account_number: ['ira_account_number', 'ira account number'],
  individual_ira_number: ['individual_ira_number', 'individual ira number'],
  custodian_ira: ['custodian_ira', 'custodian ira'],
  legal_ira_name: ['legal_ira_name', 'legal ira name'],
  ira_company: ['ira_company', 'ira company'],
  distribution_method: ['distribution_method', 'distribution method'],
  ach_bank_name: ['ach_bank_name', 'ach bank name', 'bank name'],
  ach_bank_account_type: ['ach_bank_account_type', 'ach bank account type', 'bank account type'],
  ach_routing_number: ['ach_routing_number', 'ach routing number', 'bank routing number'],
  ach_account_number: ['ach_account_number', 'ach account number', 'account number'],
  ach_bank_address: ['ach_bank_address', 'ach bank address'],
  bank_account_query: ['bank_account_query', 'bank account query'],
  check_payee_name: ['check_payee_name', 'check payee name'],
  tax_address_key: ['tax_address_key', 'tax address key'],
  mailing_address_key: ['mailing_address_key', 'mailing address key'],
  mailing_address_mode: ['mailing_address_mode', 'mailing address mode'],
  check_mailing_address_key: ['check_mailing_address_key', 'check mailing address key'],
  beneficiary_key: ['beneficiary_key', 'beneficiary key'],
  birth_date: ['birth_date', 'birth date'],
  accreditation_status: [
    'accreditation_status',
    'accreditation status',
    'accredited status',
    'accredited',
  ],
}

module.exports = {
  PROFILE_SHEET_ALIASES,
  ADDRESS_COLUMNS,
  BENEFICIARY_COLUMNS,
  PROFILE_COLUMNS,
}

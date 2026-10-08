const { getPool } = require('../dbService')

const REQUIREMENTS = {
  INVESTOR_PROFILES: {
    users: ['id', 'email', 'first_name', 'last_name'],
    contact: ['id', 'email', 'organization_id', 'accreditation_status'],
    add_deal_form: ['id', 'deal_name', 'organization_id'],
    deal_lp_investor: [
      'deal_id',
      'contact_member_id',
      'source_profile_id',
      'profile_display_name',
      'investor_name',
    ],
    user_saved_addresses: [
      'id',
      'user_id',
      'full_name_or_company',
      'country',
      'street1',
      'street2',
      'city',
      'state',
      'zip',
      'check_memo',
      'distribution_note',
      'archived',
      'client_address_key',
    ],
    user_beneficiaries: [
      'id',
      'user_id',
      'full_name',
      'relationship',
      'tax_id',
      'phone',
      'email',
      'address_query',
      'archived',
      'client_beneficiary_key',
    ],
    user_investor_profiles: [
      'id',
      'user_id',
      'profile_name',
      'profile_type',
      'added_by',
      'is_draft',
      'form_snapshot',
      'distribution_method',
      'ach_routing_number',
      'ach_account_number',
      'ach_bank_address',
      'ach_bank_name',
      'ach_bank_account_type',
      'bank_account_query',
      'check_payee_name',
      'check_mailing_address_id',
      'source_profile_id',
    ],
  },

  DEAL_INVESTORS: {
    users: ['id', 'email', 'role', 'organization_id', 'created_at'],
    contact: [
      'id',
      'email',
      'first_name',
      'last_name',
      'phone',
      'organization_id',
      'accreditation_status',
    ],
    add_deal_form: ['id', 'deal_name', 'organization_id'],
    assigning_deal_user: ['deal_id', 'user_id'],
    deal_member: ['deal_id', 'contact_member_id', 'added_by', 'created_at'],
    deal_investor_class: ['deal_id', 'name'],
    deal_lp_investor: [
      'id',
      'deal_id',
      'added_by',
      'contact_member_id',
      'email',
      'role',
      'profile_id',
      'user_investor_profile_id',
      'investor_class',
      'send_invitation_mail',
      'committed_amount',
      'investor_name',
      'percent_of_class_ownership',
      'percent_of_class_distributions',
      'entity_ownership_percent',
      'distribution_allocation_percent',
      'source_profile_id',
      'profile_display_name',
      'created_at',
      'updated_at',
    ],
    deal_investment: [
      'id',
      'deal_id',
      'contact_id',
      'contact_display_name',
      'profile_id',
      'user_investor_profile_id',
      'investor_role',
      'investor_class',
      'commitment_amount',
      'fund_approved',
      'funding_method',
      'status',
      'doc_signed_date',
      'esign_status_json',
      'investor_questionnaire_answers_json',
    ],
    user_investor_profiles: ['id', 'user_id', 'profile_name', 'source_profile_id', 'form_snapshot'],
  },

  DEAL_DISTRIBUTION_SETUP: {
    add_deal_form: ['id', 'deal_name', 'created_at', 'distribution_setup_json'],
    deal_investor_class: ['id', 'deal_id', 'name', 'subscription_type'],
  },

  DEAL_PRIOR_DISTRIBUTIONS: {
    add_deal_form: ['id', 'deal_name', 'distribution_setup_json'],
    deal_investor_class: ['id', 'deal_id', 'name'],
    deal_investment: [
      'id',
      'deal_id',
      'contact_id',
      'contact_display_name',
      'investor_class',
      'esign_status_json',
      'user_investor_profile_id',
    ],
    user_investor_profiles: ['id', 'profile_name'],
  },
}

REQUIREMENTS.CASHFLOW_INVESTORS = mergeRequirements(
  REQUIREMENTS.INVESTOR_PROFILES,
  REQUIREMENTS.DEAL_INVESTORS
)

function mergeRequirements(...items) {
  const merged = {}
  for (const item of items) {
    for (const [table, columns] of Object.entries(item || {})) {
      merged[table] = Array.from(new Set([...(merged[table] || []), ...columns]))
    }
  }
  return merged
}

function getRequirements(uploadType) {
  return REQUIREMENTS[uploadType] || null
}

async function checkMissingSchema(uploadType) {
  const required = getRequirements(uploadType)
  if (!required) return { required: {}, missingTables: [], missingColumns: [] }

  const db = await getPool()
  const tables = Object.keys(required)
  const result = await db.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [tables]
  )

  const actual = new Map()
  for (const row of result.rows) {
    const table = row.table_name
    if (!actual.has(table)) actual.set(table, new Set())
    actual.get(table).add(row.column_name)
  }

  const missingTables = []
  const missingColumns = []
  for (const [table, columns] of Object.entries(required)) {
    const tableColumns = actual.get(table)
    if (!tableColumns) {
      missingTables.push(table)
      continue
    }
    for (const column of columns) {
      if (!tableColumns.has(column)) missingColumns.push(`${table}.${column}`)
    }
  }

  return { required, missingTables, missingColumns }
}

async function assertSchemaReady(uploadType) {
  const result = await checkMissingSchema(uploadType)
  if (!result.missingTables.length && !result.missingColumns.length) return result

  const parts = []
  if (result.missingTables.length) {
    parts.push(`missing table(s): ${result.missingTables.join(', ')}`)
  }
  if (result.missingColumns.length) {
    parts.push(`missing column(s): ${result.missingColumns.join(', ')}`)
  }

  const error = new Error(
    `Missing DB schema for ${uploadType} upload: ${parts.join('; ')}. ` +
      'Run the latest DB migrations/schema update, then upload again.'
  )
  error.code = 'ETL_SCHEMA_MISSING'
  error.status = 400
  error.schemaCheck = result
  throw error
}

module.exports = {
  assertSchemaReady,
  checkMissingSchema,
  getRequirements,
}

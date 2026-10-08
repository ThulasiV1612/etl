/**
 * Resolves Excel header names to etlMappings columns when labels differ
 * (case, spaces, underscores, legacy template names).
 */

const LEGACY_COLUMN_ALIASES = {
  committed_amount: ['Investment Amount', 'investment_amount', 'Amount', 'amount'],
  contact_member_id: [
    'Investor Name',
    'Member Name',
    'investor_name',
    'member_name',
    'Contact ID',
    'Contact Member ID',
  ],
  deal_id: ['Deal Id', 'deal id', 'DealID'],
  deal_name: ['Deal Name', 'deal name', 'DealName'],
  deal_stage: ['Deal Stage', 'deal stage'],
  deal_type: ['Deal Type', 'deal type'],
  close_date: ['Close Date', 'close date', 'Closing Date'],
  sec_type: ['SEC Type', 'Sec Type', 'sec type'],
  owning_entity_name: ['Owning Entity', 'owning entity', 'Entity Name'],
  property_name: ['Property Name', 'property name'],
  address_line_1: ['Street Address', 'Address Line 1', 'address_line1', 'Address', 'street_address'],
  zip_code: ['ZIP Code', 'Zip Code', 'ZIP', 'zip', 'Postal Code', 'postal_code', 'Zip'],
  city: ['City', 'city'],
  state: ['State', 'state'],
  country: ['Country', 'country'],
  email: ['Email', 'E-mail', 'e-mail', 'Contact Email', 'Member Email'],
  username: ['Username', 'User Name', 'user_name'],
  password_hash: ['Password', 'password'],
  first_name: ['First Name', 'FirstName', 'first name'],
  last_name: ['Last Name', 'LastName', 'last name'],
  full_name: ['Full Name', 'FullName', 'full name', 'Name', 'Contact Name', 'Investor Name'],
  phone: ['Phone', 'Phone Number', 'phone_number'],
  show_offerings_visibility: [
    'Show Offerings Visibility',
    'Show Offerings',
    'show offerings',
    'show_offerings',
    'Offerings Visibility',
  ],
  accreditation_status: [
    'Accreditation Status',
    'Accreditation',
    'accreditation status',
  ],
  known_since: ['Known Since', 'known since', 'Known Since Date'],
  role: ['Role', 'role'],
  user_status: ['User Status', 'Status', 'user status'],
  user_signup_completed: ['Signup Completed', 'user signup completed'],
  invite_expires_at: ['Invite Expires At', 'Invite Expiry', 'invite_expires_at'],
  deal_member_role: [
    'Role',
    'Member Role',
    'deal member role',
    'Deal Member Role',
    'deal_member_role',
  ],
  investor_class: ['Investor Class', 'Class', 'investor class'],
  company_id: ['Company ID', 'company id', 'Organization ID', 'organization_id'],
  name: ['Company Name', 'company name', 'Name', 'Tag Name', 'List Name'],
}

function normalizeColumnKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function addCandidateKey(candidates, value) {
  const key = normalizeColumnKey(value)
  if (key) candidates.add(key)
}

function getMappingCandidateKeys(mapping) {
  const candidates = new Set()
  const excelColumn = mapping.excel_column_name || mapping.excelColumn || ''
  const databaseColumn = mapping.database_column_name || mapping.databaseColumn || ''

  addCandidateKey(candidates, excelColumn)
  addCandidateKey(candidates, databaseColumn)

  if (databaseColumn) {
    addCandidateKey(candidates, databaseColumn.replace(/_/g, ' '))
    addCandidateKey(candidates, databaseColumn.replace(/_/g, ''))
  }

  if (excelColumn) {
    addCandidateKey(candidates, excelColumn.replace(/\s+/g, '_'))
    addCandidateKey(candidates, excelColumn.replace(/\s+/g, ''))
  }

  const legacyAliases = LEGACY_COLUMN_ALIASES[databaseColumn] || []
  for (const alias of legacyAliases) {
    addCandidateKey(candidates, alias)
  }

  candidates.delete('')
  return candidates
}

function resolveMappingsForHeaders(headers, mappings) {
  const headerEntries = headers.map((header) => ({
    original: header,
    normalized: normalizeColumnKey(header),
  }))

  const usedHeaders = new Set()

  return mappings.map((mapping) => {
    const candidateKeys = getMappingCandidateKeys(mapping)
    let resolvedHeader = null

    for (const entry of headerEntries) {
      if (usedHeaders.has(entry.original)) continue
      if (candidateKeys.has(entry.normalized)) {
        resolvedHeader = entry.original
        break
      }
    }

    if (resolvedHeader) {
      usedHeaders.add(resolvedHeader)
    }

    return {
      ...mapping,
      resolved_excel_header: resolvedHeader,
      is_resolved: Boolean(resolvedHeader),
    }
  })
}

function getMissingRequiredMappings(resolvedMappings) {
  return resolvedMappings
    .filter((mapping) => mapping.required_flag && !mapping.resolved_excel_header)
    .map((mapping) => {
      const expected = mapping.excel_column_name || mapping.database_column_name
      return `${expected} (${mapping.database_column_name})`
    })
}

function getResolvedColumnPairs(resolvedMappings) {
  return resolvedMappings
    .filter((mapping) => mapping.resolved_excel_header)
    .map((mapping) => ({
      excelHeader: mapping.resolved_excel_header,
      databaseColumn: mapping.database_column_name,
      configuredExcelColumn: mapping.excel_column_name,
    }))
}

module.exports = {
  normalizeColumnKey,
  resolveMappingsForHeaders,
  getMissingRequiredMappings,
  getResolvedColumnPairs,
  getMappingCandidateKeys,
}

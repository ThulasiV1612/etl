/**
 * Deal field constants used by Deal Creation ETL.
 *
 * Excel can contain either:
 * - the KEY   (example: capital_raising)
 * - the LABEL (example: Raising capital)
 *
 * Mapping always stores the KEY in the database.
 */

const dealType = {
  direct_syndication: 'Direct syndication (most common)',
  fund: 'Fund',
  exchange_1031: '1031 exchange',
  direct_syndication_1031: 'Direct syndication with 1031 exchange',
  'JV (Joint Venture)': 'JV (Joint Venture)',
}

const dealStageAliases = {
  Draft: 'Draft',
  capital_raising: 'Raising capital',
  managing_asset: 'Asset managing',
  liquidated: 'Liquidated',
}

const secAliases = {
  '506_b': '506(b)',
  '506_c': '506(c)',
  joint_venture: 'Joint venture',
}

/**
 * Extra Excel variants that should also resolve to the same key.
 * Keep these separate so the main constant maps stay clean.
 */
const dealFieldExtraAliases = {
  deal_type: {
    'direct syndication': 'direct_syndication',
    'direct syndication (most common)': 'direct_syndication',
    syndication: 'direct_syndication',
    '1031': 'exchange_1031',
    '1031 exchange': 'exchange_1031',
    jv: 'JV (Joint Venture)',
    'joint venture': 'JV (Joint Venture)',
  },
  deal_stage: {
    draft: 'Draft',
    'raising capital': 'capital_raising',
    raising_capital: 'capital_raising',
    'capital raising': 'capital_raising',
    'asset managing': 'managing_asset',
    asset_managing: 'managing_asset',
    'managing asset': 'managing_asset',
    active: 'managing_asset',
  },
  sec_type: {
    '506(b)': '506_b',
    '506b': '506_b',
    '506(c)': '506_c',
    '506c': '506_c',
    '506 ©': '506_c',
    '506©': '506_c',
    '506 (©)': '506_c',
    jv: 'joint_venture',
    'joint venture': 'joint_venture',
  },
}

function normalizeLookupValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    // Excel often stores 506(c) as "506 ©" (copyright symbol)
    .replace(/[©ⓒ]/g, 'c')
    .replace(/[()]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildLabelToKeyMap(labelByKey, extraAliases = {}) {
  const labelToKey = {}

  for (const [key, label] of Object.entries(labelByKey)) {
    labelToKey[normalizeLookupValue(key)] = key
    labelToKey[normalizeLookupValue(label)] = key
  }

  for (const [alias, key] of Object.entries(extraAliases)) {
    labelToKey[normalizeLookupValue(alias)] = key
  }

  return labelToKey
}

const DEAL_FIELD_MAPPERS = {
  deal_type: {
    excelColumn: 'Deal type',
    labelByKey: dealType,
    labelToKey: buildLabelToKeyMap(dealType, dealFieldExtraAliases.deal_type),
  },
  deal_stage: {
    excelColumn: 'Deal stage',
    labelByKey: dealStageAliases,
    labelToKey: buildLabelToKeyMap(dealStageAliases, dealFieldExtraAliases.deal_stage),
  },
  sec_type: {
    excelColumn: 'SEC type',
    labelByKey: secAliases,
    labelToKey: buildLabelToKeyMap(secAliases, dealFieldExtraAliases.sec_type),
  },
}

function resolveDealFieldKey(fieldName, excelValue) {
  const mapper = DEAL_FIELD_MAPPERS[fieldName]
  if (!mapper || excelValue === undefined || excelValue === null) return null

  const lookup = normalizeLookupValue(excelValue)
  if (!lookup) return null

  return mapper.labelToKey[lookup] || null
}

function getAllowedDealFieldLabels(fieldName) {
  const mapper = DEAL_FIELD_MAPPERS[fieldName]
  if (!mapper) return []
  return Object.values(mapper.labelByKey)
}

function getAllowedDealFieldKeys(fieldName) {
  const mapper = DEAL_FIELD_MAPPERS[fieldName]
  if (!mapper) return []
  return Object.keys(mapper.labelByKey)
}

function mapDealConstantFields(mappedData) {
  const next = { ...mappedData }
  const errors = []

  for (const [fieldName, mapper] of Object.entries(DEAL_FIELD_MAPPERS)) {
    const rawValue = next[fieldName]
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue

    const resolvedKey = resolveDealFieldKey(fieldName, rawValue)
    if (!resolvedKey) {
      errors.push({
        columnName: mapper.excelColumn,
        errorType: 'ENUM',
        errorMessage:
          `Invalid ${mapper.excelColumn}: "${rawValue}". ` +
          `Allowed: ${getAllowedDealFieldLabels(fieldName).join(', ')}`,
      })
      continue
    }

    next[fieldName] = resolvedKey
  }

  return { data: next, errors }
}

module.exports = {
  dealType,
  dealStageAliases,
  secAliases,
  dealFieldExtraAliases,
  DEAL_FIELD_MAPPERS,
  resolveDealFieldKey,
  getAllowedDealFieldLabels,
  getAllowedDealFieldKeys,
  mapDealConstantFields,
  normalizeLookupValue,
}

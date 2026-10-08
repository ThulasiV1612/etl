const columnMappingService = require('./columnMappingService')
const validationService = require('./validationService')
const { createInvitedUsername } = require('./uuidUtils')
const {
  sanitizeContactName,
  buildContactFullName,
  splitFullName,
} = require('./contactNameUtils')
const { isPlaceholderEmail } = require('./emailPlaceholderUtils')

function coerceValue(value, dataType) {
  if (validationService.isEmpty(value)) {
    return { value: null }
  }

  const trimmed = String(value).trim()

  switch (dataType) {
    case 'INTEGER': {
      const num = parseInt(trimmed, 10)
      if (Number.isNaN(num)) return { error: `Invalid integer: ${trimmed}` }
      return { value: num }
    }
    case 'DECIMAL': {
      const cleaned = trimmed.replace(/[$,]/g, '')
      const num = Number(cleaned)
      if (Number.isNaN(num)) return { error: `Invalid number: ${trimmed}` }
      return { value: num }
    }
    case 'DATE': {
      if (validationService.isDatePlaceholder(trimmed)) return { value: null }
      const parsed = validationService.parseExcelDate(value)
      if (!parsed) return { error: `Invalid date: ${trimmed}` }
      return { value: parsed }
    }
    case 'ZIP': {
      // Keep lone '-' and ZIP+4 (12345-6789); normalize en/em dashes
      const zip = validationService.normalizeZipValue
        ? validationService.normalizeZipValue(trimmed)
        : trimmed.replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-')
      return { value: zip || trimmed }
    }
    case 'EMAIL': {
      // Allow Cash Flow placeholders like "redacted" (no @ required)
      if (isPlaceholderEmail(trimmed)) return { value: trimmed.toLowerCase() }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return { error: `Invalid email: ${trimmed}` }
      }
      return { value: trimmed }
    }
    case 'BOOLEAN': {
      const normalized = trimmed.toLowerCase()
      if (['true', '1', 'yes'].includes(normalized)) return { value: true }
      if (['false', '0', 'no'].includes(normalized)) return { value: false }
      return { error: `Invalid boolean: ${trimmed}` }
    }
    default:
      return { value: trimmed }
  }
}

function applyDefaults({ uploadType, mappedData, context = {} }) {
  const uploadConfig = columnMappingService.getUploadConfig(uploadType)
  const record = { ...mappedData }

  if (!uploadConfig?.defaults) return record

  for (const [column, defaultRule] of Object.entries(uploadConfig.defaults)) {
    const currentValue = record[column]
    const isMissing = currentValue === undefined || currentValue === null || currentValue === ''
    const shouldApply = defaultRule.force === true || isMissing

    if (!shouldApply) continue

    if (defaultRule.source === 'static') {
      record[column] = defaultRule.value
      continue
    }

    if (defaultRule.source === 'context') {
      record[column] = context[defaultRule.key] ?? null
      continue
    }

    if (defaultRule.source === 'timestamp') {
      record[column] = new Date()
      continue
    }

    if (defaultRule.source === 'field') {
      record[column] = record[defaultRule.key] ?? null
      continue
    }

    if (defaultRule.source === 'invitedUsername') {
      record[column] = createInvitedUsername()
    }
  }

  return record
}

/**
 * Excel labels → contact.show_offerings_visibility enums.
 * Also accepts portal legacy values (show / hide / 506c) and DB enums as-is.
 */
function mapShowOfferingsVisibility(raw) {
  if (raw == null || String(raw).trim() === '') return null
  const t = String(raw).trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')

  if (
    t === 'all offerings' ||
    t === 'show all offerings' ||
    t === 'show offerings' ||
    t === 'show' ||
    t === 'all'
  )
    return 'ALL_OFFERINGS'

  if (
    t === 'hide offerings' ||
    t === 'hide' ||
    t === 'hidden'
  )
    return 'HIDE_OFFERINGS'

  if (
    t === '506c only' ||
    t === 'show only 506c offerings' ||
    t === 'show only 506c' ||
    t === '506c' ||
    t === '506 c only'
  )
    return '506C_ONLY'

  const upper = String(raw).trim().toUpperCase().replace(/\s+/g, '_')
  if (['ALL_OFFERINGS', 'HIDE_OFFERINGS', '506C_ONLY'].includes(upper)) return upper

  return null
}

function normalizeContactShowOfferingsVisibility(record) {
  const mapped = mapShowOfferingsVisibility(record.show_offerings_visibility)
  if (mapped) {
    record.show_offerings_visibility = mapped
    delete record.show_offerings
    return { ok: true }
  }
  if (
    record.show_offerings_visibility == null ||
    String(record.show_offerings_visibility).trim() === ''
  ) {
    record.show_offerings_visibility = 'ALL_OFFERINGS'
    delete record.show_offerings
    return { ok: true }
  }
  return {
    ok: false,
    error: `Invalid show_offerings_visibility: ${record.show_offerings_visibility}. Use Show all offerings, Hide offerings, or Show only 506c offerings.`,
  }
}

function normalizeContactNames(record) {
  const next = { ...record }
  let first = sanitizeContactName(next.first_name)
  let last = sanitizeContactName(next.last_name)
  let fullName = sanitizeContactName(next.full_name)

  if ((!first || !last) && fullName) {
    const split = splitFullName(fullName)
    if (!first) first = sanitizeContactName(split.first_name)
    if (!last) last = sanitizeContactName(split.last_name)
  }

  // "First Last" all in first_name with empty last_name
  if (first && !last && /\s/.test(first)) {
    const split = splitFullName(first)
    first = sanitizeContactName(split.first_name)
    last = sanitizeContactName(split.last_name)
  }

  next.first_name = first
  next.last_name = last
  next.full_name = buildContactFullName(first, last, fullName)
  return next
}

function transformRow({ uploadType, rowData, mappings, rowNumber, context = {} }) {
  const validation = validationService.validateRow({
    uploadType,
    rowData,
    mappings,
    rowNumber,
  })

  if (!validation.valid) {
    return {
      valid: false,
      data: null,
      errors: validation.errors,
    }
  }

  const transformed = {}
  const errors = []

  for (const mapping of mappings) {
    const rawValue = validation.mappedData[mapping.database_column_name]
    if (validationService.isEmpty(rawValue)) continue

    const coerced = coerceValue(rawValue, mapping.data_type)
    if (coerced.error) {
      errors.push({
        rowNumber,
        columnName: mapping.excel_column_name,
        errorType: 'TYPE',
        errorMessage: coerced.error,
      })
      continue
    }

    transformed[mapping.database_column_name] = coerced.value
  }

  if (errors.length) {
    return { valid: false, data: null, errors }
  }

  let withDefaults = applyDefaults({
    uploadType,
    mappedData: transformed,
    context,
  })

  if (uploadType === 'CONTACT_UPLOAD') {
    withDefaults = normalizeContactNames(withDefaults)

    if (validationService.isEmpty(withDefaults.email)) {
      return {
        valid: false,
        data: null,
        errors: [{
          rowNumber,
          columnName: 'Email',
          errorType: 'REQUIRED',
          errorMessage: 'Email is required — used to update an existing contact or insert a new one',
        }],
      }
    }

    const hasName =
      !validationService.isEmpty(withDefaults.first_name) ||
      !validationService.isEmpty(withDefaults.last_name) ||
      !validationService.isEmpty(withDefaults.full_name)

    if (!hasName) {
      return {
        valid: false,
        data: null,
        errors: [{
          rowNumber,
          columnName: 'Full Name',
          errorType: 'REQUIRED',
          errorMessage: 'Missing required value: Full Name (or First Name / Last Name)',
        }],
      }
    }

    const visibility = normalizeContactShowOfferingsVisibility(withDefaults)
    if (!visibility.ok) {
      return {
        valid: false,
        data: null,
        errors: [{
          rowNumber,
          columnName: 'Show Offerings Visibility',
          errorType: 'INVALID_VALUE',
          errorMessage: visibility.error,
        }],
      }
    }

    if (validationService.isEmpty(withDefaults.accreditation_status)) {
      withDefaults.accreditation_status = null
    } else {
      withDefaults.accreditation_status = String(withDefaults.accreditation_status).trim()
    }

    if (validationService.isEmpty(withDefaults.known_since)) {
      withDefaults.known_since = null
    }
  }

  const uploadConfig = columnMappingService.getUploadConfig(uploadType)
  const postDefaultErrors = []

  if (uploadConfig?.validations) {
    for (const validationRule of uploadConfig.validations) {
      if (validationRule.rule === 'required' && Array.isArray(validationRule.fields)) {
        postDefaultErrors.push(...validationService.validateRequiredRuleFields({
          record: withDefaults,
          fields: validationRule.fields,
          mappings,
          rowNumber,
        }))
      }
    }
  }

  if (postDefaultErrors.length) {
    return { valid: false, data: null, errors: postDefaultErrors }
  }

  if (typeof withDefaults.user_signup_completed === 'string') {
    withDefaults.user_signup_completed = withDefaults.user_signup_completed.toLowerCase()
  }

  return {
    valid: true,
    data: withDefaults,
    errors: [],
  }
}

module.exports = {
  coerceValue,
  applyDefaults,
  transformRow,
  splitFullName,
  sanitizeContactName,
  normalizeContactNames,
  mapShowOfferingsVisibility,
  buildContactFullName,
  normalizeContactShowOfferingsVisibility,
}

const { normalizeKeyLower } = require('./excelReaderService')
const columnMappingService = require('./columnMappingService')
const { REDACTED_EMAIL_PLACEHOLDER } = require('./emailPlaceholderUtils')
const {
  mapDealConstantFields,
  resolveDealFieldKey,
  getAllowedDealFieldLabels,
} = require('../../constants/deal.constants')

const ZIP_PATTERN = /^(\d{5})(-\d{4})?$/
const ZIP_PLACEHOLDER = new Set(['-', '—', '–', 'n/a', 'na', 'none', 'null'])
const DATE_PLACEHOLDER = new Set(['-', '—', '–', 'n/a', 'na', 'none', 'null'])

function isEmpty(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

function isDatePlaceholder(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  return DATE_PLACEHOLDER.has(raw) || DATE_PLACEHOLDER.has(String(value ?? '').trim())
}

function normalizeZipValue(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (ZIP_PLACEHOLDER.has(raw.toLowerCase()) || ZIP_PLACEHOLDER.has(raw)) return '-'
  return raw.replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-')
}

function parseExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0]
  }

  if (typeof value === 'number') {
    const parsed = xlsxDateToIso(value)
    if (parsed) return parsed
  }

  const trimmed = String(value).trim()
  const parsedDate = new Date(trimmed)
  if (Number.isNaN(parsedDate.getTime())) return null

  return parsedDate.toISOString().split('T')[0]
}

function xlsxDateToIso(serial) {
  if (!serial || Number.isNaN(serial)) return null
  const utcDays = Math.floor(serial - 25569)
  const date = new Date(utcDays * 86400 * 1000)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

function validateStructure(headers, requiredColumns) {
  const normalizedHeaders = headers.map(normalizeKeyLower)
  const missing = requiredColumns.filter(
    (column) => !normalizedHeaders.includes(normalizeKeyLower(column))
  )

  return {
    valid: missing.length === 0,
    missingColumns: missing,
    headers,
  }
}

function validateRequiredRuleFields({ record, fields, mappings, rowNumber }) {
  const errors = []

  for (const field of fields) {
    if (!isEmpty(record[field])) continue

    const mapping = mappings.find((item) => item.database_column_name === field)
    errors.push({
      rowNumber,
      columnName: mapping?.excel_column_name || field,
      errorType: 'REQUIRED',
      errorMessage: `Missing required value: ${mapping?.excel_column_name || field}`,
    })
  }

  return errors
}

function validateRequiredFields({ mappedData, mappings, rowNumber }) {
  const errors = []

  for (const mapping of mappings) {
    if (!mapping.required_flag) continue

    const value = mappedData[mapping.database_column_name]
    if (isEmpty(value)) {
      errors.push({
        rowNumber,
        columnName: mapping.excel_column_name,
        errorType: 'REQUIRED',
        errorMessage: `Missing required value: ${mapping.excel_column_name}`,
      })
    }
  }

  return errors
}

function validateDateField({ value, excelColumn, rowNumber, required = true }) {
  if (isEmpty(value) || isDatePlaceholder(value)) {
    if (!required || isDatePlaceholder(value)) return []
    return [{
      rowNumber,
      columnName: excelColumn,
      errorType: 'REQUIRED',
      errorMessage: `Missing required date: ${excelColumn}`,
    }]
  }

  const parsed = parseExcelDate(value)
  if (!parsed) {
    return [{
      rowNumber,
      columnName: excelColumn,
      errorType: 'DATE',
      errorMessage: `Invalid date format: ${excelColumn}`,
    }]
  }

  return []
}

function validateZipField({ value, excelColumn, rowNumber, required = false }) {
  if (isEmpty(value)) {
    if (!required) return []
    return [{
      rowNumber,
      columnName: excelColumn,
      errorType: 'REQUIRED',
      errorMessage: 'Missing required ZIP Code',
    }]
  }

  const zip = normalizeZipValue(value)
  if (zip === '-') return []
  if (!ZIP_PATTERN.test(zip)) {
    return [{
      rowNumber,
      columnName: excelColumn,
      errorType: 'ZIP',
      errorMessage: 'Invalid ZIP Code format. Use 12345, 12345-6789, or -',
    }]
  }

  return []
}

function validateDealConstantFields({ mappedData, rowNumber }) {
  const mapped = mapDealConstantFields(mappedData)

  return {
    mappedData: mapped.data,
    errors: mapped.errors.map((error) => ({
      ...error,
      rowNumber,
    })),
  }
}

function validateRow({ uploadType, rowData, mappings, rowNumber }) {
  const errors = []
  const uploadConfig = columnMappingService.getUploadConfig(uploadType)
  let mappedData = columnMappingService.mapRowToDatabaseColumns(rowData, mappings)

  // Cash Flow often blanks emails for privacy — import as placeholder "redacted"
  if (uploadType === 'CONTACT_UPLOAD' && isEmpty(mappedData.email)) {
    mappedData = { ...mappedData, email: REDACTED_EMAIL_PLACEHOLDER }
  }

  errors.push(...validateRequiredFields({ mappedData, mappings, rowNumber }))

  if (uploadConfig?.validations) {
    for (const validation of uploadConfig.validations) {
      if (validation.rule === 'date') {
        errors.push(...validateDateField({
          value: mappedData[validation.field],
          excelColumn: validation.excelColumn,
          rowNumber,
          required: false,
        }))
      }

      if (validation.rule === 'zip') {
        errors.push(...validateZipField({
          value: mappedData[validation.field],
          excelColumn: validation.excelColumn,
          rowNumber,
          // Deal creation requires ZIP; address uploads may use '-' or blank
          required: uploadType === 'DEAL_CREATION',
        }))
      }
    }
  }

  if (uploadType === 'DEAL_CREATION') {
    const constantValidation = validateDealConstantFields({ mappedData, rowNumber })
    mappedData = constantValidation.mappedData
    errors.push(...constantValidation.errors)
  }

  return {
    valid: errors.length === 0,
    mappedData,
    errors,
  }
}

function validateFileStructure({ headers, mappings }) {
  const resolvedMappings = columnMappingService.resolveMappingsForHeaders(headers, mappings)
  const result = columnMappingService.validateResolvedMappings(resolvedMappings)

  return {
    valid: result.valid,
    missingColumns: result.missingColumns,
    headers,
    resolvedMappings: result.resolvedMappings,
    columnPairs: result.columnPairs,
  }
}

module.exports = {
  validateStructure,
  validateFileStructure,
  validateRow,
  validateRequiredFields,
  validateRequiredRuleFields,
  validateDateField,
  validateZipField,
  validateDealConstantFields,
  resolveDealFieldKey,
  getAllowedDealFieldLabels,
  parseExcelDate,
  isEmpty,
  isDatePlaceholder,
  normalizeZipValue,
}

function normalizeHeaderKey(value) {
  // Strip mapping annotations: "user_email [Email address]" → "user_email"
  return String(value || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[%]+/g, ' pct')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

function cleanRawValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number' && !Number.isNaN(value)) return String(value)
  return String(value ?? '').trim()
}

function stripMoney(value) {
  if (isBlank(value)) return ''
  return cleanRawValue(value).replace(/[$,\s]/g, '')
}

function parseYesNo(value, fallback = false) {
  if (isBlank(value)) return fallback
  const normalized = cleanRawValue(value).toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(normalized)) return true
  if (['no', 'n', 'false', '0'].includes(normalized)) return false
  return fallback
}

function getCellFromRow(row, excelKeys) {
  const normalizedRow = {}
  for (const [key, value] of Object.entries(row || {})) {
    const normalized = normalizeHeaderKey(key)
    if (!normalized) continue
    // Prefer first occurrence; do not overwrite with later empty-key noise
    if (!Object.prototype.hasOwnProperty.call(normalizedRow, normalized)) {
      normalizedRow[normalized] = value
    }
  }

  for (const excelKey of excelKeys) {
    const key = normalizeHeaderKey(excelKey)
    if (!key) continue
    if (Object.prototype.hasOwnProperty.call(normalizedRow, key)) {
      return normalizedRow[key]
    }
    // Prefix match for residual annotations: "user email extra" ↔ "user email"
    const prefixMatch = Object.entries(normalizedRow).find(
      ([header]) => header === key || header.startsWith(`${key} `)
    )
    if (prefixMatch) return prefixMatch[1]
  }
  return ''
}

function findSheetName(workbook, aliases) {
  const entries = workbook.SheetNames.map((name) => ({
    name,
    key: normalizeHeaderKey(name),
  }))

  for (const alias of aliases) {
    const aliasKey = normalizeHeaderKey(alias)
    const match = entries.find(
      (entry) =>
        entry.key === aliasKey ||
        entry.key.replace(/\s+/g, '') === aliasKey.replace(/\s+/g, '')
    )
    if (match) return match.name
  }
  return null
}

function isHintOrBlankRow(row) {
  const values = Object.values(row || {})
  if (!values.some((value) => !isBlank(value))) return true

  const first = cleanRawValue(values[0]).toLowerCase()
  if (first === 'lookup' || first === 'hint' || first.startsWith('cash flow:') || first.startsWith('etl ')) {
    return true
  }

  const nonEmpty = values.map((value) => cleanRawValue(value)).filter(Boolean)
  if (nonEmpty.some((text) => /^cash flow:/i.test(text))) return true

  if (
    nonEmpty.length &&
    nonEmpty.every((text) =>
      /^(cash flow:|add_deal_form|deal_|user_|etl |lookup|do not|api:|must |uuid |join |optional |not stored|entity kind|same |email →|email address)/i.test(
        text
      )
    )
  ) {
    return true
  }

  return false
}

function readSheetRows(xlsx, workbook, sheetName) {
  if (!sheetName) return { sheetName: null, rows: [], rowCount: 0 }

  const sheet = workbook.Sheets[sheetName]
  const rows = xlsx.utils.sheet_to_json(sheet, {
    defval: '',
    blankrows: false,
    raw: true,
  })

  const dataRows = rows.filter((row) => !isHintOrBlankRow(row))
  return {
    sheetName,
    rows: dataRows,
    rowCount: dataRows.length,
  }
}

/**
 * Returns Excel-facing column labels that have non-blank values in the row.
 * columnGroups: { fieldKey: ['excel alias', ...] } or flat alias arrays.
 */
function listFilledExcelColumns(row, columnGroups) {
  const filled = []
  const seen = new Set()

  for (const [fieldKey, aliases] of Object.entries(columnGroups || {})) {
    const excelKeys = Array.isArray(aliases) ? aliases : [aliases]
    const value = getCellFromRow(row, excelKeys)
    if (isBlank(value)) continue
    const label = excelKeys[0] || fieldKey
    if (seen.has(label)) continue
    seen.add(label)
    filled.push(label)
  }

  return filled
}

module.exports = {
  normalizeHeaderKey,
  isBlank,
  cleanRawValue,
  stripMoney,
  parseYesNo,
  getCellFromRow,
  findSheetName,
  isHintOrBlankRow,
  readSheetRows,
  listFilledExcelColumns,
}

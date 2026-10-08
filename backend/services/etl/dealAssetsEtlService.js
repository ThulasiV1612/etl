const xlsx = require('xlsx')
const {
  ASSET_ATTR_DEFINITIONS,
  DEAL_ASSET_FIELD_KEYS,
} = require('../../constants/dealAssetAttr.constants')
const { getPool } = require('../dbService')
const { isValidUuid } = require('./uuidUtils')
const { logAudit } = require('../logger')
const { normalizeZipValue } = require('./validationService')

const ASSET_INFO_SHEET_ALIASES = [
  'asset_info',
  'assest_info',
  'asset info',
  'assest info',
  'assets_info',
  'deal_asset',
  'deal_assets',
  'assetinfo',
]

function normalizeHeaderKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

function findAssetInfoSheetName(workbook) {
  const entries = workbook.SheetNames.map((name) => ({
    name,
    key: normalizeHeaderKey(name).replace(/\s+/g, '_'),
  }))

  for (const alias of ASSET_INFO_SHEET_ALIASES) {
    const match = entries.find(
      (entry) =>
        entry.key === alias ||
        entry.key.replace(/_/g, '') === alias.replace(/_/g, '')
    )
    if (match) return match.name
  }

  return workbook.SheetNames[0] || null
}

function getCellFromRow(row, excelKeys) {
  const normalizedRow = {}
  for (const [key, value] of Object.entries(row || {})) {
    normalizedRow[normalizeHeaderKey(key)] = value
  }

  for (const excelKey of excelKeys) {
    const key = normalizeHeaderKey(excelKey)
    if (Object.prototype.hasOwnProperty.call(normalizedRow, key)) {
      return normalizedRow[key]
    }
  }

  return ''
}

function cleanRawValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number' && !Number.isNaN(value)) {
    return String(value)
  }

  return String(value ?? '').trim()
}

function parseExcelDateSerial(serial) {
  if (typeof serial !== 'number' || Number.isNaN(serial)) return null
  const utcDays = Math.floor(serial - 25569)
  const date = new Date(utcDays * 86400 * 1000)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function normalizeAttrValue(kind, rawValue) {
  if (isBlank(rawValue)) return ''

  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return rawValue.toISOString().slice(0, 10)
  }

  if (typeof rawValue === 'number' && (kind === 'date_na' || kind === 'year_na')) {
    if (kind === 'year_na' && rawValue >= 1800 && rawValue <= 2100) {
      return String(Math.trunc(rawValue))
    }
    if (kind === 'date_na') {
      const parsed = parseExcelDateSerial(rawValue)
      if (parsed) return parsed
    }
  }

  let value = cleanRawValue(rawValue)

  if (kind === 'money') {
    return value.replace(/[$,\s]/g, '')
  }

  if (kind === 'number_units') {
    return value.replace(/,/g, '').replace(/\s*units?\s*$/i, '').trim()
  }

  if (kind === 'year_na') {
    const match = value.match(/\d{4}/)
    return match ? match[0] : value
  }

  if (kind === 'date_na') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
    return value
  }

  return value
}

function formatMoneyDisplay(value) {
  if (isBlank(value)) return 'N/A'
  const num = Number(String(value).replace(/[$,\s]/g, ''))
  if (Number.isNaN(num)) return String(value)
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatAdditionalValue(def, value) {
  if (isBlank(value)) return 'N/A'
  if (def.kind === 'money') return formatMoneyDisplay(value)
  if (def.kind === 'number_units') {
    return `${value} ${def.unitSuffix || 'Units'}`
  }
  return String(value)
}

function parseJsonCell(rawValue, fallback) {
  if (isBlank(rawValue)) return fallback

  if (typeof rawValue === 'object') return rawValue

  const text = String(rawValue).trim()
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function buildAttrRowsJson(rowData, existingJson) {
  if (Array.isArray(existingJson) && existingJson.length) {
    return existingJson.map((item) => {
      const def = ASSET_ATTR_DEFINITIONS.find((entry) => entry.id === item.id)
      if (!def) return item

      const raw = getCellFromRow(rowData, def.excelKeys)
      const value = isBlank(item.value) && !isBlank(raw)
        ? normalizeAttrValue(def.kind, raw)
        : (item.value ?? '')

      const next = {
        id: def.id,
        label: item.label || def.label,
        kind: item.kind || def.kind,
        value: normalizeAttrValue(def.kind, value),
        preset: item.preset !== undefined ? Boolean(item.preset) : Boolean(def.preset),
      }

      if (def.unitSuffix || item.unitSuffix) {
        next.unitSuffix = item.unitSuffix || def.unitSuffix
      }
      if (def.kind === 'date_na' || def.kind === 'year_na') {
        next.na = item.na !== undefined ? Boolean(item.na) : false
      }

      return next
    })
  }

  return ASSET_ATTR_DEFINITIONS.map((def) => {
    const raw = getCellFromRow(rowData, def.excelKeys)
    const value = normalizeAttrValue(def.kind, raw)
    const item = {
      id: def.id,
      label: def.label,
      kind: def.kind,
      value,
      preset: Boolean(def.preset),
    }

    if (def.unitSuffix) item.unitSuffix = def.unitSuffix
    if (def.kind === 'date_na' || def.kind === 'year_na') item.na = false

    return item
  })
}

function buildAdditionalInfoJson(attrRows, existingJson) {
  if (Array.isArray(existingJson) && existingJson.length) {
    return existingJson
  }

  return attrRows
    .map((row) => {
      const def = ASSET_ATTR_DEFINITIONS.find((item) => item.id === row.id)
      if (!def?.includeInAdditionalInfo) return null
      return {
        label: row.label,
        value: formatAdditionalValue(def, row.value),
      }
    })
    .filter(Boolean)
}

function parseBoolean(value, fallback = false) {
  if (isBlank(value)) return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return fallback
}

function parseSortOrder(value, fallback) {
  if (isBlank(value)) return fallback
  const num = Number(value)
  return Number.isInteger(num) && num >= 0 ? num : fallback
}

function resolveClientAssetId({ excelValue, dealId, sortOrder, rowIndex }) {
  const fromExcel = cleanRawValue(excelValue)
  if (fromExcel) return fromExcel

  if (sortOrder === 0 || rowIndex === 0) {
    return `primary-${dealId}`
  }

  return `asset-${sortOrder || rowIndex}`
}

async function clientAssetIdExists(db, dealId, clientAssetId) {
  const result = await db.query(
    `SELECT 1 FROM deal_asset WHERE deal_id = $1 AND client_asset_id = $2 LIMIT 1`,
    [dealId, clientAssetId]
  )
  return result.rows.length > 0
}

async function allocateClientAssetId(db, { dealId, preferredId, rowIndex }) {
  if (preferredId && !(await clientAssetIdExists(db, dealId, preferredId))) {
    return preferredId
  }

  // Same deal + same preferred id already exists → always add a new row
  let attempt = 0
  while (attempt < 20) {
    const nextId = `asset-${Date.now()}-${rowIndex}-${attempt}`
    if (!(await clientAssetIdExists(db, dealId, nextId))) return nextId
    attempt += 1
  }

  return `asset-${Date.now()}-${rowIndex}-${Math.random().toString(36).slice(2, 8)}`
}

function readAssetInfoRows(filePath) {
  const workbook = xlsx.readFile(filePath)
  const sheetName = findAssetInfoSheetName(workbook)

  if (!sheetName) {
    throw new Error('Excel file contains no sheets')
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = xlsx.utils.sheet_to_json(sheet, {
    defval: '',
    blankrows: false,
    raw: false,
  })

  const dataRows = rows.filter((row) =>
    Object.values(row).some((value) => !isBlank(value))
  )

  return {
    sheetName,
    headers: dataRows[0] ? Object.keys(dataRows[0]) : [],
    rows: dataRows,
    rowCount: dataRows.length,
  }
}

function buildAddressDisplay({
  streetAddress1,
  streetAddress2,
  city,
  state,
  zipCode,
  country,
  excelDisplay,
}) {
  if (!isBlank(excelDisplay)) return cleanRawValue(excelDisplay)

  return [streetAddress1, streetAddress2, city, state, zipCode, country]
    .filter((part) => !isBlank(part))
    .join(', ')
}

async function getDealAssetColumnSet(db) {
  const result = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_asset'
  `)
  return new Set(result.rows.map((row) => row.column_name))
}

async function ensureDealAssetTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS deal_asset (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      deal_id UUID NOT NULL REFERENCES add_deal_form(id) ON DELETE CASCADE,
      client_asset_id TEXT NOT NULL,
      property_name TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      street_address_1 TEXT NOT NULL DEFAULT '',
      street_address_2 TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      zip_code TEXT NOT NULL DEFAULT '',
      address_display TEXT NOT NULL DEFAULT '',
      asset_type TEXT NOT NULL DEFAULT '',
      image_count INTEGER NOT NULL DEFAULT 0,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      additional_info_json TEXT NOT NULL DEFAULT '[]',
      attr_rows_json TEXT NOT NULL DEFAULT '[]',
      image_preview_urls_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT deal_asset_deal_client_uidx UNIQUE (deal_id, client_asset_id)
    )
  `)

  // Older ETL create used address_line_*; live app uses street_address_*
  const cols = await getDealAssetColumnSet(db)

  if (cols.has('address_line_1') && !cols.has('street_address_1')) {
    await db.query('ALTER TABLE deal_asset RENAME COLUMN address_line_1 TO street_address_1')
  }
  if (cols.has('address_line_2') && !cols.has('street_address_2')) {
    await db.query('ALTER TABLE deal_asset RENAME COLUMN address_line_2 TO street_address_2')
  }

  await db.query(`ALTER TABLE deal_asset ADD COLUMN IF NOT EXISTS street_address_1 TEXT NOT NULL DEFAULT ''`)
  await db.query(`ALTER TABLE deal_asset ADD COLUMN IF NOT EXISTS street_address_2 TEXT NOT NULL DEFAULT ''`)
  await db.query(`ALTER TABLE deal_asset ADD COLUMN IF NOT EXISTS address_display TEXT NOT NULL DEFAULT ''`)
  await db.query(`ALTER TABLE deal_asset ADD COLUMN IF NOT EXISTS image_count INTEGER NOT NULL DEFAULT 0`)
  await db.query(`ALTER TABLE deal_asset ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT ''`)
}

function mapExcelRowToDealAsset({ rowData, dealId, rowIndex }) {
  const sortOrder = parseSortOrder(
    getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.sort_order),
    rowIndex
  )

  const clientAssetId = resolveClientAssetId({
    excelValue: getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.client_asset_id),
    dealId,
    sortOrder,
    rowIndex,
  })

  const pastedAttrRows = parseJsonCell(
    getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.attr_rows_json),
    null
  )
  const pastedAdditionalInfo = parseJsonCell(
    getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.additional_info_json),
    null
  )
  const imagePreviewUrls = parseJsonCell(
    getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.image_preview_urls_json),
    []
  )
  const previewList = Array.isArray(imagePreviewUrls) ? imagePreviewUrls : []

  const attrRowsJson = buildAttrRowsJson(rowData, pastedAttrRows)
  const additionalInfoJson = buildAdditionalInfoJson(attrRowsJson, pastedAdditionalInfo)

  const assetTypeFromCol = cleanRawValue(
    getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.asset_type)
  )
  const assetTypeFromAttr = attrRowsJson.find((item) => item.id === 'attr-asset-type')?.value || ''

  const streetAddress1 = cleanRawValue(
    getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.street_address_1)
  )
  const streetAddress2 = cleanRawValue(
    getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.street_address_2)
  )
  const city = cleanRawValue(getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.city))
  const state = cleanRawValue(getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.state))
  const country = cleanRawValue(getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.country))
  const zipCode = normalizeZipValue(
    getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.zip_code)
  )

  const imageCountRaw = getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.image_count)
  const imageCount = isBlank(imageCountRaw)
    ? previewList.length
    : Math.max(0, Number.parseInt(String(imageCountRaw), 10) || 0)

  return {
    deal_id: dealId,
    client_asset_id: clientAssetId,
    property_name: cleanRawValue(
      getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.property_name)
    ),
    country,
    street_address_1: streetAddress1,
    street_address_2: streetAddress2,
    city,
    state,
    zip_code: zipCode,
    address_display: buildAddressDisplay({
      streetAddress1,
      streetAddress2,
      city,
      state,
      zipCode,
      country,
      excelDisplay: getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.address_display),
    }),
    asset_type: assetTypeFromCol || assetTypeFromAttr,
    image_count: imageCount,
    attr_rows_json: JSON.stringify(attrRowsJson),
    additional_info_json: JSON.stringify(additionalInfoJson),
    image_preview_urls_json: JSON.stringify(previewList),
    archived: parseBoolean(
      getCellFromRow(rowData, DEAL_ASSET_FIELD_KEYS.archived),
      false
    ),
    sort_order: sortOrder,
  }
}

async function insertDealAsset(record) {
  const db = await getPool()
  await ensureDealAssetTable(db)

  const result = await db.query(
    `INSERT INTO deal_asset (
      deal_id, client_asset_id, property_name, country,
      street_address_1, street_address_2, city, state, zip_code,
      address_display, asset_type, image_count,
      archived, additional_info_json, attr_rows_json, image_preview_urls_json,
      sort_order, updated_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15, $16,
      $17, NOW()
    )
    RETURNING id`,
    [
      record.deal_id,
      record.client_asset_id,
      record.property_name,
      record.country,
      record.street_address_1,
      record.street_address_2,
      record.city,
      record.state,
      record.zip_code,
      record.address_display,
      record.asset_type,
      record.image_count,
      record.archived,
      record.additional_info_json,
      record.attr_rows_json,
      record.image_preview_urls_json,
      record.sort_order,
    ]
  )

  return {
    success: true,
    entityId: result.rows[0].id,
    inserted: true,
    clientAssetId: record.client_asset_id,
  }
}

/**
 * Separate Deal Assets ETL for table deal_asset.
 * One Excel row = one new deal_asset for the selected deal_id.
 * If client_asset_id already exists for that deal, allocate a new id and insert another row.
 */
async function runDealAssetsEtl({ filePath, dealId, onRowResult }) {
  if (!dealId) {
    throw new Error('Deal is required. Select a deal name from the dropdown.')
  }

  if (!isValidUuid(dealId)) {
    throw new Error('Deal ID must be a valid UUID from the Deal Name dropdown')
  }

  const db = await getPool()
  await ensureDealAssetTable(db)

  const dealExists = await db.query(
    'SELECT id FROM add_deal_form WHERE id = $1 LIMIT 1',
    [dealId]
  )
  if (!dealExists.rows.length) {
    throw new Error(`Selected deal does not exist: ${dealId}`)
  }

  const { sheetName, rows, rowCount } = readAssetInfoRows(filePath)

  if (!rowCount) {
    throw new Error(`No data rows found in sheet "${sheetName}"`)
  }

  logAudit(`Deal Assets ETL | sheet=${sheetName} rows=${rowCount} dealId=${dealId}`)

  let successCount = 0
  let failedCount = 0
  const errors = []

  for (let index = 0; index < rows.length; index++) {
    const rowNumber = index + 2
    const rowData = rows[index]

    try {
      const record = mapExcelRowToDealAsset({
        rowData,
        dealId,
        rowIndex: index,
      })

      if (!record.zip_code) {
        throw new Error('zip_code is required')
      }

      record.client_asset_id = await allocateClientAssetId(db, {
        dealId,
        preferredId: record.client_asset_id,
        rowIndex: index,
      })

      if (!record.client_asset_id) {
        throw new Error('client_asset_id is required')
      }

      const result = await insertDealAsset(record)
      successCount++

      if (onRowResult) {
        await onRowResult({
          rowNumber,
          success: true,
          entityId: result.entityId,
          columnName: Object.keys(record)
            .filter((key) => {
              const value = record[key]
              return value !== '' && value != null && typeof value !== 'object'
            })
            .join(', ') || 'deal_asset',
          message: `Inserted asset ${result.clientAssetId}`,
        })
      }
    } catch (error) {
      failedCount++
      const errorMessage = error.message || 'Failed to insert deal asset'
      errors.push({
        rowNumber,
        columnName: 'deal_asset',
        errorType: 'LOAD',
        errorMessage,
      })

      if (onRowResult) {
        await onRowResult({
          rowNumber,
          success: false,
          errorMessage,
        })
      }
    }
  }

  return {
    sheetName,
    totalRecords: rowCount,
    successCount,
    failedCount,
    errors,
  }
}

module.exports = {
  ASSET_INFO_SHEET_ALIASES,
  buildAttrRowsJson,
  buildAdditionalInfoJson,
  readAssetInfoRows,
  mapExcelRowToDealAsset,
  insertDealAsset,
  upsertDealAsset: insertDealAsset,
  runDealAssetsEtl,
  ensureDealAssetTable,
  resolveClientAssetId,
  allocateClientAssetId,
}

const xlsx = require('xlsx')
const {
  CLASS_SHEET_ALIASES,
  CLASSES_COLUMNS,
  HURDLES_COLUMNS,
  FINAL_TIER_COLUMNS,
} = require('../../constants/dealClass.constants')
const { getPool } = require('../dbService')
const { isValidUuid } = require('./uuidUtils')
const { logAudit } = require('../logger')

function normalizeHeaderKey(value) {
  return String(value || '')
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

function parseExcelDateSerial(serial) {
  if (typeof serial !== 'number' || Number.isNaN(serial)) return null
  const utcDays = Math.floor(serial - 25569)
  const date = new Date(utcDays * 86400 * 1000)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function toIsoDate(value) {
  if (isBlank(value)) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number') {
    const fromSerial = parseExcelDateSerial(value)
    if (fromSerial) return fromSerial
  }

  const text = cleanRawValue(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return text
}

function normalizeSubscriptionType(value) {
  const raw = cleanRawValue(value).toLowerCase()
  if (!raw) return ''
  if (raw === 'lp' || raw === 'limited partner' || raw === 'limited partners') return 'lp'
  if (raw === 'gp' || raw === 'general partner' || raw === 'general partners') return 'gp'
  if (
    raw === 'mezz' ||
    raw === 'mezzanine' ||
    raw.includes('mezzanine') ||
    raw.includes('loan')
  )
    return 'mezzanine'
  return raw
}

function parseYesNo(value, fallback = false) {
  if (isBlank(value)) return fallback
  const normalized = cleanRawValue(value).toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(normalized)) return true
  if (['no', 'n', 'false', '0'].includes(normalized)) return false
  return fallback
}

function toNumberOrEmpty(value) {
  if (isBlank(value)) return ''
  const cleaned = stripMoney(value)
  if (cleaned === '') return ''
  const num = Number(cleaned)
  return Number.isNaN(num) ? cleaned : num
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
  if (first === 'lookup' || first === 'hint') return true

  const dealName = cleanRawValue(
    getCellFromRow(row, ['deal_name', 'Deal Name', 'deal name'])
  ).toLowerCase()
  if (dealName === 'lookup') return true

  // Yellow mapping row: cells are schema paths / notes, not data
  const nonEmpty = values.map((value) => cleanRawValue(value)).filter(Boolean)
  if (
    nonEmpty.length &&
    nonEmpty.every((text) =>
      /^(add_deal_form|deal_investor_class|advanced_options_json|waterfalltiers|finaltier|lookup|etl note|source )/i.test(
        text
      )
    )
  ) {
    return true
  }

  return false
}

function readSheetRows(workbook, sheetName) {
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

function readClassWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath)
  const classesSheet = findSheetName(workbook, CLASS_SHEET_ALIASES.classes)
  const hurdlesSheet = findSheetName(workbook, CLASS_SHEET_ALIASES.hurdles)
  const finalTierheet = findSheetName(workbook, CLASS_SHEET_ALIASES.finalTier)

  if (!classesSheet) {
    throw new Error('Excel must include a "Classes" sheet (ETL_Class_Mapping_Template_v2)')
  }

  return {
    classes: readSheetRows(workbook, classesSheet),
    hurdles: readSheetRows(workbook, hurdlesSheet),
    finalTier: readSheetRows(workbook, finalTierheet),
  }
}

function buildPreferredReturn(row) {
  const enabled = parseYesNo(getCellFromRow(row, CLASSES_COLUMNS.pref_enabled), false)
  const preferred = {
    enabled,
    rate: toNumberOrEmpty(getCellFromRow(row, CLASSES_COLUMNS.pref_rate)),
    preferredType: cleanRawValue(getCellFromRow(row, CLASSES_COLUMNS.pref_type)) || 'single',
    compounding: cleanRawValue(getCellFromRow(row, CLASSES_COLUMNS.pref_compounding)) || 'simple',
    distributionFrequency:
      cleanRawValue(getCellFromRow(row, CLASSES_COLUMNS.pref_distribution_frequency)) ||
      'quarterly',
  }

  const currentPortion = toNumberOrEmpty(
    getCellFromRow(row, CLASSES_COLUMNS.pref_current_portion)
  )
  const accruedPortion = toNumberOrEmpty(
    getCellFromRow(row, CLASSES_COLUMNS.pref_accrued_portion)
  )
  if (currentPortion !== '') preferred.currentPortion = currentPortion
  if (accruedPortion !== '') preferred.accruedPortion = accruedPortion

  return preferred
}

function mapClassRow(row) {
  const name = cleanRawValue(getCellFromRow(row, CLASSES_COLUMNS.name))
  const equityPct = toNumberOrEmpty(getCellFromRow(row, CLASSES_COLUMNS.equity_pct))
  const distributionSharePct = toNumberOrEmpty(
    getCellFromRow(row, CLASSES_COLUMNS.distribution_share_pct)
  )
  const displayOrder = toNumberOrEmpty(getCellFromRow(row, CLASSES_COLUMNS.display_order))

  return {
    name,
    subscription_type: normalizeSubscriptionType(
      getCellFromRow(row, CLASSES_COLUMNS.subscription_type)
    ),
    status: cleanRawValue(getCellFromRow(row, CLASSES_COLUMNS.status)) || 'draft',
    entity_name: cleanRawValue(getCellFromRow(row, CLASSES_COLUMNS.entity_name)),
    start_date: toIsoDate(getCellFromRow(row, CLASSES_COLUMNS.start_date)),
    offering_size: stripMoney(getCellFromRow(row, CLASSES_COLUMNS.offering_size)),
    raise_amount_distributions: stripMoney(
      getCellFromRow(row, CLASSES_COLUMNS.raise_amount_distributions)
    ),
    billing_raise_quota: stripMoney(
      getCellFromRow(row, CLASSES_COLUMNS.billing_raise_quota)
    ),
    minimum_investment: stripMoney(
      getCellFromRow(row, CLASSES_COLUMNS.minimum_investment)
    ),
    number_of_units: stripMoney(getCellFromRow(row, CLASSES_COLUMNS.number_of_units)),
    price_per_unit: stripMoney(getCellFromRow(row, CLASSES_COLUMNS.price_per_unit)),
    visibility: cleanRawValue(getCellFromRow(row, CLASSES_COLUMNS.visibility)),
    deal_target_raise: stripMoney(getCellFromRow(row, CLASSES_COLUMNS.deal_target_raise)),
    deal_promote: stripMoney(getCellFromRow(row, CLASSES_COLUMNS.deal_promote)),
    classSetupSeed: {
      displayOrder: displayOrder === '' ? 0 : displayOrder,
      equityPct,
      entityLegalOwnershipPct: equityPct,
      mapsTo:
        cleanRawValue(getCellFromRow(row, CLASSES_COLUMNS.maps_to)) || name,
      preferredReturn: buildPreferredReturn(row),
      waterfallTiers: [],
      finalTier: null,
    },
    distributionSharePct,
  }
}

function mapHurdleRow(row) {
  return {
    className: cleanRawValue(getCellFromRow(row, HURDLES_COLUMNS.class_name)),
    tierOrder: toNumberOrEmpty(getCellFromRow(row, HURDLES_COLUMNS.tier_order)),
    hurdleName: cleanRawValue(getCellFromRow(row, HURDLES_COLUMNS.hurdle_name)),
    hurdleRate: toNumberOrEmpty(getCellFromRow(row, HURDLES_COLUMNS.hurdle_rate_pct)),
    lpPct: toNumberOrEmpty(getCellFromRow(row, HURDLES_COLUMNS.lp_pct)),
    gpPct: toNumberOrEmpty(getCellFromRow(row, HURDLES_COLUMNS.gp_pct)),
    preferredReturnType:
      cleanRawValue(getCellFromRow(row, HURDLES_COLUMNS.preferred_return_type)) ||
      'cash_on_cash',
    isFinal: parseYesNo(getCellFromRow(row, HURDLES_COLUMNS.is_final), false),
  }
}

function mapFinalTierRow(row) {
  return {
    className: cleanRawValue(getCellFromRow(row, FINAL_TIER_COLUMNS.class_name)),
    lpPct: toNumberOrEmpty(getCellFromRow(row, FINAL_TIER_COLUMNS.final_lp_pct)),
    gpPct: toNumberOrEmpty(getCellFromRow(row, FINAL_TIER_COLUMNS.final_gp_pct)),
    hurdleName:
      cleanRawValue(getCellFromRow(row, FINAL_TIER_COLUMNS.hurdle_name)) || 'Final',
  }
}

async function ensureClassSetupJsonColumn(db) {
  await db.query(`
    ALTER TABLE add_deal_form
    ADD COLUMN IF NOT EXISTS class_setup_json TEXT
  `)
}

async function upsertDealInvestorClass(db, { dealId, record, advancedOptionsJson }) {
  const existing = await db.query(
    `SELECT id FROM deal_investor_class
     WHERE deal_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
     LIMIT 1`,
    [dealId, record.name]
  )

  if (existing.rows.length) {
    const result = await db.query(
      `UPDATE deal_investor_class SET
        subscription_type = $3,
        entity_name = $4,
        start_date = $5,
        offering_size = $6,
        raise_amount_distributions = $7,
        billing_raise_quota = $8,
        minimum_investment = $9,
        number_of_units = $10,
        price_per_unit = $11,
        status = $12,
        visibility = $13,
        advanced_options_json = $14,
        updated_at = NOW()
       WHERE id = $1 AND deal_id = $2
       RETURNING id`,
      [
        existing.rows[0].id,
        dealId,
        record.subscription_type,
        record.entity_name,
        record.start_date,
        record.offering_size,
        record.raise_amount_distributions,
        record.billing_raise_quota,
        record.minimum_investment,
        record.number_of_units,
        record.price_per_unit,
        record.status,
        record.visibility,
        advancedOptionsJson,
      ]
    )
    return { entityId: result.rows[0].id, inserted: false }
  }

  const result = await db.query(
    `INSERT INTO deal_investor_class (
      deal_id, name, subscription_type, entity_name, start_date,
      offering_size, raise_amount_distributions, billing_raise_quota,
      minimum_investment, number_of_units, price_per_unit,
      status, visibility, advanced_options_json
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14
    )
    RETURNING id`,
    [
      dealId,
      record.name,
      record.subscription_type,
      record.entity_name,
      record.start_date,
      record.offering_size,
      record.raise_amount_distributions,
      record.billing_raise_quota,
      record.minimum_investment,
      record.number_of_units,
      record.price_per_unit,
      record.status,
      record.visibility,
      advancedOptionsJson,
    ]
  )

  return { entityId: result.rows[0].id, inserted: true }
}

async function updateDealClassSetupJson(db, { dealId, targetRaise, promote }) {
  await ensureClassSetupJsonColumn(db)

  const existing = await db.query(
    `SELECT class_setup_json FROM add_deal_form WHERE id = $1 LIMIT 1`,
    [dealId]
  )
  if (!existing.rows.length) {
    throw new Error(`Selected deal does not exist: ${dealId}`)
  }

  let current = {}
  const raw = existing.rows[0].class_setup_json
  if (raw && String(raw).trim()) {
    try {
      current = JSON.parse(raw)
      if (!current || typeof current !== 'object' || Array.isArray(current)) current = {}
    } catch {
      current = {}
    }
  }

  const next = {
    ...current,
    targetRaise:
      targetRaise !== '' && targetRaise != null
        ? targetRaise
        : (current.targetRaise ?? ''),
  }

  if (promote !== undefined && promote !== null && promote !== '') {
    next.promote = promote
  } else if (current.promote !== undefined) {
    next.promote = current.promote
  }

  await db.query(
    `UPDATE add_deal_form
     SET class_setup_json = $2
     WHERE id = $1`,
    [dealId, JSON.stringify(next)]
  )
}

function basisFromPrefType(raw) {
  const text = String(raw || '').toLowerCase()
  if (text.includes('irr')) return 'IRR'
  if (text.includes('cash') || text.includes('coc')) return 'Cash-on-cash'
  return 'Cash-on-cash'
}

function stripPct(value) {
  return String(value ?? '')
    .replace(/%/g, '')
    .trim()
}

/**
 * Build class_setup_json.promote from Class Mapping hurdles / final tier
 * (same rules as python/distributions_mapping/promote_processor.py).
 * Share keys are class UUIDs when classIdByName is provided.
 */
function buildPromoteSchedule({ classRows, hurdlesRows, finalTierRows, classIdByName }) {
  const promoteHurdles = []
  const seenRates = new Set()

  for (const raw of hurdlesRows || []) {
    const hurdle = mapHurdleRow(raw)
    if (!hurdle.className || hurdle.isFinal) continue
    const rate = stripPct(hurdle.hurdleRate)
    if (!rate || seenRates.has(rate)) continue
    seenRates.add(rate)
    promoteHurdles.push({
      id: `h${promoteHurdles.length + 1}`,
      rate,
      basis: basisFromPrefType(hurdle.preferredReturnType),
      measuredOn: 'LP classes',
      source_class_name: hurdle.className,
      lp_pct: stripPct(hurdle.lpPct),
      gp_pct: stripPct(hurdle.gpPct),
    })
  }

  const firstFinal = (finalTierRows || [])[0]
  const mappedFinal = firstFinal ? mapFinalTierRow(firstFinal) : null
  const finalLp = stripPct(mappedFinal?.lpPct) || '50'
  const finalGp = stripPct(mappedFinal?.gpPct) || '50'
  const stageN = Math.max(1, promoteHurdles.length) + 1

  const shares = {}
  for (const record of classRows || []) {
    const name = record.name
    if (!name) continue
    const type = String(record.subscription_type || '').toLowerCase()
    const shareKey =
      (classIdByName && (classIdByName.get(name) || classIdByName.get(name.toLowerCase()))) ||
      name

    if (type === 'lp') {
      const matchRaw = (hurdlesRows || []).find(
        (row) => mapHurdleRow(row).className === name
      )
      const match = matchRaw ? mapHurdleRow(matchRaw) : null
      const lp = stripPct(match?.lpPct) || '100'
      shares[shareKey] = Array.from({ length: stageN }, (_, i) =>
        i < stageN - 1 ? lp : finalLp
      )
    } else if (type === 'gp') {
      const matchRaw = (hurdlesRows || []).find((row) => {
        const h = mapHurdleRow(row)
        return stripPct(h.gpPct) !== ''
      })
      const match = matchRaw ? mapHurdleRow(matchRaw) : null
      const gp = stripPct(match?.gpPct) || '0'
      shares[shareKey] = Array.from({ length: stageN }, (_, i) =>
        i < stageN - 1 ? gp : finalGp
      )
    }
  }

  return {
    hurdles: promoteHurdles.map(({ id, rate, basis, measuredOn }) => ({
      id,
      rate,
      basis,
      measuredOn,
    })),
    shares,
  }
}

/**
 * Dedicated Classes ETL (ETL_Class_Mapping_Template_v2.xlsx).
 * Import order: Classes → Hurdles → Final Tier.
 */
async function runDealClassesEtl({ filePath, dealId, onRowResult }) {
  if (!dealId) {
    throw new Error('Deal is required. Select a deal name from the dropdown.')
  }
  if (!isValidUuid(dealId)) {
    throw new Error('Deal ID must be a valid UUID from the Deal Name dropdown')
  }

  const db = await getPool()
  await ensureClassSetupJsonColumn(db)

  const dealExists = await db.query(
    'SELECT id FROM add_deal_form WHERE id = $1 LIMIT 1',
    [dealId]
  )
  if (!dealExists.rows.length) {
    throw new Error(`Selected deal does not exist: ${dealId}`)
  }

  const workbookData = readClassWorkbook(filePath)
  const classRows = workbookData.classes.rows.map(mapClassRow).filter((row) => row.name)
  if (!classRows.length) {
    throw new Error('No class data rows found on the Classes sheet (hint/blank rows are skipped)')
  }

  const hurdlesByClass = new Map()
  for (const raw of workbookData.hurdles.rows) {
    const hurdle = mapHurdleRow(raw)
    if (!hurdle.className || hurdle.isFinal) continue
    const list = hurdlesByClass.get(hurdle.className) || []
    list.push({
      tierOrder: hurdle.tierOrder === '' ? list.length + 1 : hurdle.tierOrder,
      hurdleName: hurdle.hurdleName,
      hurdleRate: hurdle.hurdleRate,
      lpPct: hurdle.lpPct,
      gpPct: hurdle.gpPct,
      preferredReturnType: hurdle.preferredReturnType,
    })
    hurdlesByClass.set(hurdle.className, list)
  }

  const finalTierByClass = new Map()
  for (const raw of workbookData.finalTier.rows) {
    const finalTier = mapFinalTierRow(raw)
    if (!finalTier.className) continue
    finalTierByClass.set(finalTier.className, {
      lpPct: finalTier.lpPct,
      gpPct: finalTier.gpPct,
      hurdleName: finalTier.hurdleName,
    })
  }

  logAudit(
    `Deal Classes ETL | classes=${classRows.length} hurdles=${workbookData.hurdles.rowCount} finalTier=${workbookData.finalTier.rowCount} dealId=${dealId}`
  )

  let successCount = 0
  let failedCount = 0
  const errors = []
  let dealTargetRaise = ''
  const classIdByName = new Map()

  for (let index = 0; index < classRows.length; index++) {
    const rowNumber = index + 2
    const record = classRows[index]

    try {
      const classSetup = {
        ...record.classSetupSeed,
        waterfallTiers: (hurdlesByClass.get(record.name) || []).sort(
          (a, b) => Number(a.tierOrder || 0) - Number(b.tierOrder || 0)
        ),
        finalTier: finalTierByClass.get(record.name) || null,
      }

      const advancedOptions = {
        classSetup,
      }
      if (record.distributionSharePct !== '') {
        advancedOptions.distributionSharePct = record.distributionSharePct
      }

      const result = await upsertDealInvestorClass(db, {
        dealId,
        record,
        advancedOptionsJson: JSON.stringify(advancedOptions),
      })

      if (record.deal_target_raise) dealTargetRaise = record.deal_target_raise
      if (result.entityId) {
        classIdByName.set(record.name, result.entityId)
        classIdByName.set(String(record.name).toLowerCase(), result.entityId)
      }

      successCount++
      if (onRowResult) {
        const exportedColumns = Object.keys(record)
          .filter((key) => {
            if (key === 'classSetupSeed') return false
            const value = record[key]
            return value !== '' && value != null && typeof value !== 'object'
          })
          .concat(
            (hurdlesByClass.get(record.name) || []).length
              ? ['waterfallTiers (Hurdles)']
              : [],
            finalTierByClass.get(record.name) ? ['finalTier (Final Tier)'] : []
          )
        await onRowResult({
          rowNumber,
          success: true,
          entityId: result.entityId,
          columnName: exportedColumns.join(', ') || 'deal_investor_class',
          message: result.inserted
            ? `Inserted class ${record.name}`
            : `Updated class ${record.name}`,
        })
      }
    } catch (error) {
      failedCount++
      const errorMessage = error.message || 'Failed to load investor class'
      errors.push({
        rowNumber,
        columnName: 'deal_investor_class',
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

  if (successCount > 0) {
    const promote = buildPromoteSchedule({
      classRows,
      hurdlesRows: workbookData.hurdles.rows,
      finalTierRows: workbookData.finalTier.rows,
      classIdByName,
    })

    await updateDealClassSetupJson(db, {
      dealId,
      targetRaise: dealTargetRaise,
      promote,
    })
  }

  return {
    sheets: {
      classes: workbookData.classes.sheetName,
      hurdles: workbookData.hurdles.sheetName,
      finalTier: workbookData.finalTier.sheetName,
    },
    totalRecords: classRows.length,
    successCount,
    failedCount,
    errors,
  }
}

module.exports = {
  readClassWorkbook,
  mapClassRow,
  mapHurdleRow,
  mapFinalTierRow,
  runDealClassesEtl,
  buildPromoteSchedule,
  normalizeSubscriptionType,
  toIsoDate,
  stripMoney,
}

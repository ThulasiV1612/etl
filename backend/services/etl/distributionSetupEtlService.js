/**
 * Distribution Setup ETL (etl-distribution-setup-mapping.mdc)
 * Loads waterfall CONFIG into add_deal_form.distribution_setup_json.
 * Does NOT create/modify classes. Ignores Paid_* ledger sheets.
 */

const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')
const {
  DISTRIBUTION_SHEET_ALIASES,
  DIST_ROW_COLUMNS,
  WF_KINDS,
  AMOUNT_MODES,
} = require('../../constants/distributionSetup.constants')
const {
  isBlank,
  cleanRawValue,
  parseYesNo,
  getCellFromRow,
  findSheetName,
  readSheetRows,
} = require('./excelRowUtils')
const { getPool } = require('../dbService')
const { isValidUuid } = require('./uuidUtils')
const { logAudit } = require('../logger')
const {
  parseDistributionSetupDocument,
  serializeDistributionSetupDocument,
} = require('./distributionSetupJson')

function normalizeKind(value) {
  const raw = cleanRawValue(value).toUpperCase().replace(/[\s-]+/g, '_')
  if (WF_KINDS.has(raw)) return raw
  return ''
}

function normalizeAmountMode(value) {
  const raw = cleanRawValue(value).toLowerCase()
  if (AMOUNT_MODES.has(raw)) return raw
  return 'calc'
}

function splitPayToNames(value) {
  const text = cleanRawValue(value)
  if (!text) return []
  return text
    .split(/[|;,/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function isPaidSheetName(name) {
  const key = String(name || '')
    .trim()
    .toLowerCase()
  if (!key) return false
  if (key.startsWith('paid')) return true
  return DISTRIBUTION_SHEET_ALIASES.paid.some(
    (alias) => key === alias || key.includes(alias)
  )
}

/** Waterfall-only helper (preserves priors/classes/fee when existingDoc provided). */
function serializeDistributionSetupJson(waterfalls, existingDoc = null) {
  const existing = existingDoc || {
    priorDistributions: [],
    setupName: '',
    dayCountMode: '',
    defaultAccrualStartIso: '',
  }
  return serializeDistributionSetupDocument({
    waterfalls,
    priorDistributions: existing.priorDistributions || [],
    setupName: existing.setupName || '',
    dayCountMode: existing.dayCountMode || '',
    defaultAccrualStartIso: existing.defaultAccrualStartIso || '',
    classes: existing.classes,
    promote: existing.promote,
    distributionFee: existing.distributionFee,
  })
}

function mapWaterfallExcelRow(row, sourceHint) {
  const kind = normalizeKind(getCellFromRow(row, DIST_ROW_COLUMNS.kind))
  if (!kind) return null

  const explicitSource = cleanRawValue(
    getCellFromRow(row, DIST_ROW_COLUMNS.source)
  ).toLowerCase()
  let source = sourceHint
  if (explicitSource.includes('capital')) source = 'capital'
  if (explicitSource.includes('operating')) source = 'operating'

  const payToNames = splitPayToNames(
    getCellFromRow(row, DIST_ROW_COLUMNS.pay_to_class_name)
  )
  const payToId = cleanRawValue(
    getCellFromRow(row, DIST_ROW_COLUMNS.pay_to_class_id)
  )

  return {
    dealName: cleanRawValue(getCellFromRow(row, DIST_ROW_COLUMNS.deal_name)),
    dealId: cleanRawValue(getCellFromRow(row, DIST_ROW_COLUMNS.deal_id)),
    rowOrder: Number(
      cleanRawValue(getCellFromRow(row, DIST_ROW_COLUMNS.row_order)) || 0
    ),
    source,
    id:
      cleanRawValue(getCellFromRow(row, DIST_ROW_COLUMNS.row_id)) ||
      `${source}_${kind.toLowerCase()}`,
    kind,
    name: cleanRawValue(getCellFromRow(row, DIST_ROW_COLUMNS.name)) || kind,
    payToNames,
    payToId: isValidUuid(payToId) ? payToId : '',
    amountMode: normalizeAmountMode(
      getCellFromRow(row, DIST_ROW_COLUMNS.amount_mode)
    ),
    inputAmount:
      cleanRawValue(getCellFromRow(row, DIST_ROW_COLUMNS.input_amount)) || '0',
    catchupPct:
      cleanRawValue(getCellFromRow(row, DIST_ROW_COLUMNS.catchup_pct)) ||
      (kind === 'CATCHUP' ? '20' : ''),
  }
}

function readPayloadJson(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const items = Array.isArray(raw) ? raw : [raw]
  const deals = []

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const dealName = cleanRawValue(item.deal_name || item.dealName)
    const dealId = cleanRawValue(item.deal_id || item.dealId)
    const wf = item.waterfalls || {}
    const operating = Array.isArray(wf.operating) ? wf.operating : []
    const capital = Array.isArray(wf.capital) ? wf.capital : []

    const rows = []
    operating.forEach((row, index) => {
      rows.push({
        dealName,
        dealId,
        rowOrder: index + 1,
        source: 'operating',
        id: cleanRawValue(row.id) || `op_${index + 1}`,
        kind: normalizeKind(row.kind),
        name: cleanRawValue(row.name) || normalizeKind(row.kind),
        payToNames: Array.isArray(row.payTo)
          ? row.payTo.map((v) => cleanRawValue(v)).filter(Boolean)
          : splitPayToNames(row.pay_to_class_name || row.payTo),
        payToId: isValidUuid(row.pay_to_class_id) ? row.pay_to_class_id : '',
        amountMode: normalizeAmountMode(row.amountMode || row.amount_mode),
        inputAmount: cleanRawValue(row.inputAmount || row.input_amount) || '0',
        catchupPct:
          cleanRawValue(
            row.catchupPct ||
              row.catchup_pct ||
              (row.catchup && row.catchup.pct)
          ) || (normalizeKind(row.kind) === 'CATCHUP' ? '20' : ''),
      })
    })
    capital.forEach((row, index) => {
      rows.push({
        dealName,
        dealId,
        rowOrder: index + 1,
        source: 'capital',
        id: cleanRawValue(row.id) || `cap_${index + 1}`,
        kind: normalizeKind(row.kind),
        name: cleanRawValue(row.name) || normalizeKind(row.kind),
        payToNames: Array.isArray(row.payTo)
          ? row.payTo.map((v) => cleanRawValue(v)).filter(Boolean)
          : splitPayToNames(row.pay_to_class_name || row.payTo),
        payToId: isValidUuid(row.pay_to_class_id) ? row.pay_to_class_id : '',
        amountMode: normalizeAmountMode(row.amountMode || row.amount_mode),
        inputAmount: cleanRawValue(row.inputAmount || row.input_amount) || '0',
        catchupPct:
          cleanRawValue(
            row.catchupPct ||
              row.catchup_pct ||
              (row.catchup && row.catchup.pct)
          ) || (normalizeKind(row.kind) === 'CATCHUP' ? '20' : ''),
      })
    })

    deals.push({
      dealName,
      dealId,
      rows: rows.filter((r) => r.kind),
    })
  }

  return deals
}

/**
 * Optional: regenerate Dist Setup rows from Class Mapping workbook (Classes sheet).
 * Does not write hurdles/final tier into distribution_setup_json.
 */
function seedRowsFromClassMappingWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath)
  const classesSheet = findSheetName(workbook, ['classes', 'class'])
  if (!classesSheet) {
    throw new Error(
      'Class mapping seed requires a Classes sheet (Class_Mapping_FILLED.xlsx)'
    )
  }

  const { rows } = readSheetRows(xlsx, workbook, classesSheet)
  const byDeal = new Map()

  for (const row of rows) {
    const dealName = cleanRawValue(
      getCellFromRow(row, ['deal_name', 'deal name'])
    )
    const className = cleanRawValue(
      getCellFromRow(row, ['name', 'class_name', 'class name'])
    )
    if (!dealName || !className) continue

    const subType = cleanRawValue(
      getCellFromRow(row, ['subscription_type', 'subscription type'])
    ).toLowerCase()
    const prefEnabled = parseYesNo(
      getCellFromRow(row, ['pref_enabled', 'pref enabled']),
      false
    )
    const prefRate = cleanRawValue(
      getCellFromRow(row, ['pref_rate', 'pref rate'])
    )
    const catchupPct =
      cleanRawValue(getCellFromRow(row, ['catchup_pct', 'catchup pct'])) || '20'

    if (!byDeal.has(dealName)) byDeal.set(dealName, [])
    const list = byDeal.get(dealName)

    const isLp = subType === 'lp' || subType.includes('limited')
    const isGp = subType === 'gp' || subType.includes('general')
    const isPrefEq =
      subType === 'preferred_equity' || subType.includes('preferred equity')

    if (isLp && prefEnabled) {
      list.push({
        dealName,
        dealId: '',
        rowOrder: list.length + 1,
        source: 'operating',
        id: `op_lp_pref_${list.length + 1}`,
        kind: 'LP_PREF',
        name: prefRate
          ? `LP preferred return (+ arrears) — ${prefRate}%`
          : 'LP preferred return (+ arrears)',
        payToNames: [className],
        payToId: '',
        amountMode: 'calc',
        inputAmount: '0',
        catchupPct: '',
      })
    }

    if (isPrefEq) {
      list.push({
        dealName,
        dealId: '',
        rowOrder: list.length + 1,
        source: 'operating',
        id: `op_pref_current_${list.length + 1}`,
        kind: 'PREF_CURRENT',
        name: 'Preferred equity — current pay',
        payToNames: [className],
        payToId: '',
        amountMode: 'calc',
        inputAmount: '0',
        catchupPct: '',
      })
      list.push({
        dealName,
        dealId: '',
        rowOrder: list.length + 1,
        source: 'capital',
        id: `cap_pref_accrued_${list.length + 1}`,
        kind: 'PREF_ACCRUED',
        name: 'Preferred equity — accrued balance',
        payToNames: [className],
        payToId: '',
        amountMode: 'calc',
        inputAmount: '0',
        catchupPct: '',
      })
    }

    if (isLp) {
      list.push({
        dealName,
        dealId: '',
        rowOrder: list.length + 1,
        source: 'capital',
        id: `cap_roc_${list.length + 1}`,
        kind: 'ROC',
        name: 'Return of LP capital',
        payToNames: [className],
        payToId: '',
        amountMode: 'calc',
        inputAmount: '0',
        catchupPct: '',
      })
    }

    if (isGp) {
      list.push({
        dealName,
        dealId: '',
        rowOrder: list.length + 1,
        source: 'capital',
        id: `cap_catchup_${list.length + 1}`,
        kind: 'CATCHUP',
        name: 'GP catch-up',
        payToNames: [className],
        payToId: '',
        amountMode: 'calc',
        inputAmount: '0',
        catchupPct,
      })
    }
  }

  return Array.from(byDeal.entries()).map(([dealName, seeded]) => ({
    dealName,
    dealId: '',
    rows: seeded,
  }))
}

function readDistributionWorkbook(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.json') {
    return {
      source: 'json',
      deals: readPayloadJson(filePath),
      ignoredPaidSheets: [],
    }
  }

  const workbook = xlsx.readFile(filePath)
  const ignoredPaidSheets = workbook.SheetNames.filter(isPaidSheetName)

  // Prefer explicit Dist Setup waterfall sheets over regenerating from Classes
  const operatingSheet = findSheetName(workbook, DISTRIBUTION_SHEET_ALIASES.operating)
  const capitalSheet = findSheetName(workbook, DISTRIBUTION_SHEET_ALIASES.capital)
  const seedOnlySheet = findSheetName(
    workbook,
    DISTRIBUTION_SHEET_ALIASES.distSetupSeed
  )

  const hasWaterfallSheets = Boolean(operatingSheet || capitalSheet || seedOnlySheet)
  const classesSheet = findSheetName(workbook, ['classes', 'class'])

  if (!hasWaterfallSheets && classesSheet) {
    return {
      source: 'class_mapping_seed',
      deals: seedRowsFromClassMappingWorkbook(filePath),
      ignoredPaidSheets,
    }
  }

  if (!hasWaterfallSheets) {
    const found = workbook.SheetNames.join(', ') || '(none)'
    throw new Error(
      `Excel must include Waterfall_Operating / Waterfall_Capital (or Dist_Setup_Seed). Found: ${found}`
    )
  }

  const operatingRows = []
  const capitalRows = []

  if (operatingSheet) {
    const { rows } = readSheetRows(xlsx, workbook, operatingSheet)
    for (const row of rows) {
      const mapped = mapWaterfallExcelRow(row, 'operating')
      if (mapped) operatingRows.push(mapped)
    }
  }

  if (capitalSheet) {
    const { rows } = readSheetRows(xlsx, workbook, capitalSheet)
    for (const row of rows) {
      const mapped = mapWaterfallExcelRow(row, 'capital')
      if (mapped) capitalRows.push(mapped)
    }
  }

  // Combined Dist_Setup_Seed: use `source` / kind placement (operating kinds vs capital)
  if (seedOnlySheet && !operatingSheet && !capitalSheet) {
    const { rows } = readSheetRows(xlsx, workbook, seedOnlySheet)
    for (const row of rows) {
      const kind = normalizeKind(getCellFromRow(row, DIST_ROW_COLUMNS.kind))
      const hint =
        kind === 'LP_PREF' || kind === 'PREF_CURRENT' ? 'operating' : 'capital'
      const mapped = mapWaterfallExcelRow(row, hint)
      if (!mapped) continue
      if (mapped.source === 'operating') operatingRows.push(mapped)
      else capitalRows.push(mapped)
    }
  }

  const allRows = [...operatingRows, ...capitalRows]
  const byDeal = new Map()

  for (const row of allRows) {
    const key = row.dealName || row.dealId || ''
    if (!key) continue
    if (!byDeal.has(key)) {
      byDeal.set(key, {
        dealName: row.dealName,
        dealId: row.dealId,
        rows: [],
      })
    }
    const bucket = byDeal.get(key)
    if (!bucket.dealName && row.dealName) bucket.dealName = row.dealName
    if (!bucket.dealId && row.dealId) bucket.dealId = row.dealId
    bucket.rows.push(row)
  }

  return {
    source: 'excel',
    deals: Array.from(byDeal.values()),
    ignoredPaidSheets,
  }
}

async function ensureDistributionSetupColumn(db) {
  await db.query(`
    ALTER TABLE add_deal_form
    ADD COLUMN IF NOT EXISTS distribution_setup_json TEXT DEFAULT '{}'
  `)
}

async function resolveDealId(db, { dealId, dealName, filterDealId }) {
  if (filterDealId && isValidUuid(filterDealId)) {
    const forced = await db.query(
      'SELECT id, deal_name FROM add_deal_form WHERE id = $1 LIMIT 1',
      [filterDealId]
    )
    if (!forced.rows.length) {
      throw new Error(`Selected deal does not exist: ${filterDealId}`)
    }

    if (dealId && isValidUuid(dealId) && dealId !== filterDealId) return null

    if (dealName) {
      const sameName =
        String(forced.rows[0].deal_name || '').trim().toLowerCase() ===
        dealName.trim().toLowerCase()
      if (!sameName) return null
    }

    return forced.rows[0]
  }

  if (dealId && isValidUuid(dealId)) {
    const byId = await db.query(
      'SELECT id, deal_name FROM add_deal_form WHERE id = $1 LIMIT 1',
      [dealId]
    )
    if (byId.rows.length) return byId.rows[0]
  }

  if (!dealName) {
    throw new Error('deal_name is required to resolve the deal')
  }

  const byName = await db.query(
    `SELECT id, deal_name FROM add_deal_form
     WHERE LOWER(TRIM(deal_name)) = LOWER(TRIM($1))
     ORDER BY created_at DESC
     LIMIT 1`,
    [dealName]
  )
  if (!byName.rows.length) {
    throw new Error(`Deal not found by name: ${dealName}`)
  }
  return byName.rows[0]
}

async function loadDealClasses(db, dealId) {
  const result = await db.query(
    `SELECT id, name, subscription_type
     FROM deal_investor_class
     WHERE deal_id = $1`,
    [dealId]
  )
  const byName = new Map()
  const byId = new Map()
  for (const row of result.rows) {
    byId.set(String(row.id), row)
    byName.set(String(row.name || '').trim().toLowerCase(), row)
  }
  return { byName, byId, rows: result.rows }
}

function resolvePayToIds({ row, classes, unresolved }) {
  const ids = []

  if (row.payToId) {
    if (classes.byId.has(row.payToId)) ids.push(row.payToId)
    else unresolved.push(`class id ${row.payToId} not on deal`)
  }

  for (const name of row.payToNames || []) {
    // Payload may already hold UUIDs in payTo
    if (isValidUuid(name) && classes.byId.has(name)) {
      if (!ids.includes(name)) ids.push(name)
      continue
    }
    const hit = classes.byName.get(String(name).trim().toLowerCase())
    if (!hit) {
      unresolved.push(name)
      continue
    }
    const id = String(hit.id)
    if (!ids.includes(id)) ids.push(id)
  }

  return ids
}

function buildWaterfallsForDeal({ rows, classes }) {
  const unresolved = []
  const operating = []
  const capital = []

  const sorted = [...rows].sort(
    (a, b) => Number(a.rowOrder || 0) - Number(b.rowOrder || 0)
  )

  for (const row of sorted) {
    const payTo = resolvePayToIds({ row, classes, unresolved })
    const payment = {
      id: row.id,
      kind: row.kind,
      name: row.name,
      payTo,
      amountMode: row.amountMode || 'calc',
      inputAmount: row.inputAmount || '0',
      catchupPct:
        row.kind === 'CATCHUP'
          ? row.catchupPct || '20'
          : row.catchupPct || '20',
    }
    if (row.source === 'operating') operating.push(payment)
    else capital.push(payment)
  }

  return {
    waterfalls: { operating, capital },
    unresolved: [...new Set(unresolved)],
  }
}

async function saveDistributionSetup(db, { dealId, waterfalls }) {
  await ensureDistributionSetupColumn(db)
  const existingResult = await db.query(
    'SELECT distribution_setup_json FROM add_deal_form WHERE id = $1 LIMIT 1',
    [dealId]
  )
  const existing = parseDistributionSetupDocument(
    existingResult.rows[0]?.distribution_setup_json
  )
  const json = serializeDistributionSetupJson(waterfalls, existing)
  await db.query(
    `UPDATE add_deal_form
     SET distribution_setup_json = $2
     WHERE id = $1`,
    [dealId, json]
  )
  return json
}

/**
 * @param {{ filePath: string, dealId?: string|null, onRowResult?: Function }} args
 * dealId (optional UI filter) — when set, only that deal is updated.
 */
async function runDistributionSetupEtl({ filePath, dealId = null, onRowResult }) {
  const db = await getPool()
  await ensureDistributionSetupColumn(db)

  const workbook = readDistributionWorkbook(filePath)
  if (!workbook.deals.length) {
    throw new Error('No distribution setup deal groups found in the file')
  }

  logAudit(
    `Distribution Setup ETL | deals=${workbook.deals.length} source=${workbook.source}` +
      (workbook.ignoredPaidSheets.length
        ? ` ignoredPaid=${workbook.ignoredPaidSheets.join('|')}`
        : '')
  )

  let successCount = 0
  let failedCount = 0
  const errors = []
  const dealReports = []
  let rowNumber = 1

  for (const dealGroup of workbook.deals) {
    rowNumber += 1
    try {
      const deal = await resolveDealId(db, {
        dealId: dealGroup.dealId,
        dealName: dealGroup.dealName,
        filterDealId: dealId,
      })

      if (!deal) {
        // Filtered out by UI deal selection
        continue
      }

      if (!dealGroup.rows.length) {
        throw new Error(`No waterfall rows for deal ${dealGroup.dealName || deal.id}`)
      }

      const classes = await loadDealClasses(db, deal.id)
      if (!classes.rows.length) {
        throw new Error(
          `No classes on deal "${deal.deal_name}". Load Class Setup first; Dist Setup does not create classes.`
        )
      }

      const { waterfalls, unresolved } = buildWaterfallsForDeal({
        rows: dealGroup.rows,
        classes,
      })

      if (!waterfalls.operating.length && !waterfalls.capital.length) {
        throw new Error(
          `No valid waterfall rows for deal "${deal.deal_name}" after mapping`
        )
      }

      if (unresolved.length) {
        throw new Error(
          `Unresolved class name(s) for "${deal.deal_name}": ${unresolved.join(', ')}`
        )
      }

      await saveDistributionSetup(db, { dealId: deal.id, waterfalls })

      const report = {
        dealId: deal.id,
        dealName: deal.deal_name,
        operatingCount: waterfalls.operating.length,
        capitalCount: waterfalls.capital.length,
        unresolved: [],
      }
      dealReports.push(report)
      successCount++

      if (onRowResult) {
        const columns = [
          'deal_name',
          ...waterfalls.operating.map((row) => `operating.${row.kind}`),
          ...waterfalls.capital.map((row) => `capital.${row.kind}`),
          'payTo (class UUIDs)',
        ]
        await onRowResult({
          rowNumber,
          success: true,
          entityId: deal.id,
          columnName: columns.join(', '),
          message:
            `Saved distribution_setup_json for "${deal.deal_name}" ` +
            `operating=${report.operatingCount} capital=${report.capitalCount}`,
        })
      }
    } catch (error) {
      failedCount++
      const errorMessage = error.message || 'Distribution setup load failed'
      errors.push({
        rowNumber,
        columnName: 'distribution_setup_json',
        errorType: 'LOAD',
        errorMessage,
      })
      if (onRowResult) {
        await onRowResult({ rowNumber, success: false, errorMessage })
      }
    }
  }

  if (!successCount && !failedCount && dealId) {
    throw new Error(
      'No matching deal groups in the file for the selected Deal Name'
    )
  }

  return {
    source: workbook.source,
    ignoredPaidSheets: workbook.ignoredPaidSheets,
    dealReports,
    totalRecords: workbook.deals.length,
    successCount,
    failedCount,
    errors,
  }
}

module.exports = {
  readDistributionWorkbook,
  runDistributionSetupEtl,
  serializeDistributionSetupJson,
  seedRowsFromClassMappingWorkbook,
}

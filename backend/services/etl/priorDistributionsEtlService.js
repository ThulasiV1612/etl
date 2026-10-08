/**
 * Prior Distributions ETL — Cash Flow paid / Payment details →
 * add_deal_form.distribution_setup_json.priorDistributions
 *
 * Accepts:
 * - ETL_Distributions_Paid_FILLED.xlsx (Prior_Runs + Prior_Investor_Lines)
 * - ETL_Distributions_Paid_FILLED.payload.json
 * - Cash Flow "distributions paid …" Excel (Distributions by investment)
 * - Cash Flow single-period "… distribution (dates)_….xlsx" (Payment details*)
 *
 * Aligns with Investor Portal PriorDistributionRecord (30July2026_latest).
 * Does NOT replace waterfalls.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const xlsx = require('xlsx')
const { getPool } = require('../dbService')
const { isValidUuid } = require('./uuidUtils')
const { logAudit } = require('../logger')
const {
  cleanRawValue,
  getCellFromRow,
  findSheetName,
  readSheetRows,
  normalizeHeaderKey,
} = require('./excelRowUtils')
const {
  isoDateOnly,
  numStr,
  parseDistributionSetupDocument,
  serializeDistributionSetupDocument,
} = require('./distributionSetupJson')

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function moneyNumber(value) {
  const n = Number(numStr(value, '0'))
  return Number.isFinite(n) ? n : 0
}

function isAcquisitionFee(distType, memo = '') {
  // Cash Flow GP acquisition payouts → source=fee + distributionFee.
  // Matches '... Acquisition Fee' and '... Acquisition Share'.
  const blob = `${distType || ''} ${memo || ''}`.toLowerCase()
  if (!blob.trim()) return false
  if (blob.includes('acquisition') && (blob.includes('fee') || blob.includes('share')))
    return true
  const t = String(distType || '').toLowerCase()
  if (t.includes('acquisition') && t.includes('fee')) return true
  return false
}

/** Headers like "Distribute 100% to Class B - General partners - summary" */
const DISTRIBUTE_SUMMARY_RE =
  /^Distribute\s+100%\s+to\s+(.+?)\s+-\s+summary\s*$/i

function findDistribute100ClassNames(row) {
  const found = []
  if (!row || typeof row !== 'object') return found
  for (const [key, value] of Object.entries(row)) {
    const m = String(key || '').trim().match(DISTRIBUTE_SUMMARY_RE)
    if (!m) continue
    const summary = cleanRawValue(value).toLowerCase()
    if (
      !summary ||
      summary === '-' ||
      summary === '—' ||
      summary === '0' ||
      summary === 'none' ||
      summary === 'n/a'
    )
      continue
    const className = cleanRawValue(m[1])
    if (className && !found.includes(className)) found.push(className)
  }
  return found
}

function uniqueClassNames(names) {
  const out = []
  for (const name of names || []) {
    const n = cleanRawValue(name)
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

function inferSource(distType, prefPaid, roc, carried, other, classNames = [], memo = '') {
  const t = norm(distType)
  if (isAcquisitionFee(distType, memo)) return 'fee'
  if (t.includes('return of capital') || t === 'roc' || (roc > 0 && prefPaid <= 0))
    return 'capital'
  if (t.includes('carried') || (carried > 0 && prefPaid <= 0 && other <= 0))
    return 'capital'
  if (t.includes('acquisition') || t.includes('other')) return 'operating'
  if (prefPaid > 0 || t.includes('preferred')) return 'operating'
  if (roc > 0) return 'capital'
  return 'operating'
}

function formatUsdPlain(n) {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0
  return String(Math.round(v * 100) / 100)
}

function buildDistributionFeeConfig({
  distType,
  memo,
  periodStart,
  periodEnd,
  amount,
  classNames,
}) {
  if (!classNames?.length) return null
  if (!isAcquisitionFee(distType, memo)) return null
  const pct = Math.round((100 / classNames.length) * 1e6) / 1e6
  const splits = []
  let remaining = 100
  classNames.forEach((name, i) => {
    const share = i === classNames.length - 1 ? remaining : pct
    remaining = Math.round((remaining - share) * 1e6) / 1e6
    splits.push({
      classId: '',
      className: name,
      percent: String(share),
    })
  })
  const feeName = memo || distType || 'Distribution fee'
  const feeType = 'Acquisition fee'
  return {
    name: feeName,
    type: feeType,
    typeOptions: [feeType],
    cashAvailable: formatUsdPlain(amount),
    periodFactor: '0.083333',
    periodStart: periodStart || '',
    periodEnd: periodEnd || '',
    classSplits: splits,
  }
}

/**
 * Map Cash Flow "Distribution type" → portal PriorDistributionRecord.distributionType
 * (Deal → Distributions table Type column).
 */
function mapDistributionType(cashFlowType, source) {
  const t = norm(cashFlowType)
  const src = norm(source)
  if (src === 'fee' || src === 'distribution_fee') return 'acquisition_fee'
  if (!t) {
    if (src === 'gp_payment') return 'return_on_capital'
    return src === 'capital' ? 'return_of_capital' : 'preferred_return'
  }
  if (t.includes('acquisition') && t.includes('fee')) return 'acquisition_fee'
  if (/\breturn\s+on\s+capital\b/.test(t)) return 'return_on_capital'
  if (t.includes('return of capital') || t === 'roc') return 'return_of_capital'
  if (t.includes('promote') || t.includes('carried')) return 'promote'
  if (t.includes('preferred') || t === 'pref') return 'preferred_return'
  if (t.includes('acquisition')) return 'acquisition_fee'
  if (t.includes('other')) return 'other'
  return cleanRawValue(cashFlowType) || 'preferred_return'
}

function mapDeductsFrom(distributionType, source) {
  const t = norm(distributionType)
  const src = norm(source)
  if (
    src === 'fee' ||
    src === 'distribution_fee' ||
    t.includes('acquisition') ||
    t === 'acquisition_fee'
  )
    return 'fee'
  if (
    src === 'capital' ||
    t === 'return_of_capital' ||
    t.includes('return of capital') ||
    t === 'roc'
  )
    return 'capital'
  if (src === 'gp_payment' || src === 'gp payment') return 'accrued_pref'
  if (t.includes('current')) return 'current_pref'
  return 'accrued_pref'
}

function normalizePriorSource(source) {
  const s = norm(source)
  if (s === 'capital') return 'capital'
  if (s === 'fee' || s === 'distribution_fee') return 'fee'
  if (s === 'gp_payment' || s === 'gp payment' || s === 'gppayment') return 'gp_payment'
  return 'operating'
}

function parsePayloadFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const data = JSON.parse(raw)
  const runs = data.prior_distributions || data.priorDistributions || []
  if (!Array.isArray(runs) || !runs.length) {
    throw new Error('No prior_distributions found in payload JSON')
  }
  const topFee = data.distribution_fee || data.distributionFee || null
  return {
    source: 'json',
    dealName: cleanRawValue(data.deal_name || data.dealName),
    dealId: cleanRawValue(data.deal_id || data.dealId),
    distributionFee: topFee,
    runs: runs.map((run) =>
      normalizeIncomingRun({
        ...run,
        distribution_fee:
          run.distribution_fee ||
          run.distributionFee ||
          (run.is_distribution_fee || run.source === 'fee' ? topFee : null),
      })
    ),
  }
}

function normalizeIncomingRun(run) {
  const fee =
    run.distribution_fee ||
    run.distributionFee ||
    null
  const sourceRaw = cleanRawValue(run.source) || 'operating'
  const source =
    fee || run.is_distribution_fee
      ? 'fee'
      : normalizePriorSource(sourceRaw)
  return {
    source,
    amount: moneyNumber(run.amount),
    date: isoDateOnly(run.date) || cleanRawValue(run.date),
    name: cleanRawValue(run.name),
    notes: cleanRawValue(run.notes),
    period: cleanRawValue(run.period) || 'monthly',
    periodStart: isoDateOnly(run.periodStart || run.period_start),
    periodEnd: isoDateOnly(run.periodEnd || run.period_end),
    paymentDate: isoDateOnly(run.paymentDate || run.payment_date),
    distributionType: cleanRawValue(
      run.distributionType ||
        run.distribution_type ||
        run.cash_flow_distribution_type
    ),
    cash_flow_distribution_type: cleanRawValue(
      run.cash_flow_distribution_type || run.distributionType
    ),
    investorPayments: Array.isArray(run.investorPayments)
      ? run.investorPayments
      : Array.isArray(run.investor_payments)
        ? run.investor_payments
        : [],
    line_count: Number(run.line_count || 0),
    distribution_fee: fee,
    is_distribution_fee: Boolean(fee) || source === 'fee',
  }
}

function parseFilledPaidWorkbook(workbook) {
  const metaSheet = findSheetName(workbook, ['deal_meta', 'deal meta'])
  const runsSheet = findSheetName(workbook, ['prior_runs', 'prior runs'])
  const linesSheet = findSheetName(workbook, [
    'prior_investor_lines',
    'prior investor lines',
  ])
  const feeSheet = findSheetName(workbook, [
    'distribution_fee',
    'distribution fee',
    'pct_distribution_fee',
    '% distribution fee',
  ])

  if (!runsSheet) return null

  let dealName = ''
  let dealId = ''
  if (metaSheet) {
    const { rows } = readSheetRows(xlsx, workbook, metaSheet)
    if (rows[0]) {
      dealName = cleanRawValue(getCellFromRow(rows[0], ['deal_name', 'deal name']))
      dealId = cleanRawValue(getCellFromRow(rows[0], ['deal_id', 'deal id']))
    }
  }

  let distributionFee = null
  if (feeSheet) {
    const { rows: feeRows } = readSheetRows(xlsx, workbook, feeSheet)
    if (feeRows[0]) {
      const row = feeRows[0]
      const className = cleanRawValue(
        getCellFromRow(row, ['class_name', 'class name', 'fee_class_name'])
      )
      const percent = cleanRawValue(
        getCellFromRow(row, ['percent', 'class_percent', 'pct'])
      ) || '100'
      distributionFee = {
        name: cleanRawValue(getCellFromRow(row, ['name', 'fee_name'])) ||
          'Distribution fee',
        type: cleanRawValue(getCellFromRow(row, ['type', 'fee_type'])) ||
          'Acquisition fee',
        typeOptions: [
          cleanRawValue(getCellFromRow(row, ['type', 'fee_type'])) ||
            'Acquisition fee',
        ],
        cashAvailable: cleanRawValue(
          getCellFromRow(row, ['cash_available', 'cash available', 'amount'])
        ),
        periodFactor: cleanRawValue(
          getCellFromRow(row, ['period_factor', 'period factor'])
        ) || '0.083333',
        periodStart: isoDateOnly(
          getCellFromRow(row, ['period_start', 'period start'])
        ),
        periodEnd: isoDateOnly(
          getCellFromRow(row, ['period_end', 'period end'])
        ),
        classSplits: className
          ? [{ classId: '', className, percent }]
          : [],
      }
      // Extra split rows (same sheet, more class lines)
      for (let i = 1; i < feeRows.length; i += 1) {
        const extraName = cleanRawValue(
          getCellFromRow(feeRows[i], ['class_name', 'class name'])
        )
        if (!extraName) continue
        distributionFee.classSplits.push({
          classId: '',
          className: extraName,
          percent:
            cleanRawValue(
              getCellFromRow(feeRows[i], ['percent', 'class_percent', 'pct'])
            ) || '0',
        })
      }
    }
  }

  const { rows: runRows } = readSheetRows(xlsx, workbook, runsSheet)
  const linesByKey = new Map()
  if (linesSheet) {
    const { rows: lineRows } = readSheetRows(xlsx, workbook, linesSheet)
    for (const row of lineRows) {
      const runOrder = cleanRawValue(getCellFromRow(row, ['run_order', 'run order']))
      const runDate = cleanRawValue(getCellFromRow(row, ['run_date', 'date']))
      const runName = cleanRawValue(getCellFromRow(row, ['run_name', 'name']))
      const runAmount = formatUsdPlain(
        moneyNumber(getCellFromRow(row, ['run_amount', 'run amount', 'amount']))
      )
      // Prefer amount (and order) so same-named runs (e.g. three "Q1 2023") stay separate.
      const key = runOrder
        ? `order:${runOrder}`
        : runAmount && runAmount !== '0'
          ? `${runDate}||${runName}||${runAmount}`
          : `${runDate}||${runName}`
      if (!linesByKey.has(key)) linesByKey.set(key, [])
      linesByKey.get(key).push({
        source_investment_id: cleanRawValue(
          getCellFromRow(row, ['source_investment_id', 'unique investment id'])
        ),
        investorName: cleanRawValue(
          getCellFromRow(row, ['investor_name', 'investor name'])
        ),
        profileName: cleanRawValue(
          getCellFromRow(row, ['profile_name', 'investment profile name'])
        ),
        className: cleanRawValue(getCellFromRow(row, ['class_name', 'class name'])),
        classId: cleanRawValue(getCellFromRow(row, ['class_id', 'class id'])),
        investorId: cleanRawValue(getCellFromRow(row, ['investor_id', 'investor id'])),
        capital: moneyNumber(getCellFromRow(row, ['capital'])),
        percentOfClass: moneyNumber(
          getCellFromRow(row, ['percent_of_class', 'percent of class'])
        ),
        payment: moneyNumber(getCellFromRow(row, ['payment', 'net payment'])),
        distribution_method: cleanRawValue(
          getCellFromRow(row, ['distribution_method', 'distribution method'])
        ),
      })
    }
  }

  const runs = runRows
    .map((row, index) => {
      const date = isoDateOnly(getCellFromRow(row, ['date', 'run_date']))
      const name = cleanRawValue(getCellFromRow(row, ['name', 'run_name']))
      const amount = moneyNumber(getCellFromRow(row, ['amount']))
      const runOrder =
        cleanRawValue(getCellFromRow(row, ['run_order', 'run order'])) ||
        String(index + 1)
      const amountKey = formatUsdPlain(amount)
      const keyByOrder = `order:${runOrder}`
      const keyByAmount = `${date}||${name}||${amountKey}`
      const keyByName = `${date}||${name}`
      const payments =
        linesByKey.get(keyByOrder) ||
        linesByKey.get(keyByAmount) ||
        linesByKey.get(keyByName) ||
        []
      const distType = cleanRawValue(
        getCellFromRow(row, [
          'distribution_type',
          'distribution type',
          'cash_flow_distribution_type',
        ])
      )
      const source = cleanRawValue(getCellFromRow(row, ['source'])) || 'operating'
      const isFee =
        normalizePriorSource(source) === 'fee' || isAcquisitionFee(distType)
      return normalizeIncomingRun({
        source,
        amount,
        date,
        name,
        notes: cleanRawValue(getCellFromRow(row, ['notes'])),
        period: cleanRawValue(getCellFromRow(row, ['period'])) || 'monthly',
        periodStart: getCellFromRow(row, ['period_start', 'period start', 'periodStart']),
        periodEnd: getCellFromRow(row, ['period_end', 'period end', 'periodEnd']),
        paymentDate: getCellFromRow(row, [
          'payment_date',
          'payment date',
          'paymentDate',
          'payment initiated on',
        ]),
        distributionType: distType,
        cash_flow_distribution_type: distType,
        investorPayments: payments,
        line_count: Number(
          cleanRawValue(getCellFromRow(row, ['line_count'])) || 0
        ),
        distribution_fee: isFee ? distributionFee : null,
        is_distribution_fee: isFee && Boolean(distributionFee),
      })
    })
    .filter((run) => run.date || run.name)

  if (!runs.length) {
    throw new Error('No prior distribution runs found in Prior_Runs sheet')
  }

  return {
    source: 'xlsx-filled',
    dealName,
    dealId,
    distributionFee,
    runs,
  }
}

/**
 * Detect Cash Flow investor-line header row (Deal name + Unique investment ID + Net payment).
 */
function findCashFlowHeaderRow(matrix) {
  const maxScan = Math.min(25, matrix.length)
  for (let i = 0; i < maxScan; i += 1) {
    const row = matrix[i] || []
    const keys = row.map((c) => normalizeHeaderKey(c))
    const hasDeal = keys.some((k) => k === 'deal name')
    const hasInvestId = keys.some(
      (k) => k === 'unique investment id' || k === 'source investment id'
    )
    const hasNet = keys.some((k) => k === 'net payment')
    if (hasDeal && hasInvestId && hasNet) return i
    if (hasDeal && hasInvestId && keys.some((k) => k === 'distribution memo'))
      return i
  }
  return -1
}

function matrixToObjects(matrix, headerRowIndex) {
  const headers = (matrix[headerRowIndex] || []).map((h) =>
    String(h == null ? '' : h).trim()
  )
  const out = []
  for (let r = headerRowIndex + 1; r < matrix.length; r += 1) {
    const cells = matrix[r] || []
    if (!cells.some((c) => c != null && String(c).trim() !== '')) continue
    const obj = {}
    for (let c = 0; c < headers.length; c += 1) {
      if (!headers[c]) continue
      obj[headers[c]] = cells[c]
    }
    out.push(obj)
  }
  return out
}

function pickCashFlowSheet(workbook) {
  const names = workbook.SheetNames || []
  const byInvestment = findSheetName(workbook, [
    'distributions by investment',
    'paid by investment',
    'paid_by_investment',
  ])
  if (byInvestment) return byInvestment

  const paymentDetails = names.find((n) =>
    normalizeHeaderKey(n).startsWith('payment details')
  )
  if (paymentDetails) return paymentDetails

  for (const name of names) {
    const sheet = workbook.Sheets[name]
    const matrix = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: false,
    })
    if (findCashFlowHeaderRow(matrix) >= 0) return name
  }
  return null
}

function buildRunsFromCashFlowRows(rows) {
  const groups = new Map()
  let dealName = ''

  for (const row of rows) {
    const deal = cleanRawValue(getCellFromRow(row, ['deal name', 'deal_name']))
    if (deal) dealName = deal

    const memo =
      cleanRawValue(
        getCellFromRow(row, ['distribution memo', 'distribution_memo'])
      ) ||
      cleanRawValue(
        getCellFromRow(row, ['distribution type', 'distribution_type'])
      ) ||
      'Distribution'
    const distType = cleanRawValue(
      getCellFromRow(row, ['distribution type', 'distribution_type'])
    )
    const periodStart = isoDateOnly(
      getCellFromRow(row, ['period start date', 'period start', 'period_start'])
    )
    const periodEnd = isoDateOnly(
      getCellFromRow(row, [
        'period end date',
        'period end',
        'period_end',
        'payment initiated on',
      ])
    )
    const paymentDate = isoDateOnly(
      getCellFromRow(row, [
        'payment initiated on',
        'payment date',
        'payment_date',
        'period end date',
      ])
    )
    const net = moneyNumber(getCellFromRow(row, ['net payment', 'payment']))
    if (net < 0) continue

    // Keep $0 lines so every investor on the run appears in Distribution Details
    const hasInvestor = Boolean(
      cleanRawValue(
        getCellFromRow(row, ['unique investment id', 'source_investment_id'])
      ) ||
        cleanRawValue(getCellFromRow(row, ['investor name'])) ||
        cleanRawValue(
          getCellFromRow(row, ['investment profile name', 'profile name'])
        )
    )
    if (!hasInvestor) continue

    const key = `${periodEnd}|${memo}|${distType}|${periodStart}`
    if (!groups.has(key)) {
      groups.set(key, {
        periodStart,
        periodEnd,
        paymentDate,
        memo,
        distType,
        lines: [],
      })
    }
    groups.get(key).lines.push(row)
  }

  const runs = []
  const sorted = [...groups.values()].sort((a, b) =>
    String(a.periodEnd || '').localeCompare(String(b.periodEnd || ''))
  )

  for (const group of sorted) {
    let total = 0
    let prefSum = 0
    let rocSum = 0
    let carriedSum = 0
    let otherSum = 0
    const investorPayments = []

    for (const row of group.lines) {
      const net = moneyNumber(getCellFromRow(row, ['net payment', 'payment']))
      const pref = moneyNumber(
        getCellFromRow(row, [
          'preferred return paid (by distribution)',
          'preferred return paid',
        ])
      )
      const roc = moneyNumber(getCellFromRow(row, ['return of capital']))
      const carried = moneyNumber(getCellFromRow(row, ['carried interest paid']))
      const other = moneyNumber(getCellFromRow(row, ['other payment']))
      prefSum += pref
      rocSum += roc
      carriedSum += carried > 0 ? carried : 0
      otherSum += other
      total += net

      const capital = moneyNumber(
        getCellFromRow(row, [
          'outstanding capital',
          'initial investment amount',
        ])
      )
      let pct = moneyNumber(
        getCellFromRow(row, [
          'percentage of offering',
          'percent of class',
          'percent of distribution',
        ])
      )
      if (pct > 0 && pct <= 1) pct = Math.round(pct * 1000000) / 10000

      investorPayments.push({
        source_investment_id: cleanRawValue(
          getCellFromRow(row, ['unique investment id', 'source_investment_id'])
        ),
        investorName: cleanRawValue(getCellFromRow(row, ['investor name'])),
        profileName: cleanRawValue(
          getCellFromRow(row, ['investment profile name', 'profile name'])
        ),
        className: cleanRawValue(getCellFromRow(row, ['class name'])),
        classId: '',
        investorId: '',
        capital,
        percentOfClass: pct,
        payment: net,
        distribution_method: cleanRawValue(
          getCellFromRow(row, [
            'distribution method',
            'selected distribution method',
          ])
        ),
      })
    }

    if (total <= 0) continue

    const date =
      group.periodEnd ||
      group.paymentDate ||
      new Date().toISOString().slice(0, 10)

    const feeClassNames = []
    for (const row of group.lines) {
      for (const name of findDistribute100ClassNames(row)) {
        if (!feeClassNames.includes(name)) feeClassNames.push(name)
      }
    }
    const classNames = uniqueClassNames(
      investorPayments.map((line) => line.className)
    )
    // Acquisition fee by type OR memo (e.g. "Harris Ridge Acquisition Fee" /
    // "GP Acquisition Fee") even when Cash Flow type is "Return on capital".
    let resolvedFeeClasses = [...feeClassNames]
    const isFee = isAcquisitionFee(group.distType, group.memo)
    if (isFee && !resolvedFeeClasses.length) resolvedFeeClasses = [...classNames]
    const source =
      isFee && resolvedFeeClasses.length
        ? 'fee'
        : inferSource(
            group.distType,
            prefSum,
            rocSum,
            carriedSum,
            otherSum,
            classNames,
            group.memo
          )
    const feeConfig =
      source === 'fee'
        ? buildDistributionFeeConfig({
            distType: group.distType,
            memo: group.memo,
            periodStart: group.periodStart,
            periodEnd: group.periodEnd || date,
            amount: total,
            classNames: resolvedFeeClasses,
          })
        : null

    runs.push(
      normalizeIncomingRun({
        source,
        amount: total,
        date,
        name: group.memo,
        notes:
          `Cash Flow import | type=${group.distType || '—'} | ` +
          `pref=${prefSum.toFixed(2)} roc=${rocSum.toFixed(2)} ` +
          `other=${otherSum.toFixed(2)} carried=${carriedSum.toFixed(2)}` +
          (feeConfig
            ? ` | distributionFee classes=${resolvedFeeClasses.join(', ')}`
            : ''),
        period: 'monthly',
        periodStart: group.periodStart,
        periodEnd: group.periodEnd || date,
        paymentDate: group.paymentDate || date,
        distributionType: group.distType,
        cash_flow_distribution_type: group.distType,
        investorPayments,
        line_count: investorPayments.length,
        distribution_fee: feeConfig,
        is_distribution_fee: Boolean(feeConfig),
      })
    )
  }

  return { dealName, runs }
}

function parseCashFlowWorkbook(workbook) {
  const sheetName = pickCashFlowSheet(workbook)
  if (!sheetName) return null

  const sheet = workbook.Sheets[sheetName]
  const matrix = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  })
  const headerIdx = findCashFlowHeaderRow(matrix)
  if (headerIdx < 0) return null

  const rows = matrixToObjects(matrix, headerIdx)
  const { dealName, runs } = buildRunsFromCashFlowRows(rows)
  if (!runs.length) {
    throw new Error(
      `No paid rows with Net payment > 0 found on sheet "${sheetName}"`
    )
  }
  return {
    source: `cashflow:${sheetName}`,
    dealName,
    dealId: '',
    distributionFee:
      runs.map((r) => r.distribution_fee).find(Boolean) || null,
    runs,
  }
}

function parsePaidWorkbook(filePath) {
  // Prefer raw Excel serials for dates — cellDates + local TZ shifts calendar day
  const workbook = xlsx.readFile(filePath, { cellDates: false })
  const filled = parseFilledPaidWorkbook(workbook)
  if (filled) return filled

  const cashFlow = parseCashFlowWorkbook(workbook)
  if (cashFlow) return cashFlow

  throw new Error(
    'Excel must be ETL_Distributions_Paid_FILLED (Prior_Runs) or a Cash Flow ' +
      '"Distributions by investment" / "Payment details" workbook'
  )
}

function readPriorWorkbook(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.json') return parsePayloadFile(filePath)
  if (ext === '.xlsx' || ext === '.xls') return parsePaidWorkbook(filePath)
  throw new Error(
    'Upload Cash Flow paid/Payment details Excel, ETL_Distributions_Paid_FILLED.xlsx, or .payload.json'
  )
}

async function ensureDistributionSetupColumn(db) {
  await db.query(`
    ALTER TABLE add_deal_form
    ADD COLUMN IF NOT EXISTS distribution_setup_json TEXT DEFAULT '{}'
  `)
}

async function resolveDeal(db, { dealId, dealName, filterDealId }) {
  if (filterDealId && isValidUuid(filterDealId)) {
    const filtered = await db.query(
      'SELECT id, deal_name, distribution_setup_json FROM add_deal_form WHERE id = $1 LIMIT 1',
      [filterDealId]
    )
    if (!filtered.rows.length) throw new Error(`Deal not found: ${filterDealId}`)
    return filtered.rows[0]
  }

  if (dealId && isValidUuid(dealId)) {
    const byId = await db.query(
      'SELECT id, deal_name, distribution_setup_json FROM add_deal_form WHERE id = $1 LIMIT 1',
      [dealId]
    )
    if (byId.rows.length) return byId.rows[0]
  }

  if (dealName) {
    const byName = await db.query(
      `SELECT id, deal_name, distribution_setup_json FROM add_deal_form
       WHERE LOWER(TRIM(deal_name)) = LOWER(TRIM($1))
       LIMIT 1`,
      [dealName]
    )
    if (byName.rows.length) return byName.rows[0]
  }

  throw new Error(
    `Could not resolve deal for prior distributions` +
      (dealName ? ` (deal_name="${dealName}")` : '')
  )
}

async function loadClassMap(db, dealId) {
  const result = await db.query(
    `SELECT id, name FROM deal_investor_class WHERE deal_id = $1`,
    [dealId]
  )
  const map = new Map()
  for (const row of result.rows) {
    const name = cleanRawValue(row.name)
    if (!name) continue
    map.set(name, row.id)
    map.set(norm(name), row.id)
  }
  return map
}

function resolveClassId(classMap, className) {
  const name = cleanRawValue(className)
  if (!name) return ''
  if (classMap.has(name)) return classMap.get(name)
  if (classMap.has(norm(name))) return classMap.get(norm(name))
  const target = norm(name)
  for (const [key, id] of classMap.entries()) {
    const kn = norm(key)
    if (!kn) continue
    if (kn === target || kn.includes(target) || target.includes(kn)) return id
  }
  return ''
}

function resolveDistributionFee(fee, classMap) {
  if (!fee || typeof fee !== 'object') return null
  const splitsRaw = Array.isArray(fee.classSplits)
    ? fee.classSplits
    : Array.isArray(fee.class_splits)
      ? fee.class_splits
      : []
  const classSplits = splitsRaw
    .map((s) => {
      if (!s || typeof s !== 'object') return null
      const className = cleanRawValue(s.className || s.class_name)
      const classId =
        cleanRawValue(s.classId || s.class_id) ||
        resolveClassId(classMap, className)
      if (!classId) return null
      return {
        classId,
        percent: numStr(s.percent ?? s.pct ?? s.percentage, '0'),
      }
    })
    .filter(Boolean)
  if (!classSplits.length) return null
  const feeName =
    cleanRawValue(fee.name) || cleanRawValue(fee.type) || 'Distribution fee'
  const feeType =
    cleanRawValue(fee.type) || cleanRawValue(fee.name) || 'Acquisition fee'
  const typeOptions = Array.isArray(fee.typeOptions)
    ? fee.typeOptions.map((t) => cleanRawValue(t)).filter(Boolean)
    : []
  if (feeType && !typeOptions.some((t) => norm(t) === norm(feeType)))
    typeOptions.unshift(feeType)
  return {
    name: feeName,
    type: feeType,
    typeOptions,
    cashAvailable: numStr(fee.cashAvailable ?? fee.cash_available, '0'),
    periodFactor: cleanRawValue(fee.periodFactor || fee.period_factor) || '0.083333',
    periodStart: isoDateOnly(fee.periodStart || fee.period_start) || '',
    periodEnd: isoDateOnly(fee.periodEnd || fee.period_end) || '',
    classSplits,
  }
}

async function loadInvestmentIndex(db, dealId) {
  const result = await db.query(
    `SELECT
       di.id,
       di.contact_id,
       di.contact_display_name,
       di.investor_class,
       di.esign_status_json,
       COALESCE(uip.profile_name, '') AS profile_name
     FROM deal_investment di
     LEFT JOIN user_investor_profiles uip ON uip.id = di.user_investor_profile_id
     WHERE di.deal_id = $1`,
    [dealId]
  )

  return result.rows.map((row) => {
    let sourceInvestmentId = ''
    try {
      const parsed = row.esign_status_json
        ? typeof row.esign_status_json === 'string'
          ? JSON.parse(row.esign_status_json)
          : row.esign_status_json
        : null
      sourceInvestmentId = cleanRawValue(parsed?.sourceInvestmentId || '')
    } catch {
      sourceInvestmentId = ''
    }
    return {
      id: row.id,
      contactId: cleanRawValue(row.contact_id),
      displayName: cleanRawValue(row.contact_display_name),
      className: cleanRawValue(row.investor_class),
      profileName: cleanRawValue(row.profile_name),
      sourceInvestmentId,
    }
  })
}

function matchInvestment(line, index) {
  const srcId = cleanRawValue(line.source_investment_id || line.sourceInvestmentId)
  if (srcId) {
    const bySource = index.find(
      (row) => row.sourceInvestmentId === srcId || row.id === srcId
    )
    if (bySource) return bySource
  }

  const profile = norm(line.profileName)
  const investor = norm(line.investorName)
  const className = norm(line.className)

  if (profile) {
    const hit = index.find(
      (row) =>
        norm(row.profileName) === profile &&
        (!className || norm(row.className) === className)
    )
    if (hit) return hit
  }

  if (investor) {
    const hit = index.find(
      (row) =>
        norm(row.displayName) === investor &&
        (!className || norm(row.className) === className)
    )
    if (hit) return hit
    const loose = index.find((row) => norm(row.displayName) === investor)
    if (loose) return loose
  }

  if (profile) {
    const loose = index.find((row) => norm(row.profileName) === profile)
    if (loose) return loose
  }

  return null
}

function resolveRunPayments(run, classMap, investmentIndex) {
  const warnings = []
  const payments = []
  let skippedZeroUnmatched = 0
  const seenExact = new Set()

  for (const line of run.investorPayments || []) {
    const payment = moneyNumber(line.payment)
    if (payment < 0) continue

    const className = cleanRawValue(line.className)
    const classId =
      cleanRawValue(line.classId) ||
      classMap.get(className) ||
      classMap.get(norm(className)) ||
      ''

    const matched = matchInvestment(line, investmentIndex)
    let investorId = cleanRawValue(line.investorId)
    let contactId = ''
    if (matched) {
      investorId = matched.id
      contactId = matched.contactId
    } else {
      // A $0 line only adds value when the investor exists on the deal;
      // never invent a placeholder investor for it.
      if (payment === 0) {
        skippedZeroUnmatched += 1
        continue
      }
      investorId = investorId || cleanRawValue(line.source_investment_id)
      if (!investorId) {
        warnings.push(
          `unmatched line ${line.investorName || line.profileName || '—'}`
        )
        continue
      }
      warnings.push(
        `unresolved investor for ${line.profileName || line.investorName} — using ${investorId}`
      )
    }

    const exactKey = [
      investorId,
      cleanRawValue(line.source_investment_id || line.sourceInvestmentId),
      numStr(payment, '0'),
      numStr(line.capital, '0'),
      classId || className,
    ].join('|')
    if (seenExact.has(exactKey)) continue
    seenExact.add(exactKey)

    const row = {
      investorId,
      investorName: cleanRawValue(line.investorName || line.profileName) || '—',
      classId,
      className: className || '—',
      capital: numStr(line.capital, '0'),
      percentOfClass: numStr(line.percentOfClass, '0'),
      payment: numStr(payment, '0'),
    }
    if (contactId) row.contactId = contactId
    payments.push(row)
  }

  if (skippedZeroUnmatched) {
    warnings.push(
      `skipped ${skippedZeroUnmatched} zero-payment line(s) — those investors are not loaded on this deal yet`
    )
  }

  return { payments, warnings }
}

function priorRunKey(run) {
  // Identity = same Cash Flow memo + period (not distributionType/source).
  // Re-uploads that remap operating/gp_payment → fee must replace, not duplicate.
  return [
    isoDateOnly(run.periodStart) || '',
    isoDateOnly(run.periodEnd) || isoDateOnly(run.date) || '',
    cleanRawValue(run.name).toLowerCase(),
    formatUsdPlain(moneyNumber(run.amount)),
  ].join('|')
}

function priorRunSoftKey(run) {
  // Broader match when periodStart was missing on an older import
  return [
    isoDateOnly(run.periodEnd) || isoDateOnly(run.date) || '',
    cleanRawValue(run.name).toLowerCase(),
    formatUsdPlain(moneyNumber(run.amount)),
  ].join('|')
}

async function savePriorDistributions(db, {
  dealId,
  existingJson,
  resolvedRuns,
  distributionFee = null,
}) {
  const current = parseDistributionSetupDocument(existingJson)
  const existing = Array.isArray(current.priorDistributions)
    ? [...current.priorDistributions]
    : []
  const byKey = new Map()
  const bySoftKey = new Map()
  for (const row of existing) {
    byKey.set(priorRunKey(row), row)
    bySoftKey.set(priorRunSoftKey(row), row)
  }

  let inserted = 0
  let updated = 0
  const stamped = resolvedRuns.map((run, index) => {
    const source = normalizePriorSource(run.source)
    const distributionType = mapDistributionType(
      run.distributionType || run.cash_flow_distribution_type,
      source
    )
    const date = isoDateOnly(run.date) || run.date
    const periodStart = isoDateOnly(run.periodStart) || ''
    const periodEnd = isoDateOnly(run.periodEnd) || date
    const paymentDate = isoDateOnly(run.paymentDate) || date
    const name =
      cleanRawValue(run.name) ||
      (source === 'fee'
        ? `Distribution Fee · ${date}`
        : source === 'capital'
          ? `Capital event · ${date}`
          : source === 'gp_payment'
            ? `GP payment · ${date}`
            : `Operating · ${date}`)
    const next = {
      id: crypto.randomUUID(),
      source,
      amount: formatUsdPlain(moneyNumber(run.amount)),
      date,
      name,
      notes: run.notes || '',
      period: run.period || 'monthly',
      periodStart: periodStart || undefined,
      periodEnd: periodEnd || undefined,
      paymentDate: paymentDate || undefined,
      distributionType,
      deductsFrom: mapDeductsFrom(distributionType, source),
      visible: true,
      investorPayments: run.investorPayments || [],
      importedAt: new Date().toISOString(),
      _index: index,
    }
    const key = priorRunKey(next)
    const soft = priorRunSoftKey(next)
    const prev = byKey.get(key) || bySoftKey.get(soft)
    if (prev?.id) {
      next.id = prev.id
      updated += 1
    } else {
      inserted += 1
    }
    byKey.set(key, next)
    bySoftKey.set(soft, next)
    return next
  })

  // Keep unrelated existing priors; replace matches by full or soft key
  // (so remapped fee vs gp_payment/operating for same memo+period don't duplicate).
  const stampedKeys = new Set(stamped.map((r) => priorRunKey(r)))
  const stampedSoft = new Set(stamped.map((r) => priorRunSoftKey(r)))
  const kept = existing.filter(
    (r) =>
      !stampedKeys.has(priorRunKey(r)) && !stampedSoft.has(priorRunSoftKey(r))
  )
  const nextPriors = [...kept, ...stamped]
    .map(({ _index, ...rest }) => rest)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))

  const nextFee =
    distributionFee != null ? distributionFee : current.distributionFee

  const nextJson = serializeDistributionSetupDocument({
    waterfalls: current.waterfalls || { operating: [], capital: [] },
    priorDistributions: nextPriors,
    setupName: current.setupName,
    dayCountMode: current.dayCountMode,
    defaultAccrualStartIso: current.defaultAccrualStartIso,
    classes: current.classes,
    promote: current.promote,
    distributionFee: nextFee,
  })

  await db.query(
    `UPDATE add_deal_form
     SET distribution_setup_json = $2
     WHERE id = $1`,
    [dealId, nextJson]
  )

  const parsed = JSON.parse(nextJson)
  return {
    savedCount: stamped.length,
    insertedCount: inserted,
    updatedCount: updated,
    totalPrior: (parsed.priorDistributions || []).length,
    hasDistributionFee: Boolean(parsed.distributionFee),
  }
}

/**
 * @param {{ filePath: string, dealId?: string|null, onRowResult?: Function }} args
 */
async function runPriorDistributionsEtl({ filePath, dealId = null, onRowResult }) {
  const db = await getPool()
  await ensureDistributionSetupColumn(db)

  const workbook = readPriorWorkbook(filePath)
  if (!workbook.runs.length) {
    throw new Error('No prior distribution runs found in the file')
  }

  logAudit(
    `Prior Distributions ETL | runs=${workbook.runs.length} source=${workbook.source}`
  )

  const deal = await resolveDeal(db, {
    dealId: workbook.dealId,
    dealName: workbook.dealName,
    filterDealId: dealId,
  })

  const classMap = await loadClassMap(db, deal.id)
  const investmentIndex = await loadInvestmentIndex(db, deal.id)

  let successCount = 0
  let failedCount = 0
  const allWarnings = []
  const resolvedRuns = []

  for (let i = 0; i < workbook.runs.length; i += 1) {
    const run = workbook.runs[i]
    const rowNumber = i + 1
    try {
      const { payments, warnings } = resolveRunPayments(
        run,
        classMap,
        investmentIndex
      )
      allWarnings.push(...warnings.map((w) => `Run ${rowNumber}: ${w}`))

      if (!payments.length) {
        throw new Error('No investor payment lines could be resolved for this run')
      }

      resolvedRuns.push({
        source: run.source || 'operating',
        amount: run.amount,
        date: run.date,
        name: run.name,
        notes: run.notes || '',
        period: run.period || 'monthly',
        periodStart: run.periodStart || '',
        periodEnd: run.periodEnd || run.date || '',
        paymentDate: run.paymentDate || run.date || '',
        distributionType:
          run.distributionType || run.cash_flow_distribution_type || '',
        investorPayments: payments,
        distribution_fee: run.distribution_fee || null,
      })
      successCount += 1
      if (onRowResult) {
        await onRowResult({
          rowNumber,
          success: true,
          entityId: deal.id,
          columnName: 'priorDistributions',
          message: `Prepared prior run "${run.name}" (${payments.length} payment line(s))` +
            (run.distribution_fee ? ' + Distribution Fee tab' : ''),
        })
      }
    } catch (error) {
      failedCount += 1
      if (onRowResult) {
        await onRowResult({
          rowNumber,
          success: false,
          columnName: 'priorDistributions',
          errorMessage: error.message,
        })
      }
    }
  }

  if (!resolvedRuns.length) {
    throw new Error('No prior distribution runs could be prepared for load')
  }

  const feeCandidate =
    workbook.distributionFee ||
    resolvedRuns.map((r) => r.distribution_fee).find(Boolean) ||
    null
  const resolvedFee = resolveDistributionFee(feeCandidate, classMap)
  if (feeCandidate && !resolvedFee) {
    allWarnings.push(
      'Acquisition fee Distribute-100% class name(s) could not be matched to deal_investor_class — Distribution Fee tab not saved'
    )
  }

  const saveResult = await savePriorDistributions(db, {
    dealId: deal.id,
    existingJson: deal.distribution_setup_json,
    resolvedRuns,
    distributionFee: resolvedFee,
  })

  if (onRowResult) {
    await onRowResult({
      rowNumber: workbook.runs.length + 1,
      success: true,
      entityId: deal.id,
      columnName: 'distribution_setup_json',
      message:
        `Appended ${saveResult.savedCount} prior run(s) for "${deal.deal_name}" ` +
        `(total prior=${saveResult.totalPrior}` +
        (saveResult.hasDistributionFee ? ', distributionFee saved' : '') +
        `)`,
    })
  }

  return {
    totalRecords: workbook.runs.length,
    successCount,
    failedCount,
    warnings: allWarnings.slice(0, 50),
    dealId: deal.id,
    dealName: deal.deal_name,
    savedCount: saveResult.savedCount,
    hasDistributionFee: saveResult.hasDistributionFee,
  }
}

module.exports = {
  readPriorWorkbook,
  runPriorDistributionsEtl,
}

/**
 * distribution_setup_json helpers aligned with Investor Portal
 * (30July2026_latest distributionSetup.mapper.ts).
 */

function str(v) {
  if (typeof v === 'string') return v.trim()
  if (v == null) return ''
  return String(v).trim()
}

function numStr(v, fallback = '0') {
  const t = str(v).replace(/[$,%\s,]/g, '')
  if (!t) return fallback
  const n = Number(t)
  return Number.isFinite(n) ? String(n) : fallback
}

function isoDateOnly(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    // Use local Y-M-D — toISOString() shifts a day behind for non-UTC timezones
    const y = raw.getFullYear()
    const m = String(raw.getMonth() + 1).padStart(2, '0')
    const d = String(raw.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const t = str(raw)
  if (!t || t === '-' || t === '—') return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)

  // Excel serial day number (Cash Flow exports often arrive as raw numbers)
  const asNum = Number(t)
  if (Number.isFinite(asNum) && asNum >= 20000 && asNum <= 80000) {
    const utc = Date.UTC(1899, 11, 30) + Math.round(asNum) * 86400000
    const dt = new Date(utc)
    const y = dt.getUTCFullYear()
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dt.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parsePeriod(raw) {
  const t = str(raw).toLowerCase()
  if (t === 'monthly' || t === 'month') return 'monthly'
  if (t === 'annual' || t === 'yearly' || t === 'year') return 'annual'
  if (t === 'quarterly' || t === 'quarter') return 'quarterly'
  return undefined
}

function mapWaterfallRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    payTo: row.payTo || [],
    amountMode: row.amountMode || 'calc',
    inputAmount: numStr(row.inputAmount ?? row.input_amount, '0'),
    catchup: {
      pct: numStr(
        row.catchupPct ??
          row.catchup_pct ??
          (row.catchup && row.catchup.pct) ??
          '20',
        '20'
      ),
    },
  }
}

function serializeInvestorPayment(p) {
  const out = {
    investorId: str(p.investorId),
    investorName: str(p.investorName) || '—',
    classId: str(p.classId),
    className: str(p.className) || '—',
    capital: numStr(p.capital, '0'),
    percentOfClass: numStr(p.percentOfClass ?? p.percent_of_class, '0'),
    payment: numStr(p.payment, '0'),
  }
  const contactId = str(p.contactId)
  const userEmail = str(p.userEmail)
  if (contactId) out.contactId = contactId
  if (userEmail) out.userEmail = userEmail
  return out
}

function serializePriorRecord(p, index = 0) {
  const date = isoDateOnly(p.date)
  const amount = numStr(p.amount, '0')
  const out = {
    id: str(p.id) || `dist_${date || 'na'}_${amount}_${index + 1}`,
    amount,
    date,
  }
  const source = str(p.source)
  if (source) out.source = source
  const name = str(p.name)
  if (name) out.name = name
  const notes = str(p.notes)
  if (notes) out.notes = notes
  const period = parsePeriod(p.period)
  if (period) out.period = period
  const periodStart = isoDateOnly(p.periodStart ?? p.period_start)
  if (periodStart) out.periodStart = periodStart
  const periodEnd = isoDateOnly(p.periodEnd ?? p.period_end)
  if (periodEnd) out.periodEnd = periodEnd
  const paymentDate = isoDateOnly(p.paymentDate ?? p.payment_date)
  if (paymentDate) out.paymentDate = paymentDate
  const distributionType = str(
    p.distributionType ?? p.distribution_type ?? p.cash_flow_distribution_type
  )
  if (distributionType) out.distributionType = distributionType
  const deductsFrom = str(p.deductsFrom ?? p.deducts_from)
  if (deductsFrom) out.deductsFrom = deductsFrom
  if (p.visible === false) out.visible = false
  else if (p.visible === true) out.visible = true
  const payments = Array.isArray(p.investorPayments)
    ? p.investorPayments
    : Array.isArray(p.investor_payments)
      ? p.investor_payments
      : []
  if (payments.length) {
    out.investorPayments = payments.map(serializeInvestorPayment)
  }
  if (p.importedAt) out.importedAt = str(p.importedAt)
  return out
}

/**
 * Portal Distribution Fee tab → distribution_setup_json.distributionFee
 * (Acquisition fee + Distribute 100% to {Class} - summary columns).
 */
function serializeDistributionFee(fee) {
  if (fee == null || typeof fee !== 'object') return undefined
  const name = str(fee.name)
  const type = str(fee.type ?? fee.feeType ?? fee.fee_type) || name
  const splitsRaw = Array.isArray(fee.classSplits)
    ? fee.classSplits
    : Array.isArray(fee.class_splits)
      ? fee.class_splits
      : []
  const classSplits = splitsRaw
    .map((s) => {
      if (!s || typeof s !== 'object') return null
      const classId = str(s.classId ?? s.class_id)
      if (!classId) return null
      return {
        classId,
        percent: numStr(s.percent ?? s.pct ?? s.percentage, '0'),
      }
    })
    .filter(Boolean)
  const typeOptionsRaw = Array.isArray(fee.typeOptions)
    ? fee.typeOptions
    : Array.isArray(fee.type_options)
      ? fee.type_options
      : []
  const typeOptions = typeOptionsRaw.map((item) => str(item)).filter(Boolean)
  if (type && !typeOptions.some((t) => t.toLowerCase() === type.toLowerCase()))
    typeOptions.unshift(type)
  const periodStart = isoDateOnly(fee.periodStart ?? fee.period_start)
  const periodEnd = isoDateOnly(fee.periodEnd ?? fee.period_end)
  const periodFactor = str(fee.periodFactor ?? fee.period_factor) || '0.083333'
  if (!name && !type && !classSplits.length) return undefined
  return {
    name: name || type || 'Distribution fee',
    type: type || name || 'Acquisition fee',
    typeOptions,
    cashAvailable: numStr(fee.cashAvailable ?? fee.cash_available, '0'),
    periodFactor,
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd } : {}),
    classSplits,
  }
}

function parseDistributionFee(raw) {
  return serializeDistributionFee(raw) || null
}

/**
 * Parse existing distribution_setup_json, preserving unknown keys (classes, promote, …).
 */
function parseDistributionSetupDocument(raw) {
  const empty = {
    waterfalls: { operating: [], capital: [] },
    priorDistributions: [],
    setupName: '',
    dayCountMode: '',
    defaultAccrualStartIso: '',
    classes: undefined,
    promote: undefined,
    distributionFee: null,
    rest: {},
  }
  if (!raw) return empty
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty
    const {
      waterfalls,
      priorDistributions,
      prior_distributions,
      setupName,
      setup_name,
      dayCountMode,
      day_count_mode,
      defaultAccrualStartIso,
      default_accrual_start_iso,
      classes,
      promote,
      distributionFee,
      distribution_fee,
      updatedAt,
      ...rest
    } = parsed
    const wf = waterfalls && typeof waterfalls === 'object' ? waterfalls : {}
    return {
      waterfalls: {
        operating: Array.isArray(wf.operating) ? wf.operating : [],
        capital: Array.isArray(wf.capital)
          ? wf.capital
          : Array.isArray(wf.capital_event)
            ? wf.capital_event
            : [],
      },
      priorDistributions: Array.isArray(priorDistributions)
        ? priorDistributions
        : Array.isArray(prior_distributions)
          ? prior_distributions
          : [],
      setupName: str(setupName ?? setup_name),
      dayCountMode: str(dayCountMode ?? day_count_mode),
      defaultAccrualStartIso: str(
        defaultAccrualStartIso ?? default_accrual_start_iso
      ).slice(0, 10),
      classes,
      promote,
      distributionFee: parseDistributionFee(distributionFee ?? distribution_fee),
      rest: { ...rest, ...(updatedAt ? { updatedAt } : {}) },
    }
  } catch {
    return empty
  }
}

/**
 * Serialize waterfalls + priors matching portal shape; preserve classes/promote when present.
 */
function serializeDistributionSetupDocument({
  waterfalls,
  priorDistributions = [],
  setupName = '',
  dayCountMode = '',
  defaultAccrualStartIso = '',
  classes,
  promote,
  distributionFee,
} = {}) {
  const day =
    dayCountMode === 'from_accrual_start'
      ? 'from_accrual_start'
      : dayCountMode === 'period_window'
        ? 'period_window'
        : ''
  const accrual = str(defaultAccrualStartIso).slice(0, 10)
  const doc = {
    ...(str(setupName) ? { setupName: str(setupName) } : {}),
    ...(day ? { dayCountMode: day } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(accrual)
      ? { defaultAccrualStartIso: accrual }
      : {}),
    waterfalls: {
      operating: (waterfalls?.operating || []).map(mapWaterfallRow),
      capital: (waterfalls?.capital || []).map(mapWaterfallRow),
    },
    priorDistributions: (priorDistributions || []).map((p, i) =>
      serializePriorRecord(p, i)
    ),
    updatedAt: new Date().toISOString(),
  }
  if (classes != null) doc.classes = classes
  if (promote != null) doc.promote = promote
  const fee = serializeDistributionFee(distributionFee)
  if (fee) doc.distributionFee = fee
  return JSON.stringify(doc)
}

module.exports = {
  str,
  numStr,
  isoDateOnly,
  parsePeriod,
  parseDistributionFee,
  serializeDistributionFee,
  parseDistributionSetupDocument,
  serializeDistributionSetupDocument,
  serializePriorRecord,
  serializeInvestorPayment,
}

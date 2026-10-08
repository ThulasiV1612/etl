const xlsx = require('xlsx')
const { logAudit, logError } = require('./logger')

const REQUIRED_FIELDS = ['Deal ID', 'Investor Name', 'Email', 'Investment Amount']

function normalizeKey(key) {
  return String(key || '').trim()
}

function normalizeRow(rawRow) {
  const row = {}
  for (const [key, value] of Object.entries(rawRow)) {
    row[normalizeKey(key)] = value
  }
  return row
}

function validateRow(row, rowIndex) {
  const dealId = String(row['Deal ID'] || '').trim()

  if (!dealId) {
    const reason = 'Missing required fields'
    logError(`ROW_${rowIndex + 1}`, reason)
    return { valid: false, dealId: `ROW_${rowIndex + 1}`, reason }
  }

  const missingFields = REQUIRED_FIELDS.filter((field) => {
    const value = row[field]
    return value === undefined || value === null || String(value).trim() === ''
  })

  if (missingFields.length > 0) {
    const reason = `Missing required fields: ${missingFields.join(', ')}`
    logError(dealId, reason)
    return { valid: false, dealId, reason }
  }

  const email = String(row.Email).trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const reason = 'Invalid Excel row'
    logError(dealId, reason)
    return { valid: false, dealId, reason }
  }

  const amount = Number(row['Investment Amount'])
  if (Number.isNaN(amount) || amount < 0) {
    const reason = 'Invalid Excel row'
    logError(dealId, reason)
    return { valid: false, dealId, reason }
  }

  return {
    valid: true,
    data: {
      dealId,
      investorName: String(row['Investor Name']).trim(),
      email,
      investmentAmount: amount,
    },
  }
}

function parseExcel(filePath) {
  logAudit('Excel parsing started')

  const workbook = xlsx.readFile(filePath)
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    throw new Error('Excel file contains no sheets')
  }

  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
  })

  logAudit(`Excel parsed successfully | totalRows=${rows.length}`)

  const validatedRows = []
  const seenDealIds = new Set()

  rows.forEach((rawRow, index) => {
    const row = normalizeRow(rawRow)
    const result = validateRow(row, index)

    if (!result.valid) {
      validatedRows.push(result)
      return
    }

    if (seenDealIds.has(result.data.dealId)) {
      const reason = 'Duplicate Deal ID'
      logError(result.data.dealId, reason)
      validatedRows.push({
        valid: false,
        dealId: result.data.dealId,
        reason,
      })
      return
    }

    seenDealIds.add(result.data.dealId)
    validatedRows.push({ valid: true, data: result.data })
  })

  return validatedRows
}

module.exports = {
  parseExcel,
}

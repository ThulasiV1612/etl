const xlsx = require('xlsx')
const { logAudit } = require('../logger')

function normalizeKey(key) {
  return String(key || '').trim()
}

function normalizeKeyLower(key) {
  return normalizeKey(key).toLowerCase()
}

function normalizeRow(rawRow) {
  const row = {}
  for (const [key, value] of Object.entries(rawRow)) {
    row[normalizeKey(key)] = value
  }
  return row
}

function getWorkbookSheet(filePath) {
  const workbook = xlsx.readFile(filePath)
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    throw new Error('Excel file contains no sheets')
  }

  return { workbook, sheetName, sheet: workbook.Sheets[sheetName] }
}

function readExcelHeaders(filePath) {
  const { sheetName, sheet } = getWorkbookSheet(filePath)
  const rows = xlsx.utils.sheet_to_json(sheet, {
    defval: '',
    blankrows: false,
  })

  if (!rows.length) {
    return { sheetName, headers: [], rowCount: 0 }
  }

  const headers = Object.keys(rows[0]).map(normalizeKey)
  const dataRowCount = rows.filter((row) => {
    const normalized = normalizeRow(row)
    return Object.values(normalized).some((value) => String(value || '').trim() !== '')
  }).length

  return {
    sheetName,
    headers,
    rowCount: dataRowCount,
  }
}

function isBlankExcelRow(rowData) {
  return Object.values(rowData).every((value) => {
    if (value === undefined || value === null) return true
    return String(value).trim() === ''
  })
}

function* iterateExcelRows(filePath, { onlyRows = null } = {}) {
  const { sheetName, sheet } = getWorkbookSheet(filePath)
  const rows = xlsx.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
    blankrows: false,
  })

  logAudit(`Excel read | sheet=${sheetName} totalRows=${rows.length}`)

  for (let index = 0; index < rows.length; index++) {
    const excelRowNumber = index + 2

    if (onlyRows && !onlyRows.includes(excelRowNumber)) continue

    const data = normalizeRow(rows[index])
    if (isBlankExcelRow(data)) continue

    yield {
      rowNumber: excelRowNumber,
      data,
    }
  }
}

async function processBatches(filePath, batchSize, onBatch, options = {}) {
  let batchIndex = 0
  let currentBatch = []

  for (const row of iterateExcelRows(filePath, options)) {
    currentBatch.push(row)
    if (currentBatch.length >= batchSize) {
      await onBatch(currentBatch, batchIndex)
      currentBatch = []
      batchIndex++
    }
  }

  if (currentBatch.length) {
    await onBatch(currentBatch, batchIndex)
  }

  return batchIndex + (currentBatch.length ? 1 : 0)
}

function getCellValue(rowData, excelColumn) {
  const target = normalizeKeyLower(excelColumn)
  const matchedKey = Object.keys(rowData).find((key) => normalizeKeyLower(key) === target)
  return matchedKey ? rowData[matchedKey] : undefined
}

module.exports = {
  normalizeKey,
  normalizeKeyLower,
  normalizeRow,
  readExcelHeaders,
  iterateExcelRows,
  processBatches,
  getCellValue,
}

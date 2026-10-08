const path = require('path')
const xlsx = require('xlsx')

const SCHEMA_FILE = path.join(
  __dirname,
  '..',
  '..',
  'database_table_excel',
  'SyndicationX_all_tables.xlsx'
)

let cachedSchema = null

function loadSchemaFromExcel() {
  if (cachedSchema) return cachedSchema

  const workbook = xlsx.readFile(SCHEMA_FILE)
  const sheetName = workbook.SheetNames[0]
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
  })

  if (!rows.length) {
    throw new Error('Schema Excel file is empty')
  }

  const tableNames = rows[0]
  const schema = {}

  tableNames.forEach((tableName, colIndex) => {
    if (!tableName) return

    const columns = []
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const columnName = String(rows[rowIndex][colIndex] || '').trim()
      if (columnName) columns.push(columnName)
    }

    schema[tableName] = columns
  })

  cachedSchema = schema
  return schema
}

function getTableColumns(tableName) {
  const schema = loadSchemaFromExcel()
  return schema[tableName] || []
}

function getAllTables() {
  const schema = loadSchemaFromExcel()
  return Object.keys(schema)
}

function inferDataType(columnName) {
  const name = columnName.toLowerCase()

  if (name.endsWith('_at') || name.endsWith('_date') || name === 'close_date') {
    return 'DATE'
  }

  if (
    name.includes('amount') ||
    name.includes('size') ||
    name.includes('funds') ||
    name === 'committed_amount'
  ) {
    return 'DECIMAL'
  }

  if (name.endsWith('_id') || name === 'id') {
    return 'INTEGER'
  }

  if (name.endsWith('_json') || name.endsWith('_html')) {
    return 'JSON'
  }

  if (name.includes('email')) {
    return 'EMAIL'
  }

  return 'STRING'
}

function clearSchemaCache() {
  cachedSchema = null
}

module.exports = {
  loadSchemaFromExcel,
  getTableColumns,
  getAllTables,
  inferDataType,
  clearSchemaCache,
  SCHEMA_FILE,
}

const etlMappings = require('../../config/etlMappings')
const metadataService = require('./metadataService')
const { getCellValue } = require('./excelReaderService')
const {
  getOrganizationContextFields,
  uploadTypeRequiresOrganizationId,
} = require('../../config/etlOrganizationContext')
const {
  getDealContextFields,
  uploadTypeRequiresDealId,
} = require('../../config/etlDealContext')
const {
  resolveMappingsForHeaders,
  getMissingRequiredMappings,
  getResolvedColumnPairs,
} = require('./columnResolverService')

function getUploadConfig(uploadType) {
  return etlMappings[uploadType] || null
}

function getTemplateColumns(uploadType) {
  const config = getUploadConfig(uploadType)
  if (!config) return []
  return config.columns.map((col) => col.excelColumn)
}

async function syncMappingsToDatabase(db) {
  for (const [uploadType, config] of Object.entries(etlMappings)) {
    if (!config.columns) continue

    const excelColumns = config.columns.map((column) => column.excelColumn).filter(Boolean)

    for (const column of config.columns) {
      if (!column.excelColumn) continue

      await db.query(
        `INSERT INTO etl_column_mapping
         (upload_type, excel_column_name, database_column_name, data_type, required_flag)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (upload_type, excel_column_name)
         DO UPDATE SET
           database_column_name = EXCLUDED.database_column_name,
           data_type = EXCLUDED.data_type,
           required_flag = EXCLUDED.required_flag`,
        [
          uploadType,
          column.excelColumn,
          column.databaseColumn,
          column.dataType,
          Boolean(column.required),
        ]
      )
    }

    if (excelColumns.length) {
      await db.query(
        `DELETE FROM etl_column_mapping
         WHERE upload_type = $1
           AND excel_column_name <> ALL($2::text[])`,
        [uploadType, excelColumns]
      )
    } else {
      await db.query(
        'DELETE FROM etl_column_mapping WHERE upload_type = $1',
        [uploadType]
      )
    }
  }
}

async function getMappings(uploadType) {
  const dbMappings = await metadataService.getColumnMappings(uploadType)
  if (dbMappings.length) return dbMappings

  const config = getUploadConfig(uploadType)
  if (!config) return []

  return config.columns.map((col, index) => ({
    mapping_id: index + 1,
    upload_type: uploadType,
    excel_column_name: col.excelColumn,
    database_column_name: col.databaseColumn,
    data_type: col.dataType,
    required_flag: col.required,
  }))
}

function getRequiredExcelColumns(mappings) {
  return mappings
    .filter((mapping) => mapping.required_flag)
    .map((mapping) => mapping.excel_column_name)
}

function mapRowToDatabaseColumns(rowData, mappings) {
  const mapped = {}

  for (const mapping of mappings) {
    const excelHeader = mapping.resolved_excel_header || mapping.excel_column_name
    if (!excelHeader) continue

    const rawValue = getCellValue(rowData, excelHeader)
    if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '') {
      mapped[mapping.database_column_name] = rawValue
    }
  }

  return mapped
}

function validateResolvedMappings(resolvedMappings) {
  const missingColumns = getMissingRequiredMappings(resolvedMappings)

  return {
    valid: missingColumns.length === 0,
    missingColumns,
    resolvedMappings,
    columnPairs: getResolvedColumnPairs(resolvedMappings),
  }
}

function getFieldLabel(mappings, databaseColumn) {
  const mapping = mappings.find((item) => item.database_column_name === databaseColumn)
  return mapping?.excel_column_name || databaseColumn
}

module.exports = {
  getUploadConfig,
  getTemplateColumns,
  syncMappingsToDatabase,
  getMappings,
  getRequiredExcelColumns,
  mapRowToDatabaseColumns,
  getFieldLabel,
  getOrganizationContextFields,
  uploadTypeRequiresOrganizationId,
  getDealContextFields,
  uploadTypeRequiresDealId,
  resolveMappingsForHeaders,
  validateResolvedMappings,
}

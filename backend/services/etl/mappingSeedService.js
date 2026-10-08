const etlMappings = require('../../config/etlMappings')

async function syncMappingsToDatabase(db) {
  for (const [uploadType, config] of Object.entries(etlMappings)) {
    if (!config.columns) continue

    const excelColumns = config.columns
      .map((col) => col.excelColumn)
      .filter(Boolean)

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
  }
}

module.exports = {
  syncMappingsToDatabase,
}

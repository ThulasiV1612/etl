const { getPool } = require('../dbService')
const etlConfig = require('../../config/etlUploadTypes')

async function createJob({ jobType, fileName, createdBy = 'system' }) {
  const db = await getPool()
  const result = await db.query(
    `INSERT INTO etl_job_master (job_type, file_name, status, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [jobType, fileName, etlConfig.JOB_STATUS.PENDING, createdBy]
  )
  return result.rows[0]
}

async function updateJob(jobId, fields) {
  const db = await getPool()
  const allowed = [
    'status',
    'start_time',
    'end_time',
    'total_records',
    'success_count',
    'failed_count',
    'file_name',
  ]

  const sets = []
  const values = []
  let paramIndex = 1

  for (const [key, value] of Object.entries(fields)) {
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    if (!allowed.includes(dbKey)) continue
    sets.push(`${dbKey} = $${paramIndex}`)
    values.push(value)
    paramIndex++
  }

  if (!sets.length) return null

  values.push(jobId)
  const result = await db.query(
    `UPDATE etl_job_master SET ${sets.join(', ')} WHERE job_id = $${paramIndex} RETURNING *`,
    values
  )
  return result.rows[0]
}

async function getJob(jobId) {
  const db = await getPool()
  const result = await db.query('SELECT * FROM etl_job_master WHERE job_id = $1', [jobId])
  return result.rows[0] || null
}

async function listJobs({ limit = 50, offset = 0, status } = {}) {
  const db = await getPool()
  const values = []
  let where = ''

  if (status) {
    values.push(status)
    where = `WHERE status = $${values.length}`
  }

  values.push(limit, offset)
  const result = await db.query(
    `SELECT * FROM etl_job_master ${where}
     ORDER BY job_id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  )
  return result.rows
}

async function trackFile({ jobId, fileName, fileSize, filePath, fileStatus = 'UPLOADED' }) {
  const db = await getPool()
  const result = await db.query(
    `INSERT INTO etl_file_tracking (job_id, file_name, file_size, file_path, file_status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [jobId, fileName, fileSize, filePath, fileStatus]
  )
  return result.rows[0]
}

async function getFileByJobId(jobId) {
  const db = await getPool()
  const result = await db.query(
    'SELECT * FROM etl_file_tracking WHERE job_id = $1 ORDER BY file_id DESC LIMIT 1',
    [jobId]
  )
  return result.rows[0] || null
}

async function logStage({ jobId, stageName, status, message = null }) {
  const db = await getPool()
  const result = await db.query(
    `INSERT INTO etl_stage_log (job_id, stage_name, status, start_time, message)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
     RETURNING *`,
    [jobId, stageName, status, message]
  )
  return result.rows[0]
}

async function completeStage(stageLogId, status, message = null) {
  const db = await getPool()
  const result = await db.query(
    `UPDATE etl_stage_log
     SET status = $1, end_time = CURRENT_TIMESTAMP, message = COALESCE($2, message)
     WHERE stage_log_id = $3
     RETURNING *`,
    [status, message, stageLogId]
  )
  return result.rows[0]
}

async function getStagesByJobId(jobId) {
  const db = await getPool()
  const result = await db.query(
    'SELECT * FROM etl_stage_log WHERE job_id = $1 ORDER BY stage_log_id ASC',
    [jobId]
  )
  return result.rows
}

async function logError({
  jobId,
  rowNumber = null,
  columnName = null,
  errorType = 'VALIDATION',
  errorMessage,
  stackTrace = null,
}) {
  const db = await getPool()
  await db.query(
    `INSERT INTO etl_error_log
     (job_id, row_number, column_name, error_type, error_message, stack_trace)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [jobId, rowNumber, columnName, errorType, errorMessage, stackTrace]
  )
}

async function getErrorsByJobId(jobId, { limit = 500, offset = 0 } = {}) {
  const db = await getPool()
  const result = await db.query(
    `SELECT * FROM etl_error_log
     WHERE job_id = $1
     ORDER BY error_id ASC
     LIMIT $2 OFFSET $3`,
    [jobId, limit, offset]
  )
  return result.rows
}

async function upsertRecordStatus({
  jobId,
  rowNumber,
  status,
  entityId = null,
  errorMessage = null,
  columnName = null,
}) {
  const db = await getPool()
  await db.query(`
    ALTER TABLE etl_record_status
    ADD COLUMN IF NOT EXISTS column_name TEXT
  `)

  const result = await db.query(
    `INSERT INTO etl_record_status (job_id, row_number, status, entity_id, error_message, column_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (job_id, row_number)
     DO UPDATE SET
       status = EXCLUDED.status,
       entity_id = COALESCE(EXCLUDED.entity_id, etl_record_status.entity_id),
       error_message = EXCLUDED.error_message,
       column_name = COALESCE(EXCLUDED.column_name, etl_record_status.column_name),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [jobId, rowNumber, status, entityId, errorMessage, columnName]
  )
  return result.rows[0]
}

async function getRecordStatusesByJobId(jobId, { status } = {}) {
  const db = await getPool()
  const values = [jobId]
  let where = 'WHERE job_id = $1'

  if (status) {
    values.push(status)
    where += ` AND status = $${values.length}`
  }

  const result = await db.query(
    `SELECT * FROM etl_record_status ${where} ORDER BY row_number ASC`,
    values
  )
  return result.rows
}

async function getFailedRowNumbers(jobId) {
  const db = await getPool()
  const result = await db.query(
    `SELECT row_number FROM etl_record_status
     WHERE job_id = $1 AND status = $2
     ORDER BY row_number ASC`,
    [jobId, etlConfig.RECORD_STATUS.FAILED]
  )
  return result.rows.map((row) => row.row_number)
}

async function getColumnMappings(uploadType) {
  const db = await getPool()
  const result = await db.query(
    `SELECT * FROM etl_column_mapping
     WHERE upload_type = $1
     ORDER BY mapping_id ASC`,
    [uploadType]
  )
  return result.rows
}

async function getDashboardStats() {
  const db = await getPool()
  const result = await db.query(`
    SELECT
      COUNT(*)::int AS total_uploads,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS successful_jobs,
      COUNT(*) FILTER (WHERE status IN ('FAILED', 'PARTIAL'))::int AS failed_jobs,
      COUNT(*) FILTER (WHERE status = 'RUNNING')::int AS running_jobs,
      COALESCE(SUM(total_records), 0)::int AS records_processed,
      COALESCE(SUM(failed_count), 0)::int AS error_count
    FROM etl_job_master
  `)
  return result.rows[0]
}

module.exports = {
  createJob,
  updateJob,
  getJob,
  listJobs,
  trackFile,
  getFileByJobId,
  logStage,
  completeStage,
  getStagesByJobId,
  logError,
  getErrorsByJobId,
  upsertRecordStatus,
  getRecordStatusesByJobId,
  getFailedRowNumbers,
  getColumnMappings,
  getDashboardStats,
}

const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')
const etlConfig = require('../config/etlUploadTypes')
const { runEtlJob, validateFileOnly } = require('../services/etl/etlEngine')
const metadataService = require('../services/etl/metadataService')
const { getOrganizationContextFields } = require('../config/etlOrganizationContext')
const { getDealContextFields } = require('../config/etlDealContext')
const { getTableColumns, getAllTables } = require('../services/etl/schemaService')
const { logAudit } = require('../services/logger')

function getUploadTypes(_req, res) {
  const types = Object.entries(etlConfig.UPLOAD_TYPES).map(([key, value]) => ({
    key,
    label: value.label,
    description: value.description,
    targetTable: value.targetTable,
    templateColumns: value.templateColumns,
    disabled: Boolean(value.disabled),
    entity: value.entity || null,
    mediaOnly: Boolean(value.mediaOnly),
    dualFile: Boolean(value.dualFile),
    requiresOrganizationId: getOrganizationContextFields(key).length > 0,
    organizationContextFields: getOrganizationContextFields(key),
    requiresDealId: getDealContextFields(key).length > 0,
    dealContextFields: getDealContextFields(key),
  }))

  const entityActions = Object.values(etlConfig.ENTITY_ACTIONS || {})

  return res.json({ uploadTypes: types, entityActions })
}

function getSchema(_req, res) {
  try {
    const tables = getAllTables()
    const schema = {}
    tables.forEach((table) => {
      schema[table] = getTableColumns(table)
    })
    return res.json({ tables: schema })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

async function validateUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Use field name "file".' })
  }

  const uploadType = String(
    req.body.uploadType ||
    req.body.upload_type ||
    req.query.uploadType ||
    ''
  ).trim()
  if (!uploadType || !etlConfig.UPLOAD_TYPES[uploadType]) {
    cleanupUpload(req.file.path)
    return res.status(400).json({
      error: 'Valid uploadType is required',
      received: uploadType || null,
      validUploadTypes: Object.keys(etlConfig.UPLOAD_TYPES),
    })
  }

  try {
    const validation = await validateFileOnly({
      uploadType,
      filePath: req.file.path,
      options: {
        organizationId: req.body.organizationId || req.body.organization_id,
        dealId: req.body.dealId || req.body.deal_id,
        createdBy: req.body.createdBy,
      },
    })

    return res.json({
      uploadType,
      fileName: req.file.originalname,
      ...validation,
    })
  } catch (error) {
    return res.status(error.status || 400).json({
      error: error.message,
      code: error.code || undefined,
      schemaCheck: error.schemaCheck || undefined,
    })
  } finally {
    cleanupUpload(req.file.path)
  }
}

async function startMigration(req, res) {
  const uploadType = String(
    req.body.uploadType ||
    req.body.upload_type ||
    req.query.uploadType ||
    ''
  ).trim()
  const createdBy = req.body.createdBy || 'web-user'
  const validateOnly = req.body.validateOnly === 'true'
  const isCashflowDual = uploadType === 'CASHFLOW_INVESTORS'

  const profileFile = isCashflowDual
    ? (req.files?.profileFile?.[0] || req.file)
    : req.file
  const addInvestorFile = isCashflowDual
    ? (req.files?.addInvestorFile?.[0] || null)
    : null

  if (isCashflowDual) {
    if (!profileFile || !addInvestorFile) {
      cleanupUpload(profileFile?.path)
      cleanupUpload(addInvestorFile?.path)
      return res.status(400).json({
        error:
          'Full investor load needs both files: profileFile (Profile Mapping) and addInvestorFile (Add Investor Mapping)',
      })
    }
  } else if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Use field name "file".' })
  }

  if (!uploadType || !etlConfig.UPLOAD_TYPES[uploadType]) {
    cleanupUpload(profileFile?.path || req.file?.path)
    cleanupUpload(addInvestorFile?.path)
    return res.status(400).json({
      error: 'Valid uploadType is required',
      received: uploadType || null,
      validUploadTypes: Object.keys(etlConfig.UPLOAD_TYPES),
    })
  }

  const filePath = isCashflowDual ? profileFile.path : req.file.path
  const fileName = isCashflowDual
    ? `${profileFile.originalname} + ${addInvestorFile.originalname}`
    : req.file.originalname

  try {
    if (validateOnly) {
      const validation = await validateFileOnly({
        uploadType,
        filePath,
        options: {
          organizationId: req.body.organizationId || req.body.organization_id,
          dealId: req.body.dealId || req.body.deal_id,
          profileFilePath: isCashflowDual ? profileFile.path : undefined,
          addInvestorFilePath: isCashflowDual ? addInvestorFile.path : undefined,
        },
      })
      cleanupUpload(filePath)
      if (isCashflowDual) cleanupUpload(addInvestorFile.path)
      return res.json({ validateOnly: true, ...validation })
    }

    const job = await metadataService.createJob({
      jobType: uploadType,
      fileName,
      createdBy,
    })

    await metadataService.trackFile({
      jobId: job.job_id,
      fileName: isCashflowDual ? profileFile.originalname : fileName,
      fileSize: isCashflowDual ? profileFile.size : req.file.size,
      filePath,
      fileStatus: 'STORED',
    })

    if (isCashflowDual) {
      await metadataService.trackFile({
        jobId: job.job_id,
        fileName: addInvestorFile.originalname,
        fileSize: addInvestorFile.size,
        filePath: addInvestorFile.path,
        fileStatus: 'STORED',
      })
    }

    await metadataService.logStage({
      jobId: job.job_id,
      stageName: 'UPLOAD',
      status: 'COMPLETED',
      message: isCashflowDual
        ? `Files uploaded: ${profileFile.originalname}, ${addInvestorFile.originalname}`
        : `File ${fileName} uploaded`,
    })

    const result = await runEtlJob({
      jobId: job.job_id,
      uploadType,
      filePath,
      fileName,
      options: {
        createdBy,
        organizationId: req.body.organizationId || req.body.organization_id,
        dealId: req.body.dealId || req.body.deal_id,
        profileFilePath: isCashflowDual ? profileFile.path : undefined,
        addInvestorFilePath: isCashflowDual ? addInvestorFile.path : undefined,
      },
    })

    const errors = await metadataService.getErrorsByJobId(job.job_id, { limit: 50 })

    return res.status(200).json({
      ...result,
      errors: errors.map((e) => ({
        rowNumber: e.row_number,
        columnName: e.column_name,
        errorType: e.error_type,
        errorMessage: e.error_message,
      })),
    })
  } catch (error) {
    logAudit(`ETL migration failed | error=${error.message}`)
    return res.status(error.status || 500).json({
      error:
        error.code === 'ETL_SCHEMA_MISSING'
          ? error.message
          : 'ETL processing failed',
      message: error.message,
      code: error.code || undefined,
      schemaCheck: error.schemaCheck || undefined,
    })
  }
}

async function retryFailed(req, res) {
  const jobId = parseInt(req.params.jobId, 10)
  const job = await metadataService.getJob(jobId)

  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }

  const file = await metadataService.getFileByJobId(jobId)
  if (!file?.file_path || !fs.existsSync(file.file_path)) {
    return res.status(400).json({ error: 'Original file no longer available for retry' })
  }

  try {
    const result = await runEtlJob({
      jobId,
      uploadType: job.job_type,
      filePath: file.file_path,
      fileName: job.file_name,
      options: { retryFailedOnly: true },
    })

    const errors = await metadataService.getErrorsByJobId(jobId, { limit: 50 })

    return res.json({
      ...result,
      retry: true,
      errors: errors.map((e) => ({
        rowNumber: e.row_number,
        columnName: e.column_name,
        errorType: e.error_type,
        errorMessage: e.error_message,
      })),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

async function getJobDetails(req, res) {
  const jobId = parseInt(req.params.jobId, 10)
  const job = await metadataService.getJob(jobId)

  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }

  const [stages, errors, records, file] = await Promise.all([
    metadataService.getStagesByJobId(jobId),
    metadataService.getErrorsByJobId(jobId, { limit: 200 }),
    metadataService.getRecordStatusesByJobId(jobId),
    metadataService.getFileByJobId(jobId),
  ])

  return res.json({
    job,
    file,
    stages,
    errors,
    records,
  })
}

async function listJobs(req, res) {
  const limit = parseInt(req.query.limit, 10) || 50
  const offset = parseInt(req.query.offset, 10) || 0
  const status = req.query.status || null

  const jobs = await metadataService.listJobs({ limit, offset, status })
  return res.json({ jobs })
}

async function downloadErrorReport(req, res) {
  const jobId = parseInt(req.params.jobId, 10)
  const job = await metadataService.getJob(jobId)

  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }

  const errors = await metadataService.getErrorsByJobId(jobId, { limit: 10000 })
  const records = await metadataService.getRecordStatusesByJobId(jobId, {
    status: etlConfig.RECORD_STATUS.FAILED,
  })

  const rows = errors.length
    ? errors.map((e) => ({
        'Row Number': e.row_number,
        'Column Name': e.column_name || '',
        'Error Type': e.error_type,
        'Error Message': e.error_message,
      }))
    : records.map((r) => ({
        'Row Number': r.row_number,
        'Column Name': '',
        'Error Type': 'RECORD',
        'Error Message': r.error_message || 'Failed',
      }))

  const worksheet = xlsx.utils.json_to_sheet(rows)
  const workbook = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Errors')

  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="etl-errors-job-${jobId}.xlsx"`
  )
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  return res.send(buffer)
}

async function getDashboard(_req, res) {
  const stats = await metadataService.getDashboardStats()
  const recentJobs = await metadataService.listJobs({ limit: 10 })

  return res.json({
    stats,
    recentJobs,
  })
}

async function getColumnMappings(req, res) {
  const uploadType = req.params.uploadType
  const mappings = await metadataService.getColumnMappings(uploadType)
  return res.json({ uploadType, mappings })
}

function cleanupUpload(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

async function listContactReviews(req, res) {
  try {
    const { getPool } = require('../services/dbService')
    const {
      listPendingContactReviews,
      ensureContactReviewTable,
    } = require('../services/etl/contactMatchService')
    const db = await getPool()
    await ensureContactReviewTable(db)
    const jobId = req.query.jobId ? parseInt(req.query.jobId, 10) : null
    const organizationId = req.query.organizationId || req.query.organization_id || null
    const reviews = await listPendingContactReviews(db, {
      jobId: Number.isFinite(jobId) ? jobId : null,
      organizationId,
    })
    return res.json({
      success: true,
      count: reviews.length,
      reviews,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

async function resolveContactReviewAction(req, res) {
  try {
    const { getPool } = require('../services/dbService')
    const { resolveContactReview } = require('../services/etl/contactMatchService')
    const db = await getPool()
    const reviewId = String(req.params.reviewId || '').trim()
    const action = req.body?.action
    const selectedContactId =
      req.body?.selectedContactId || req.body?.selected_contact_id || null
    const decidedBy = req.body?.decidedBy || req.body?.decided_by || 'etl-ui'

    if (!reviewId) {
      return res.status(400).json({ error: 'reviewId is required' })
    }

    const result = await resolveContactReview(db, {
      reviewId,
      action,
      selectedContactId,
      decidedBy,
    })

    logAudit(
      `CRM contact review resolved | review=${reviewId} action=${result.action} ` +
        `contact=${result.contactId || 'none'} by=${decidedBy}`
    )

    return res.json({ success: true, ...result })
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
}

module.exports = {
  getUploadTypes,
  getSchema,
  validateUpload,
  startMigration,
  retryFailed,
  getJobDetails,
  listJobs,
  downloadErrorReport,
  getDashboard,
  getColumnMappings,
  listContactReviews,
  resolveContactReviewAction,
}

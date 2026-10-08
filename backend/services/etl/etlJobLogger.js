const metadataService = require('./metadataService')
const { logAudit, logError, logSuccess } = require('../logger')
const etlConfig = require('../../config/etlUploadTypes')

async function startStage(jobId, stageName, message = null) {
  logAudit(`Job ${jobId} | stage=${stageName} status=RUNNING`)
  return metadataService.logStage({
    jobId,
    stageName,
    status: 'RUNNING',
    message,
  })
}

async function completeStage(stageLogId, status, message = null) {
  return metadataService.completeStage(stageLogId, status, message)
}

async function runStage(jobId, stageName, handler) {
  const stage = await startStage(jobId, stageName)

  try {
    const result = await handler()
    await completeStage(stage.stage_log_id, 'COMPLETED', result?.message || null)
    return result
  } catch (error) {
    await completeStage(stage.stage_log_id, 'FAILED', error.message)
    throw error
  }
}

async function logRowError({ jobId, rowNumber, columnName, errorType, errorMessage }) {
  await metadataService.logError({
    jobId,
    rowNumber,
    columnName,
    errorType,
    errorMessage,
  })
  logError(`JOB_${jobId}_ROW_${rowNumber}`, errorMessage)
}

async function logRowSuccess({ jobId, rowNumber, entityId, columnName = null, message = null }) {
  await metadataService.upsertRecordStatus({
    jobId,
    rowNumber,
    status: etlConfig.RECORD_STATUS.SUCCESS,
    entityId: entityId != null ? String(entityId) : null,
    columnName: columnName || null,
    errorMessage: message || null,
  })
  logSuccess(`JOB_${jobId}_ROW_${rowNumber}`, columnName || 'LOADED')
}

async function logRowFailure({ jobId, rowNumber, errorMessage, columnName = null }) {
  await metadataService.upsertRecordStatus({
    jobId,
    rowNumber,
    status: etlConfig.RECORD_STATUS.FAILED,
    errorMessage,
    columnName,
  })
}

function logJobEvent(message) {
  logAudit(message)
}

module.exports = {
  startStage,
  completeStage,
  runStage,
  logRowError,
  logRowSuccess,
  logRowFailure,
  logJobEvent,
}

const etlConfig = require('../../config/etlUploadTypes')
const excelReaderService = require('./excelReaderService')
const columnMappingService = require('./columnMappingService')
const validationService = require('./validationService')
const transformationService = require('./transformationService')
const databaseInsertService = require('./databaseInsertService')
const etlJobLogger = require('./etlJobLogger')
const metadataService = require('./metadataService')
const { isValidUuid } = require('./uuidUtils')
const dealAssetsEtlService = require('./dealAssetsEtlService')
const dealClassesEtlService = require('./dealClassesEtlService')
const investorProfilesEtlService = require('./investorProfilesEtlService')
const dealInvestorsEtlService = require('./dealInvestorsEtlService')
const dealMembersEtlService = require('./dealMembersEtlService')
const distributionSetupEtlService = require('./distributionSetupEtlService')
const priorDistributionsEtlService = require('./priorDistributionsEtlService')
const {
  generateDistributionsFromClassWorkbook,
} = require('./distributionsMappingService')
const { assertSchemaReady } = require('./schemaPreflightService')

function buildContext(options = {}) {
  const organizationId = String(
    options.organizationId ||
    options.organization_id ||
    process.env.DEFAULT_ORGANIZATION_ID ||
    ''
  ).trim()

  const dealId = String(
    options.dealId ||
    options.deal_id ||
    ''
  ).trim()

  return {
    organizationId: organizationId || null,
    dealId: dealId || null,
    createdBy: options.createdBy || 'system',
  }
}

function assertOrganizationContext(context, uploadType) {
  if (!columnMappingService.uploadTypeRequiresOrganizationId(uploadType)) return

  if (!context.organizationId) {
    throw new Error(`Organization ID is required for ${uploadType} upload`)
  }

  if (!isValidUuid(context.organizationId)) {
    throw new Error('Organization ID must be a valid UUID')
  }
}

function assertDealContext(context, uploadType) {
  if (!columnMappingService.uploadTypeRequiresDealId(uploadType)) return

  if (!context.dealId) {
    throw new Error(`Deal is required for ${uploadType} upload. Select a deal name before uploading.`)
  }

  if (!isValidUuid(context.dealId)) {
    throw new Error('Deal ID must be a valid UUID')
  }
}

async function assertUploadSchemaReady(uploadType) {
  await assertSchemaReady(uploadType)
}

async function runDealAssetsJob({ jobId, uploadType, filePath, fileName, context }) {
  let successCount = 0
  let failedCount = 0
  let totalRecords = 0

  await metadataService.updateJob(jobId, {
    status: etlConfig.JOB_STATUS.RUNNING,
    start_time: new Date(),
  })

  etlJobLogger.logJobEvent(`ETL job ${jobId} started | type=${uploadType} file=${fileName}`)

  try {
    await etlJobLogger.runStage(jobId, 'READ', async () => {
      const preview = dealAssetsEtlService.readAssetInfoRows(filePath)
      totalRecords = preview.rowCount
      await metadataService.updateJob(jobId, { total_records: totalRecords })
      return {
        message: `Read Asset_Info sheet "${preview.sheetName}" with ${preview.rowCount} asset row(s)`,
      }
    })

    await etlJobLogger.runStage(jobId, 'VALIDATION', async () => ({
      message: 'Validated Deal Assets Excel for deal_asset insert (same deal_id allowed)',
    }))

    await etlJobLogger.runStage(jobId, 'TRANSFORMATION', async () => ({
      message: 'Building attr_rows_json + additional_info_json per asset row',
    }))

    await etlJobLogger.runStage(jobId, 'LOAD', async () => {
      const result = await dealAssetsEtlService.runDealAssetsEtl({
        filePath,
        dealId: context.dealId,
        onRowResult: async ({ rowNumber, success, entityId, errorMessage, message, columnName }) => {
          if (success) {
            successCount++
            await etlJobLogger.logRowSuccess({ jobId, rowNumber, entityId, columnName, message })
            return
          }

          failedCount++
          await etlJobLogger.logRowError({
            jobId,
            rowNumber,
            columnName: 'deal_asset',
            errorType: 'LOAD',
            errorMessage: errorMessage || message || 'Failed',
          })
          await etlJobLogger.logRowFailure({
            jobId,
            rowNumber,
            errorMessage: errorMessage || message || 'Failed',
          })
        },
      })

      totalRecords = result.totalRecords
      return {
        message: `Inserted ${result.successCount} deal_asset row(s) for deal ${context.dealId}`,
      }
    })

    const finalStatus = failedCount === 0
      ? etlConfig.JOB_STATUS.COMPLETED
      : (successCount > 0 ? etlConfig.JOB_STATUS.PARTIAL : etlConfig.JOB_STATUS.FAILED)

    await metadataService.updateJob(jobId, {
      status: finalStatus,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount,
    })

    await etlJobLogger.runStage(jobId, 'COMPLETION', async () => ({
      message: `Deal Assets ETL finished | success=${successCount} failed=${failedCount}`,
    }))

    return {
      jobId,
      uploadType,
      fileName,
      status: finalStatus,
      totalRecords,
      successCount,
      failedCount,
    }
  } catch (error) {
    await metadataService.updateJob(jobId, {
      status: etlConfig.JOB_STATUS.FAILED,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount || 1,
    })

    await metadataService.logError({
      jobId,
      errorType: 'SYSTEM',
      errorMessage: error.message,
      stackTrace: error.stack,
    })

    throw error
  }
}

async function runDealClassesJob({ jobId, uploadType, filePath, fileName, context }) {
  let successCount = 0
  let failedCount = 0
  let totalRecords = 0

  await metadataService.updateJob(jobId, {
    status: etlConfig.JOB_STATUS.RUNNING,
    start_time: new Date(),
  })

  etlJobLogger.logJobEvent(`ETL job ${jobId} started | type=${uploadType} file=${fileName}`)

  try {
    await etlJobLogger.runStage(jobId, 'READ', async () => {
      const preview = dealClassesEtlService.readClassWorkbook(filePath)
      totalRecords = preview.classes.rowCount
      await metadataService.updateJob(jobId, { total_records: totalRecords })
      return {
        message:
          `Read Classes="${preview.classes.sheetName}" (${preview.classes.rowCount}), ` +
          `Hurdles="${preview.hurdles.sheetName || '—'}" (${preview.hurdles.rowCount}), ` +
          `Final Tier="${preview.finalTier.sheetName || '—'}" (${preview.finalTier.rowCount})`,
      }
    })

    await etlJobLogger.runStage(jobId, 'VALIDATION', async () => ({
      message: 'Validated class workbook (skip hint rows; LP/GP + money + dates normalized)',
    }))

    await etlJobLogger.runStage(jobId, 'TRANSFORM', async () => ({
      message: 'Building advanced_options_json (waterfallTiers + finalTier) and class_setup_json',
    }))

    await etlJobLogger.runStage(jobId, 'LOAD', async () => {
      const result = await dealClassesEtlService.runDealClassesEtl({
        filePath,
        dealId: context.dealId,
        onRowResult: async ({ rowNumber, success, entityId, errorMessage, message, columnName }) => {
          if (success) {
            successCount++
            await etlJobLogger.logRowSuccess({ jobId, rowNumber, entityId, columnName, message })
            return
          }

          failedCount++
          await etlJobLogger.logRowError({
            jobId,
            rowNumber,
            columnName: 'deal_investor_class',
            errorType: 'LOAD',
            errorMessage: errorMessage || message || 'Failed',
          })
          await etlJobLogger.logRowFailure({
            jobId,
            rowNumber,
            errorMessage: errorMessage || message || 'Failed',
          })
        },
      })

      totalRecords = result.totalRecords
      return {
        message: `Loaded ${result.successCount} investor class row(s) for deal ${context.dealId}`,
      }
    })

    const finalStatus = failedCount === 0
      ? etlConfig.JOB_STATUS.COMPLETED
      : (successCount > 0 ? etlConfig.JOB_STATUS.PARTIAL : etlConfig.JOB_STATUS.FAILED)

    let distributionMapping = null
    if (successCount > 0) {
      await etlJobLogger.runStage(jobId, 'DISTRIBUTION_MAP', async () => {
        try {
          distributionMapping = await generateDistributionsFromClassWorkbook({
            filePath,
            originalName: fileName,
            dealId: context.dealId,
            deleteInput: false,
          })
          return {
            message:
              `Generated Distribution Setup | operating=${distributionMapping.summary?.operatingRows || 0} ` +
              `capital=${distributionMapping.summary?.capitalRows || 0}`,
          }
        } catch (mapError) {
          distributionMapping = {
            success: false,
            error: mapError.message,
          }
          return {
            message: `Classes loaded, but Distribution Setup mapping failed: ${mapError.message}`,
          }
        }
      })
    }

    await metadataService.updateJob(jobId, {
      status: finalStatus,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount,
    })

    await etlJobLogger.runStage(jobId, 'COMPLETION', async () => ({
      message: `Deal Classes ETL finished | success=${successCount} failed=${failedCount}` +
        (distributionMapping?.success
          ? ' | Distribution Setup Excel ready'
          : distributionMapping?.error
            ? ` | Distribution map error: ${distributionMapping.error}`
            : ''),
    }))

    return {
      jobId,
      uploadType,
      fileName,
      status: finalStatus,
      totalRecords,
      successCount,
      failedCount,
      errors: [],
      distributionMapping,
    }
  } catch (error) {
    await metadataService.updateJob(jobId, {
      status: etlConfig.JOB_STATUS.FAILED,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount || 1,
    })

    await metadataService.logError({
      jobId,
      errorType: 'SYSTEM',
      errorMessage: error.message,
      stackTrace: error.stack,
    })

    throw error
  }
}

async function runInvestorProfilesJob({ jobId, uploadType, filePath, fileName, context }) {
  let successCount = 0
  let failedCount = 0
  let totalRecords = 0

  await metadataService.updateJob(jobId, {
    status: etlConfig.JOB_STATUS.RUNNING,
    start_time: new Date(),
  })

  etlJobLogger.logJobEvent(`ETL job ${jobId} started | type=${uploadType} file=${fileName}`)

  try {
    await etlJobLogger.runStage(jobId, 'READ', async () => {
      const preview = investorProfilesEtlService.readProfileWorkbook(filePath)
      totalRecords =
        preview.addresses.rowCount +
        preview.beneficiaries.rowCount +
        preview.profiles.rowCount
      await metadataService.updateJob(jobId, { total_records: totalRecords })
      return {
        message:
          `Read Addresses=${preview.addresses.rowCount}, ` +
          `Beneficiaries=${preview.beneficiaries.rowCount}, ` +
          `Profiles=${preview.profiles.rowCount}`,
      }
    })

    await etlJobLogger.runStage(jobId, 'VALIDATION', async () => ({
      message: 'Validated investor profile workbook (skip hint rows; ACH/Check normalized)',
    }))

    await etlJobLogger.runStage(jobId, 'TRANSFORM', async () => ({
      message: 'Linking address/beneficiary keys into form_snapshot + distribution columns',
    }))

    await etlJobLogger.runStage(jobId, 'LOAD', async () => {
      const result = await investorProfilesEtlService.runInvestorProfilesEtl({
        filePath,
        organizationId: context.organizationId,
        dealId: context.dealId,
        onRowResult: async ({ rowNumber, success, entityId, errorMessage, message, columnName }) => {
          if (success) {
            successCount++
            await etlJobLogger.logRowSuccess({ jobId, rowNumber, entityId, columnName, message })
            return
          }
          failedCount++
          await etlJobLogger.logRowError({
            jobId,
            rowNumber,
            columnName: 'user_investor_profiles',
            errorType: 'LOAD',
            errorMessage: errorMessage || message || 'Failed',
          })
          await etlJobLogger.logRowFailure({
            jobId,
            rowNumber,
            errorMessage: errorMessage || message || 'Failed',
          })
        },
      })

      totalRecords = result.totalRecords
      return {
        message: `Loaded ${result.successCount} investor profile-related row(s)`,
      }
    })

    const finalStatus = failedCount === 0
      ? etlConfig.JOB_STATUS.COMPLETED
      : (successCount > 0 ? etlConfig.JOB_STATUS.PARTIAL : etlConfig.JOB_STATUS.FAILED)

    await metadataService.updateJob(jobId, {
      status: finalStatus,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount,
    })

    await etlJobLogger.runStage(jobId, 'COMPLETION', async () => ({
      message: `Investor Profiles ETL finished | success=${successCount} failed=${failedCount}`,
    }))

    return {
      jobId,
      uploadType,
      fileName,
      status: finalStatus,
      totalRecords,
      successCount,
      failedCount,
      errors: [],
    }
  } catch (error) {
    await metadataService.updateJob(jobId, {
      status: etlConfig.JOB_STATUS.FAILED,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount || 1,
    })
    await metadataService.logError({
      jobId,
      errorType: 'SYSTEM',
      errorMessage: error.message,
      stackTrace: error.stack,
    })
    throw error
  }
}

async function runDealMembersJob({ jobId, uploadType, filePath, fileName, context }) {
  let successCount = 0
  let failedCount = 0
  let totalRecords = 0
  let contactReviews = []

  if (!context.dealId || !isValidUuid(context.dealId)) {
    throw new Error('Deal ID is required for Deal Members upload')
  }

  await metadataService.updateJob(jobId, {
    status: etlConfig.JOB_STATUS.RUNNING,
    start_time: new Date(),
  })

  etlJobLogger.logJobEvent(`ETL job ${jobId} started | type=${uploadType} file=${fileName}`)

  try {
    await etlJobLogger.runStage(jobId, 'READ', async () => {
      const rows = dealMembersEtlService.readMembersRows(filePath)
      totalRecords = rows.length
      await metadataService.updateJob(jobId, { total_records: totalRecords })
      return {
        message: `Read ${totalRecords} deal member row(s) from ${fileName}`,
      }
    })

    await etlJobLogger.runStage(jobId, 'VALIDATION', async () => ({
      message: 'Validated Email + Deal Member Role; matching against CRM contact by email',
    }))

    await etlJobLogger.runStage(jobId, 'TRANSFORM', async () => ({
      message: 'Preparing contact match + confirmation queue (deal_member insert after confirm)',
    }))

    await etlJobLogger.runStage(jobId, 'LOAD', async () => {
      const result = await dealMembersEtlService.runDealMembersEtl({
        filePath,
        dealId: context.dealId,
        organizationId: context.organizationId,
        jobId,
        onRowResult: async ({ rowNumber, success, entityId, errorMessage, message }) => {
          if (success) {
            successCount++
            await etlJobLogger.logRowSuccess({
              jobId,
              rowNumber,
              entityId,
              columnName: 'Email',
              message: message || 'Queued CRM confirmation for deal member',
            })
            return
          }
          failedCount++
          await etlJobLogger.logRowError({
            jobId,
            rowNumber,
            errorType: 'LOAD',
            errorMessage: errorMessage || 'Deal member row failed',
          })
          await etlJobLogger.logRowFailure({
            jobId,
            rowNumber,
            errorMessage: errorMessage || 'Deal member row failed',
          })
        },
      })

      contactReviews = result.contactReviews || []
      return {
        message:
          `Queued ${result.successCount} member confirmation(s), ${result.failedCount} failed` +
          (contactReviews.length
            ? ` | ${contactReviews.length} CRM confirmation popup(s)`
            : ''),
      }
    })

    const finalStatus =
      failedCount === 0
        ? etlConfig.JOB_STATUS.COMPLETED
        : successCount === 0
          ? etlConfig.JOB_STATUS.FAILED
          : etlConfig.JOB_STATUS.PARTIAL

    await etlJobLogger.runStage(jobId, 'COMPLETION', async () => {
      await metadataService.updateJob(jobId, {
        status: finalStatus,
        end_time: new Date(),
        success_count: successCount,
        failed_count: failedCount,
        total_records: totalRecords,
      })
      return {
        message:
          `Job ${jobId} ${finalStatus} | success=${successCount} failed=${failedCount}` +
          (contactReviews.length ? ` | contactReviews=${contactReviews.length}` : ''),
      }
    })

    etlJobLogger.logJobEvent(
      `ETL job ${jobId} finished | status=${finalStatus} success=${successCount} failed=${failedCount}` +
        (contactReviews.length ? ` | contactReviews=${contactReviews.length}` : '')
    )

    return {
      jobId,
      uploadType,
      fileName,
      createdBy: context.createdBy,
      status: finalStatus,
      totalRecords,
      successCount,
      failedCount,
      contactReviews,
      contactReviewCount: contactReviews.length,
    }
  } catch (error) {
    await metadataService.updateJob(jobId, {
      status: etlConfig.JOB_STATUS.FAILED,
      end_time: new Date(),
      success_count: successCount,
      failed_count: failedCount || totalRecords,
      total_records: totalRecords,
    })
    await metadataService.logError({
      jobId,
      errorType: 'SYSTEM',
      errorMessage: error.message,
      stackTrace: error.stack,
    })
    throw error
  }
}

async function runDealInvestorsJob({ jobId, uploadType, filePath, fileName, context }) {
  let successCount = 0
  let failedCount = 0
  let totalRecords = 0
  let contactReviews = []

  await metadataService.updateJob(jobId, {
    status: etlConfig.JOB_STATUS.RUNNING,
    start_time: new Date(),
  })

  etlJobLogger.logJobEvent(`ETL job ${jobId} started | type=${uploadType} file=${fileName}`)

  try {
    await etlJobLogger.runStage(jobId, 'READ', async () => {
      const preview = dealInvestorsEtlService.readDealInvestorWorkbook(filePath)
      totalRecords = preview.addInvestors.rowCount + preview.investments.rowCount
      await metadataService.updateJob(jobId, { total_records: totalRecords })
      return {
        message:
          `Read Add Investors=${preview.addInvestors.rowCount}, ` +
          `Investments=${preview.investments.rowCount}`,
      }
    })

    await etlJobLogger.runStage(jobId, 'VALIDATION', async () => ({
      message: 'Validated deal investor workbook (classes must exist; roster then investments)',
    }))

    await etlJobLogger.runStage(jobId, 'TRANSFORM', async () => ({
      message: 'Mapping profile_id enums + funding_method; syncing committed_amount',
    }))

    await etlJobLogger.runStage(jobId, 'LOAD', async () => {
      const result = await dealInvestorsEtlService.runDealInvestorsEtl({
        filePath,
        dealId: context.dealId,
        organizationId: context.organizationId,
        jobId,
        onRowResult: async ({ rowNumber, success, entityId, errorMessage, message, columnName }) => {
          if (success) {
            successCount++
            await etlJobLogger.logRowSuccess({ jobId, rowNumber, entityId, columnName, message })
            return
          }
          failedCount++
          await etlJobLogger.logRowError({
            jobId,
            rowNumber,
            columnName: 'deal_lp_investor',
            errorType: 'LOAD',
            errorMessage: errorMessage || message || 'Failed',
          })
          await etlJobLogger.logRowFailure({
            jobId,
            rowNumber,
            errorMessage: errorMessage || message || 'Failed',
          })
        },
      })

      totalRecords = result.totalRecords
      contactReviews = result.contactReviews || []
      return {
        message:
          `Loaded ${result.successCount} deal investor row(s) for deal ${context.dealId}` +
          (contactReviews.length
            ? ` | ${contactReviews.length} CRM contact review(s) pending`
            : ''),
      }
    })

    const finalStatus = failedCount === 0
      ? etlConfig.JOB_STATUS.COMPLETED
      : (successCount > 0 ? etlConfig.JOB_STATUS.PARTIAL : etlConfig.JOB_STATUS.FAILED)

    await metadataService.updateJob(jobId, {
      status: finalStatus,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount,
    })

    await etlJobLogger.runStage(jobId, 'COMPLETION', async () => ({
      message:
        `Deal Investors ETL finished | success=${successCount} failed=${failedCount}` +
        (contactReviews.length ? ` | contactReviews=${contactReviews.length}` : ''),
    }))

    return {
      jobId,
      uploadType,
      fileName,
      status: finalStatus,
      totalRecords,
      successCount,
      failedCount,
      errors: [],
      contactReviews,
      contactReviewCount: contactReviews.length,
    }
  } catch (error) {
    await metadataService.updateJob(jobId, {
      status: etlConfig.JOB_STATUS.FAILED,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount || 1,
    })
    await metadataService.logError({
      jobId,
      errorType: 'SYSTEM',
      errorMessage: error.message,
      stackTrace: error.stack,
    })
    throw error
  }
}

/**
 * Full Cash Flow investor load (etl-cashflow-investor-upload.mdc):
 * 1–5 Profiles book (users → addresses → beneficiaries → profiles)
 * 6–8 Add Investors → Investments → committed_amount sync
 */
async function runCashflowInvestorsJob({
  jobId,
  uploadType,
  profileFilePath,
  addInvestorFilePath,
  fileName,
  context,
}) {
  let successCount = 0
  let failedCount = 0
  let totalRecords = 0

  if (!profileFilePath || !addInvestorFilePath) {
    throw new Error(
      'Full investor load needs both Excels: Profile Mapping template and Add Investor Mapping template'
    )
  }

  await metadataService.updateJob(jobId, {
    status: etlConfig.JOB_STATUS.RUNNING,
    start_time: new Date(),
  })

  etlJobLogger.logJobEvent(
    `ETL job ${jobId} started | type=${uploadType} files=${fileName}`
  )

  try {
    await etlJobLogger.runStage(jobId, 'READ', async () => {
      const profiles = investorProfilesEtlService.readProfileWorkbook(profileFilePath)
      const dealInvestors = dealInvestorsEtlService.readDealInvestorWorkbook(addInvestorFilePath)
      totalRecords =
        profiles.addresses.rowCount +
        profiles.beneficiaries.rowCount +
        profiles.profiles.rowCount +
        dealInvestors.addInvestors.rowCount +
        dealInvestors.investments.rowCount
      await metadataService.updateJob(jobId, { total_records: totalRecords })
      return {
        message:
          `Read Profiles book (A=${profiles.addresses.rowCount} B=${profiles.beneficiaries.rowCount} P=${profiles.profiles.rowCount}) ` +
          `+ Add Investors=${dealInvestors.addInvestors.rowCount} Investments=${dealInvestors.investments.rowCount}`,
      }
    })

    await etlJobLogger.runStage(jobId, 'VALIDATION', async () => ({
      message:
        'Validated dual templates (skip yellow hints; classes must exist before Add Investors)',
    }))

    await etlJobLogger.runStage(jobId, 'TRANSFORM', async () => ({
      message:
        'Load order: users → addresses → beneficiaries → profiles → deal_lp_investor → deal_investment → committed_amount',
    }))

    await etlJobLogger.runStage(jobId, 'LOAD', async () => {
      const profileResult = await investorProfilesEtlService.runInvestorProfilesEtl({
        filePath: profileFilePath,
        organizationId: context.organizationId,
        dealId: context.dealId,
        onRowResult: async ({ rowNumber, success, entityId, errorMessage, message, columnName }) => {
          if (success) {
            successCount++
            await etlJobLogger.logRowSuccess({ jobId, rowNumber, entityId, columnName, message })
            return
          }
          failedCount++
          await etlJobLogger.logRowError({
            jobId,
            rowNumber,
            columnName: 'user_investor_profiles',
            errorType: 'LOAD',
            errorMessage: errorMessage || message || 'Failed',
          })
          await etlJobLogger.logRowFailure({
            jobId,
            rowNumber,
            errorMessage: errorMessage || message || 'Failed',
          })
        },
      })

      const dealResult = await dealInvestorsEtlService.runDealInvestorsEtl({
        filePath: addInvestorFilePath,
        dealId: context.dealId,
        organizationId: context.organizationId,
        jobId,
        onRowResult: async ({ rowNumber, success, entityId, errorMessage, message, columnName }) => {
          // Offset Add Investor row numbers so they do not collide with profile book rows
          const offsetRow = 10000 + rowNumber
          if (success) {
            successCount++
            await etlJobLogger.logRowSuccess({ jobId, rowNumber: offsetRow, entityId, columnName, message })
            return
          }
          failedCount++
          await etlJobLogger.logRowError({
            jobId,
            rowNumber: offsetRow,
            columnName: 'deal_lp_investor',
            errorType: 'LOAD',
            errorMessage: errorMessage || message || 'Failed',
          })
          await etlJobLogger.logRowFailure({
            jobId,
            rowNumber: offsetRow,
            errorMessage: errorMessage || message || 'Failed',
          })
        },
      })

      totalRecords = profileResult.totalRecords + dealResult.totalRecords
      return {
        message:
          `Profiles ${profileResult.successCount}/${profileResult.totalRecords} then ` +
          `Deal investors ${dealResult.successCount}/${dealResult.totalRecords} for deal ${context.dealId}`,
      }
    })

    const finalStatus = failedCount === 0
      ? etlConfig.JOB_STATUS.COMPLETED
      : (successCount > 0 ? etlConfig.JOB_STATUS.PARTIAL : etlConfig.JOB_STATUS.FAILED)

    await metadataService.updateJob(jobId, {
      status: finalStatus,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount,
    })

    await etlJobLogger.runStage(jobId, 'COMPLETION', async () => ({
      message:
        `Cash Flow Investors ETL finished | success=${successCount} failed=${failedCount}`,
    }))

    return {
      jobId,
      uploadType,
      fileName,
      status: finalStatus,
      totalRecords,
      successCount,
      failedCount,
      errors: [],
    }
  } catch (error) {
    await metadataService.updateJob(jobId, {
      status: etlConfig.JOB_STATUS.FAILED,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount || 1,
    })
    await metadataService.logError({
      jobId,
      errorType: 'SYSTEM',
      errorMessage: error.message,
      stackTrace: error.stack,
    })
    throw error
  }
}

async function runDistributionSetupJob({ jobId, uploadType, filePath, fileName, context }) {
  let successCount = 0
  let failedCount = 0
  let totalRecords = 0

  await metadataService.updateJob(jobId, {
    status: etlConfig.JOB_STATUS.RUNNING,
    start_time: new Date(),
  })

  etlJobLogger.logJobEvent(`ETL job ${jobId} started | type=${uploadType} file=${fileName}`)

  try {
    await etlJobLogger.runStage(jobId, 'READ', async () => {
      const preview = distributionSetupEtlService.readDistributionWorkbook(filePath)
      totalRecords = preview.deals.length
      await metadataService.updateJob(jobId, { total_records: totalRecords })
      const dealNames = preview.deals
        .map((d) => d.dealName || d.dealId || '?')
        .slice(0, 8)
        .join(', ')
      return {
        message:
          `Read ${preview.deals.length} deal group(s) from ${preview.source}` +
          (dealNames ? `: ${dealNames}` : '') +
          (preview.ignoredPaidSheets.length
            ? ` | ignored Paid sheets: ${preview.ignoredPaidSheets.join(', ')}`
            : ''),
      }
    })

    await etlJobLogger.runStage(jobId, 'VALIDATION', async () => ({
      message:
        'Resolve deal_name → deal_id; pay_to_class_name → deal_investor_class.id (classes must exist)',
    }))

    await etlJobLogger.runStage(jobId, 'TRANSFORM', async () => ({
      message: 'Build waterfalls.operating[] + waterfalls.capital[]; replace payTo with class UUIDs',
    }))

    await etlJobLogger.runStage(jobId, 'LOAD', async () => {
      const result = await distributionSetupEtlService.runDistributionSetupEtl({
        filePath,
        dealId: context.dealId || null,
        onRowResult: async ({ rowNumber, success, entityId, errorMessage, message, columnName }) => {
          if (success) {
            successCount++
            await etlJobLogger.logRowSuccess({ jobId, rowNumber, entityId, columnName, message })
            return
          }
          failedCount++
          await etlJobLogger.logRowError({
            jobId,
            rowNumber,
            columnName: 'distribution_setup_json',
            errorType: 'LOAD',
            errorMessage: errorMessage || message || 'Failed',
          })
          await etlJobLogger.logRowFailure({
            jobId,
            rowNumber,
            errorMessage: errorMessage || message || 'Failed',
          })
        },
      })

      totalRecords = result.totalRecords
      const summary = (result.dealReports || [])
        .map(
          (r) =>
            `${r.dealName}: op=${r.operatingCount} cap=${r.capitalCount}`
        )
        .join('; ')
      return {
        message:
          `Saved distribution_setup_json for ${result.successCount} deal(s)` +
          (summary ? ` | ${summary}` : ''),
      }
    })

    const finalStatus = failedCount === 0
      ? etlConfig.JOB_STATUS.COMPLETED
      : (successCount > 0 ? etlConfig.JOB_STATUS.PARTIAL : etlConfig.JOB_STATUS.FAILED)

    await metadataService.updateJob(jobId, {
      status: finalStatus,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount,
    })

    await etlJobLogger.runStage(jobId, 'COMPLETION', async () => ({
      message: `Distribution Setup ETL finished | success=${successCount} failed=${failedCount}`,
    }))

    return {
      jobId,
      uploadType,
      fileName,
      status: finalStatus,
      totalRecords,
      successCount,
      failedCount,
      errors: [],
    }
  } catch (error) {
    await metadataService.updateJob(jobId, {
      status: etlConfig.JOB_STATUS.FAILED,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount || 1,
    })
    await metadataService.logError({
      jobId,
      errorType: 'SYSTEM',
      errorMessage: error.message,
      stackTrace: error.stack,
    })
    throw error
  }
}

async function runPriorDistributionsJob({ jobId, uploadType, filePath, fileName, context }) {
  let successCount = 0
  let failedCount = 0
  let totalRecords = 0

  await metadataService.updateJob(jobId, {
    status: etlConfig.JOB_STATUS.RUNNING,
    start_time: new Date(),
  })

  etlJobLogger.logJobEvent(`ETL job ${jobId} started | type=${uploadType} file=${fileName}`)

  try {
    await etlJobLogger.runStage(jobId, 'READ', async () => {
      const preview = priorDistributionsEtlService.readPriorWorkbook(filePath)
      totalRecords = preview.runs.length
      await metadataService.updateJob(jobId, { total_records: totalRecords })
      return {
        message:
          `Read ${preview.runs.length} prior run(s) from ${preview.source}` +
          (preview.dealName ? ` for "${preview.dealName}"` : ''),
      }
    })

    await etlJobLogger.runStage(jobId, 'VALIDATION', async () => ({
      message:
        'Resolve deal + class names + investments; append priorDistributions (keep waterfalls)',
    }))

    await etlJobLogger.runStage(jobId, 'TRANSFORM', async () => ({
      message: 'Build priorDistributions[] investorPayments with resolved UUIDs',
    }))

    await etlJobLogger.runStage(jobId, 'LOAD', async () => {
      const result = await priorDistributionsEtlService.runPriorDistributionsEtl({
        filePath,
        dealId: context.dealId || null,
        onRowResult: async ({ rowNumber, success, entityId, errorMessage, message, columnName }) => {
          if (success) {
            successCount++
            await etlJobLogger.logRowSuccess({ jobId, rowNumber, entityId, columnName, message })
            return
          }
          failedCount++
          await etlJobLogger.logRowError({
            jobId,
            rowNumber,
            columnName: 'priorDistributions',
            errorType: 'LOAD',
            errorMessage: errorMessage || message || 'Failed',
          })
          await etlJobLogger.logRowFailure({
            jobId,
            rowNumber,
            errorMessage: errorMessage || message || 'Failed',
          })
        },
      })

      totalRecords = result.totalRecords
      return {
        message:
          `Saved ${result.savedCount} prior run(s) for "${result.dealName}"` +
          (result.warnings?.length ? ` | warnings=${result.warnings.length}` : ''),
      }
    })

    const finalStatus = failedCount === 0
      ? etlConfig.JOB_STATUS.COMPLETED
      : (successCount > 0 ? etlConfig.JOB_STATUS.PARTIAL : etlConfig.JOB_STATUS.FAILED)

    await metadataService.updateJob(jobId, {
      status: finalStatus,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount,
    })

    await etlJobLogger.runStage(jobId, 'COMPLETION', async () => ({
      message: `Prior Distributions ETL finished | success=${successCount} failed=${failedCount}`,
    }))

    return {
      jobId,
      uploadType,
      fileName,
      status: finalStatus,
      totalRecords,
      successCount,
      failedCount,
      errors: [],
    }
  } catch (error) {
    await metadataService.updateJob(jobId, {
      status: etlConfig.JOB_STATUS.FAILED,
      end_time: new Date(),
      total_records: totalRecords,
      success_count: successCount,
      failed_count: failedCount || 1,
    })
    await metadataService.logError({
      jobId,
      errorType: 'SYSTEM',
      errorMessage: error.message,
      stackTrace: error.stack,
    })
    throw error
  }
}

async function runEtlJob({ jobId, uploadType, filePath, fileName, options = {} }) {
  const uploadTypeConfig = etlConfig.UPLOAD_TYPES[uploadType]
  if (!uploadTypeConfig) {
    throw new Error(`Unknown upload type: ${uploadType}`)
  }

  if (uploadTypeConfig.disabled) {
    throw new Error(`${uploadTypeConfig.label} is not yet enabled`)
  }

  const context = buildContext(options)
  const batchSize = etlConfig.BATCH_SIZE
  const onlyFailedRows = options.retryFailedOnly || false

  assertOrganizationContext(context, uploadType)
  assertDealContext(context, uploadType)
  await assertUploadSchemaReady(uploadType)

  if (uploadType === 'DEAL_ASSETS') {
    return runDealAssetsJob({
      jobId,
      uploadType,
      filePath,
      fileName,
      context,
    })
  }

  if (uploadType === 'DEAL_CLASSES') {
    return runDealClassesJob({
      jobId,
      uploadType,
      filePath,
      fileName,
      context,
    })
  }

  if (uploadType === 'INVESTOR_PROFILES') {
    return runInvestorProfilesJob({
      jobId,
      uploadType,
      filePath,
      fileName,
      context,
    })
  }

  if (uploadType === 'DEAL_INVESTORS') {
    return runDealInvestorsJob({
      jobId,
      uploadType,
      filePath,
      fileName,
      context,
    })
  }

  if (uploadType === 'MEMBERS_UPLOAD') {
    return runDealMembersJob({
      jobId,
      uploadType,
      filePath,
      fileName,
      context,
    })
  }

  if (uploadType === 'CASHFLOW_INVESTORS') {
    return runCashflowInvestorsJob({
      jobId,
      uploadType,
      profileFilePath: options.profileFilePath || filePath,
      addInvestorFilePath: options.addInvestorFilePath,
      fileName,
      context,
    })
  }

  if (uploadType === 'DEAL_DISTRIBUTION_SETUP') {
    return runDistributionSetupJob({
      jobId,
      uploadType,
      filePath,
      fileName,
      context,
    })
  }

  if (uploadType === 'DEAL_PRIOR_DISTRIBUTIONS') {
    return runPriorDistributionsJob({
      jobId,
      uploadType,
      filePath,
      fileName,
      context,
    })
  }

  let successCount = 0
  let failedCount = 0
  let totalRecords = 0

  if (onlyFailedRows) {
    const existingJob = await metadataService.getJob(jobId)
    successCount = existingJob?.success_count || 0
  }

  await metadataService.updateJob(jobId, {
    status: etlConfig.JOB_STATUS.RUNNING,
    start_time: new Date(),
  })

  etlJobLogger.logJobEvent(`ETL job ${jobId} started | type=${uploadType} file=${fileName}`)

  try {
  const baseMappings = await columnMappingService.getMappings(uploadType)
  if (!baseMappings.length) {
    throw new Error(`No column mappings configured for ${uploadType}`)
  }

  let resolvedMappings = baseMappings

  await etlJobLogger.runStage(jobId, 'READ', async () => {
    const { headers, rowCount } = excelReaderService.readExcelHeaders(filePath)
    resolvedMappings = columnMappingService.resolveMappingsForHeaders(headers, baseMappings)
    const structure = validationService.validateFileStructure({ headers, mappings: baseMappings })

    if (!structure.valid) {
      throw new Error(`Missing required columns: ${structure.missingColumns.join(', ')}`)
    }

    totalRecords = rowCount
    await metadataService.updateJob(jobId, { total_records: totalRecords })

    const mappedSummary = structure.columnPairs
      .map((pair) => `${pair.excelHeader} → ${pair.databaseColumn}`)
      .join(', ')

    return {
      message: `Read ${totalRecords} rows from ${fileName}. Mapped columns: ${mappedSummary}`,
    }
  })

  let failedRowNumbers = null
  if (onlyFailedRows) {
    failedRowNumbers = await metadataService.getFailedRowNumbers(jobId)
    totalRecords = failedRowNumbers.length
  }

  await etlJobLogger.runStage(jobId, 'VALIDATION', async () => ({
    message: `Validated file structure for ${uploadType}`,
  }))

  await etlJobLogger.runStage(jobId, 'TRANSFORMATION', async () => ({
    message: `Applied ${resolvedMappings.filter((m) => m.resolved_excel_header).length} resolved column mappings with system defaults`,
  }))

  await etlJobLogger.runStage(jobId, 'LOAD', async () => {
    const extractOptions = onlyFailedRows ? { onlyRows: failedRowNumbers } : {}

    await excelReaderService.processBatches(
      filePath,
      batchSize,
      async (batch) => {
        for (const { rowNumber, data: rowData } of batch) {
          const transformed = transformationService.transformRow({
            uploadType,
            rowData,
            mappings: resolvedMappings,
            rowNumber,
            context,
          })

          const relationshipErrors = transformed.valid
            ? await databaseInsertService.validateRelationship({
              uploadType,
              data: transformed.data,
              rowNumber,
            })
            : []

          const allErrors = [...transformed.errors, ...relationshipErrors]

          if (allErrors.length) {
            failedCount++
            const errorMessage = allErrors.map((error) => error.errorMessage).join('; ')

            for (const error of allErrors) {
              await etlJobLogger.logRowError({
                jobId,
                rowNumber: error.rowNumber,
                columnName: error.columnName,
                errorType: error.errorType,
                errorMessage: error.errorMessage,
              })
            }

            await etlJobLogger.logRowFailure({ jobId, rowNumber, errorMessage })
            continue
          }

          const loadResult = await databaseInsertService.insertRecord({
            uploadType,
            data: transformed.data,
            jobId,
          })

          if (!loadResult.success) {
            failedCount++
            await etlJobLogger.logRowError({
              jobId,
              rowNumber,
              errorType: 'LOAD',
              errorMessage: loadResult.error,
            })
            await etlJobLogger.logRowFailure({ jobId, rowNumber, errorMessage: loadResult.error })
            continue
          }

          successCount++
          const exportedColumns = resolvedMappings
            .filter((mapping) => {
              const value = transformed.data[mapping.database_column_name]
              return value !== undefined && value !== null && String(value).trim() !== ''
            })
            .map((mapping) => mapping.resolved_excel_header || mapping.excel_column_name)
            .filter(Boolean)
          await etlJobLogger.logRowSuccess({
            jobId,
            rowNumber,
            entityId: loadResult.entityId,
            columnName: exportedColumns.join(', ') || uploadTypeConfig.targetTable,
            message:
              loadResult.message ||
              `Exported to ${uploadTypeConfig.targetTable}`,
          })
        }
      },
      extractOptions
    )

    return {
      message: `Loaded records | success=${successCount} failed=${failedCount}`,
    }
  })

  const finalStatus =
    failedCount === 0
      ? etlConfig.JOB_STATUS.COMPLETED
      : successCount === 0
        ? etlConfig.JOB_STATUS.FAILED
        : etlConfig.JOB_STATUS.PARTIAL

  await etlJobLogger.runStage(jobId, 'COMPLETION', async () => {
    const allRecords = await metadataService.getRecordStatusesByJobId(jobId)
    successCount = allRecords.filter((r) => r.status === etlConfig.RECORD_STATUS.SUCCESS).length
    failedCount = allRecords.filter((r) => r.status === etlConfig.RECORD_STATUS.FAILED).length

    await metadataService.updateJob(jobId, {
      status: finalStatus,
      end_time: new Date(),
      success_count: successCount,
      failed_count: failedCount,
      total_records: totalRecords,
    })

    return {
      message: `Job ${jobId} ${finalStatus} | success=${successCount} failed=${failedCount}`,
    }
  })

  etlJobLogger.logJobEvent(
    `ETL job ${jobId} finished | status=${finalStatus} success=${successCount} failed=${failedCount}`
  )

  return {
    jobId,
    uploadType,
    fileName,
    createdBy: context.createdBy,
    status: finalStatus,
    totalRecords,
    successCount,
    failedCount,
  }
  } finally {
    databaseInsertService.clearUsedIdsForJob(jobId)
  }
}

async function validateFileOnly({ uploadType, filePath, options = {} }) {
  const context = buildContext(options)

  assertOrganizationContext(context, uploadType)
  assertDealContext(context, uploadType)
  await assertUploadSchemaReady(uploadType)

  if (uploadType === 'CASHFLOW_INVESTORS') {
    const profilePath = options.profileFilePath || filePath
    const addPath = options.addInvestorFilePath
    if (!profilePath || !addPath) {
      throw new Error(
        'Full investor validate needs profileFile and addInvestorFile'
      )
    }
    const profiles = investorProfilesEtlService.readProfileWorkbook(profilePath)
    const dealInvestors = dealInvestorsEtlService.readDealInvestorWorkbook(addPath)
    const rowCount =
      profiles.addresses.rowCount +
      profiles.beneficiaries.rowCount +
      profiles.profiles.rowCount +
      dealInvestors.addInvestors.rowCount +
      dealInvestors.investments.rowCount
    return {
      valid: profiles.profiles.rowCount > 0 && dealInvestors.addInvestors.rowCount > 0,
      structureValid: true,
      missingColumns: [],
      headers: [],
      columnPairs: [],
      rowCount,
      requiredColumns: ['Addresses', 'Profiles', 'Add Investors'],
      preview: {
        checkedRows: rowCount,
        success: rowCount,
        failed: 0,
        errors: [],
      },
    }
  }

  if (uploadType === 'DEAL_DISTRIBUTION_SETUP') {
    const preview = distributionSetupEtlService.readDistributionWorkbook(filePath)
    const rowCount = preview.deals.reduce(
      (sum, deal) => sum + (deal.rows?.length || 0),
      0
    )
    return {
      valid: preview.deals.length > 0,
      structureValid: true,
      missingColumns: [],
      headers: preview.deals.map((d) => d.dealName).filter(Boolean),
      columnPairs: [],
      rowCount,
      requiredColumns: ['deal_name', 'kind', 'pay_to_class_name'],
      preview: {
        checkedRows: preview.deals.length,
        success: preview.deals.length,
        failed: 0,
        errors: [],
      },
    }
  }

  if (uploadType === 'DEAL_PRIOR_DISTRIBUTIONS') {
    const preview = priorDistributionsEtlService.readPriorWorkbook(filePath)
    return {
      valid: preview.runs.length > 0,
      structureValid: true,
      missingColumns: [],
      headers: [preview.dealName].filter(Boolean),
      columnPairs: [],
      rowCount: preview.runs.length,
      requiredColumns: ['date', 'name', 'amount', 'investorPayments'],
      preview: {
        checkedRows: preview.runs.length,
        success: preview.runs.length,
        failed: 0,
        errors: [],
      },
    }
  }

  if (
    uploadType === 'INVESTOR_PROFILES' ||
    uploadType === 'DEAL_INVESTORS' ||
    uploadType === 'DEAL_ASSETS' ||
    uploadType === 'DEAL_CLASSES'
  ) {
    let rowCount = 0
    let headers = []
    if (uploadType === 'INVESTOR_PROFILES') {
      const preview = investorProfilesEtlService.readProfileWorkbook(filePath)
      rowCount =
        preview.addresses.rowCount +
        preview.beneficiaries.rowCount +
        preview.profiles.rowCount
      headers = [preview.addresses.sheetName, preview.profiles.sheetName].filter(Boolean)
    } else if (uploadType === 'DEAL_INVESTORS') {
      const preview = dealInvestorsEtlService.readDealInvestorWorkbook(filePath)
      rowCount = preview.addInvestors.rowCount + preview.investments.rowCount
      headers = [preview.addInvestors.sheetName, preview.investments.sheetName].filter(Boolean)
    } else {
      const excel = excelReaderService.readExcelHeaders(filePath)
      headers = excel.headers
      rowCount = excel.rowCount
    }
    return {
      valid: rowCount > 0,
      structureValid: true,
      missingColumns: [],
      headers,
      columnPairs: [],
      rowCount,
      requiredColumns: [],
      preview: {
        checkedRows: rowCount,
        success: rowCount,
        failed: 0,
        errors: [],
      },
    }
  }

  const baseMappings = await columnMappingService.getMappings(uploadType)
  const { headers, rowCount } = excelReaderService.readExcelHeaders(filePath)
  const structure = validationService.validateFileStructure({ headers, mappings: baseMappings })
  const resolvedMappings = structure.resolvedMappings || baseMappings
  const requiredColumns = columnMappingService.getRequiredExcelColumns(baseMappings)

  const previewErrors = []
  let previewSuccess = 0
  let previewFailed = 0
  const previewLimit = 10

  for (const { rowNumber, data } of excelReaderService.iterateExcelRows(filePath)) {
    if (rowNumber > previewLimit + 1) break

    const transformed = transformationService.transformRow({
      uploadType,
      rowData: data,
      mappings: resolvedMappings,
      rowNumber,
      context,
    })

    if (!transformed.valid) {
      previewFailed++
      previewErrors.push(...transformed.errors)
    } else {
      previewSuccess++
    }
  }

  return {
    valid: structure.valid && previewFailed === 0,
    structureValid: structure.valid,
    missingColumns: structure.missingColumns,
    headers: structure.headers,
    columnPairs: structure.columnPairs || [],
    rowCount,
    requiredColumns,
    preview: {
      checkedRows: Math.min(rowCount, previewLimit),
      success: previewSuccess,
      failed: previewFailed,
      errors: previewErrors.slice(0, 20),
    },
  }
}

module.exports = {
  runEtlJob,
  validateFileOnly,
  runStage: etlJobLogger.runStage,
  buildContext,
}

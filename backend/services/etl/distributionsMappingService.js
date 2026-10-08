const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { logAudit, logError } = require('../logger')

const PYTHON_ROOT = path.resolve(__dirname, '..', '..', '..', 'python', 'distributions_mapping')
const MAP_FOLDER = path.resolve(__dirname, '..', '..', '..', 'python', 'mapFolder')
const SCRIPT_PATH = path.join(PYTHON_ROOT, 'processor.py')
const PROMOTE_SCRIPT_PATH = path.join(PYTHON_ROOT, 'promote_processor.py')

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function toPublicUrl(folderName, fileName) {
  return `/mapFolder/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`
}

function friendlyError(raw) {
  const message = String(raw || '').trim()
  if (!message) return 'Processing failed. Please review the uploaded file.'
  if (/Classes sheet not found/i.test(message)) {
    return 'Classes sheet not found. Upload a Class_Mapping_FILLED.xlsx file.'
  }
  if (/No class rows/i.test(message)) {
    return 'No class rows found in the Class Mapping workbook.'
  }
  if (/Please upload an Excel/i.test(message)) {
    return 'Please upload an Excel (.xlsx) Class Mapping file.'
  }
  if (/No distribution waterfall/i.test(message)) {
    return 'No distribution waterfall rows could be generated from the Class Mapping file.'
  }
  return message.length > 240
    ? 'Processing failed. Please review the uploaded file.'
    : message
}

function runPython({ inputPath, outDir, dealId, scriptPath = SCRIPT_PATH }) {
  return new Promise((resolve, reject) => {
    const args = [scriptPath, inputPath, '--out-dir', outDir, '--json']
    const dealIdValue = String(dealId || '').trim()
    if (dealIdValue) args.push('--deal-id', dealIdValue)

    const child = spawn('python', args, {
      cwd: PYTHON_ROOT,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(new Error(
        error.code === 'ENOENT'
          ? 'Python is required to process Distribution Setup mapping.'
          : error.message
      ))
    })

    child.on('close', (code) => {
      if (code === 0) {
        try {
          const jsonLine = stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .reverse()
            .find((line) => line.startsWith('{'))

          if (!jsonLine) {
            reject(new Error('Processing failed. Please review the uploaded file.'))
            return
          }
          resolve(JSON.parse(jsonLine))
          return
        } catch {
          reject(new Error('Processing failed. Please review the uploaded file.'))
          return
        }
      }

      let parsedError = null
      try {
        const errLine = stderr
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .reverse()
          .find((line) => line.startsWith('{'))
        if (errLine) parsedError = JSON.parse(errLine).error
      } catch {
        // fall through
      }

      const fallback = stderr
        .split(/\r?\n/)
        .map((line) => line.replace(/^ERROR:\s*/, '').trim())
        .filter(Boolean)
        .pop()

      reject(new Error(friendlyError(parsedError || fallback || stdout || stderr)))
    })
  })
}

async function generateDistributionsFromClassWorkbook({
  filePath,
  originalName,
  dealId,
  deleteInput = false,
}) {
  if (!filePath || !fs.existsSync(filePath)) {
    const error = new Error('Please upload an Excel (.xlsx) Class Mapping file.')
    error.status = 400
    throw error
  }

  const ext = path.extname(originalName || filePath).toLowerCase()
  if (ext !== '.xlsx') {
    const error = new Error('Please upload an Excel (.xlsx) Class Mapping file.')
    error.status = 400
    throw error
  }

  if (!fs.existsSync(SCRIPT_PATH)) {
    const error = new Error('Distribution mapping script is missing on the server.')
    error.status = 500
    throw error
  }

  ensureDir(MAP_FOLDER)
  logAudit(
    `Distribution mapping started: ${originalName || path.basename(filePath)} → ${MAP_FOLDER}`
  )

  try {
    const result = await runPython({
      inputPath: filePath,
      outDir: MAP_FOLDER,
      dealId,
      scriptPath: SCRIPT_PATH,
    })
    const dealFolders = Array.isArray(result.dealFolders) ? result.dealFolders : []
    const warnings = Array.isArray(result.warnings) ? result.warnings : []
    const summary = result.summary || {}
    const primary = dealFolders[0]

    if (!primary?.folderName) {
      const error = new Error('Processing failed. Please review the uploaded file.')
      error.status = 500
      throw error
    }

    const workbookPath = path.join(MAP_FOLDER, primary.folderName, 'ETL_Distribution_Setup_FILLED.xlsx')
    const payloadPath = path.join(
      MAP_FOLDER,
      primary.folderName,
      'ETL_Distribution_Setup_FILLED.payload.json'
    )
    const warningsPath = path.join(MAP_FOLDER, primary.folderName, 'warnings.txt')
    const promotePath = path.join(
      MAP_FOLDER,
      primary.folderName,
      'ETL_Class_Promote_FILLED.payload.json'
    )

    if (!fs.existsSync(workbookPath) || !fs.existsSync(payloadPath)) {
      const error = new Error('Processing failed. Please review the uploaded file.')
      error.status = 500
      throw error
    }

    let promoteSummary = null
    try {
      if (fs.existsSync(PROMOTE_SCRIPT_PATH)) {
        const promoteResult = await runPython({
          inputPath: filePath,
          outDir: MAP_FOLDER,
          dealId,
          scriptPath: PROMOTE_SCRIPT_PATH,
        })
        promoteSummary = promoteResult.summary || null
        if (Array.isArray(promoteResult.warnings)) {
          warnings.push(...promoteResult.warnings)
        }
      }
    } catch (promoteError) {
      warnings.push(`Promote mapping skipped: ${promoteError.message}`)
    }

    logAudit(
      `Distribution mapping completed: deal=${primary.folderName} operating=${summary.operatingRows || 0} capital=${summary.capitalRows || 0}`
    )

    const downloads = {
      workbook: toPublicUrl(primary.folderName, 'ETL_Distribution_Setup_FILLED.xlsx'),
      payload: toPublicUrl(primary.folderName, 'ETL_Distribution_Setup_FILLED.payload.json'),
      promote: fs.existsSync(promotePath)
        ? toPublicUrl(primary.folderName, 'ETL_Class_Promote_FILLED.payload.json')
        : null,
      warnings: fs.existsSync(warningsPath)
        ? toPublicUrl(primary.folderName, 'warnings.txt')
        : null,
    }

    return {
      success: true,
      mapFolder: 'python/mapFolder',
      summary: {
        dealName: summary.dealName || primary.dealName || '',
        dealId: summary.dealId || String(dealId || '').trim() || '',
        operatingRows: summary.operatingRows || 0,
        capitalRows: summary.capitalRows || 0,
        targetRaise: summary.targetRaise || '',
        promoteHurdles: promoteSummary?.hurdles || 0,
        warnings: warnings.length,
      },
      warnings,
      dealFolders: [
        {
          dealName: summary.dealName || primary.dealName || primary.folderName,
          folderName: primary.folderName,
          folderPath: `python/mapFolder/${primary.folderName}`,
          downloads,
        },
      ],
      downloads,
    }
  } catch (error) {
    logError('DISTRIBUTIONS_MAP', error.message)
    if (!error.status) error.status = 400
    throw error
  } finally {
    if (!deleteInput) return
    try {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
      // ignore cleanup failures
    }
  }
}

async function processDistributionsMapping({ filePath, originalName, dealId }) {
  return generateDistributionsFromClassWorkbook({
    filePath,
    originalName,
    dealId,
    deleteInput: true,
  })
}

module.exports = {
  processDistributionsMapping,
  generateDistributionsFromClassWorkbook,
  MAP_FOLDER,
}

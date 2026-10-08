const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { logAudit, logError } = require('../logger')

const PYTHON_ROOT = path.resolve(__dirname, '..', '..', '..', 'python', 'distributions_mapping')
const MAP_FOLDER = path.resolve(__dirname, '..', '..', '..', 'python', 'mapFolder')
const SCRIPT_PATH = path.join(PYTHON_ROOT, 'prior_processor.py')

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function toPublicUrl(folderName, fileName) {
  return `/mapFolder/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`
}

function OUT_XLSX_NAME() {
  return 'ETL_Distributions_Paid_FILLED.xlsx'
}

function OUT_PAYLOAD_NAME() {
  return 'ETL_Distributions_Paid_FILLED.payload.json'
}

function friendlyError(raw) {
  const message = String(raw || '').trim()
  if (!message) return 'Processing failed. Please review the uploaded file.'
  if (/Distributions by investment/i.test(message) || /Payment details/i.test(message)) {
    return (
      "Upload Cash Flow period Excel(s) with a 'Payment details…' sheet, " +
      "or a distributions-paid workbook with 'Distributions by investment'."
    )
  }
  if (/No paid distribution rows/i.test(message)) {
    return 'No paid distribution rows found in the workbook.'
  }
  if (/No prior distribution runs/i.test(message) || /No distribution runs/i.test(message)) {
    return 'No prior distribution runs could be generated (check Net payment values).'
  }
  if (/Please upload an Excel/i.test(message) || /No Excel/i.test(message)) {
    return 'Please upload one or more Excel (.xlsx) distribution files.'
  }
  return message.length > 240
    ? 'Processing failed. Please review the uploaded file.'
    : message
}

function runPython({ inputPaths, inputDir, outDir, dealId }) {
  return new Promise((resolve, reject) => {
    const args = [SCRIPT_PATH, '--out-dir', outDir, '--json']
    const dealIdValue = String(dealId || '').trim()
    if (dealIdValue) args.push('--deal-id', dealIdValue)
    if (inputDir) args.push('--input-dir', inputDir)
    for (const p of inputPaths || []) args.push(p)

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
          ? 'Python is required to process Prior Distributions mapping.'
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

/**
 * Map one or many Cash Flow distribution Excels → FILLED prior payload.
 * Each period / Payment-details file becomes one Deal → Distributions row
 * (investorPayments populate Distribution Details).
 */
async function processPriorDistributionsMapping({
  filePath,
  filePaths,
  originalName,
  dealId,
  inputDir,
  deleteInput = true,
}) {
  const paths = []
  if (Array.isArray(filePaths)) {
    for (const p of filePaths) {
      if (p && fs.existsSync(p)) paths.push(p)
    }
  }
  if (filePath && fs.existsSync(filePath) && !paths.includes(filePath)) {
    paths.push(filePath)
  }

  if (!paths.length && !inputDir) {
    const error = new Error(
      'Please upload one or more Excel (.xlsx) distribution files ' +
        "(period Payment-details or distributions-paid)."
    )
    error.status = 400
    throw error
  }

  for (const p of paths) {
    const ext = path.extname(p).toLowerCase()
    if (ext !== '.xlsx') {
      const error = new Error('Please upload Excel (.xlsx) distribution files only.')
      error.status = 400
      throw error
    }
  }

  if (!fs.existsSync(SCRIPT_PATH)) {
    const error = new Error('Prior Distributions mapping script is missing on the server.')
    error.status = 500
    throw error
  }

  ensureDir(MAP_FOLDER)
  const label =
    paths.length > 1
      ? `${paths.length} files`
      : originalName || (paths[0] ? path.basename(paths[0]) : inputDir || 'folder')
  logAudit(`Prior Distributions mapping started: ${label} → ${MAP_FOLDER}`)

  try {
    const result = await runPython({
      inputPaths: paths,
      inputDir: inputDir || '',
      outDir: MAP_FOLDER,
      dealId,
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

    const workbookPath = path.join(MAP_FOLDER, primary.folderName, OUT_XLSX_NAME())
    const payloadPath = path.join(MAP_FOLDER, primary.folderName, OUT_PAYLOAD_NAME())
    const warningsPath = path.join(MAP_FOLDER, primary.folderName, 'warnings.txt')

    if (!fs.existsSync(workbookPath) || !fs.existsSync(payloadPath)) {
      const error = new Error('Processing failed. Please review the uploaded file.')
      error.status = 500
      throw error
    }

    logAudit(
      `Prior Distributions mapping completed: deal=${primary.folderName} ` +
        `runs=${summary.runCount || 0} files=${summary.fileCount || paths.length || 1}`
    )

    const downloads = {
      workbook: toPublicUrl(primary.folderName, OUT_XLSX_NAME()),
      payload: toPublicUrl(primary.folderName, OUT_PAYLOAD_NAME()),
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
        runCount: summary.runCount || 0,
        totalPaid: summary.totalPaid || 0,
        lineCount: summary.lineCount || 0,
        fileCount: summary.fileCount || paths.length || 1,
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
    logError('PRIOR_DISTRIBUTIONS_MAP', error.message)
    if (!error.status) error.status = 400
    throw error
  } finally {
    if (!deleteInput) return
    for (const p of paths) {
      try {
        if (p && fs.existsSync(p)) fs.unlinkSync(p)
      } catch {
        // ignore
      }
    }
  }
}

module.exports = {
  processPriorDistributionsMapping,
  MAP_FOLDER,
}

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { logAudit, logError } = require('../logger')

const PYTHON_ROOT = path.resolve(__dirname, '..', '..', '..', 'python', 'profile_investors')
const PYTHON_BASE = path.resolve(__dirname, '..', '..', '..', 'python')
const MAP_FOLDER = path.resolve(__dirname, '..', '..', '..', 'python', 'mapFolder')
const SCRIPT_PATH = path.join(PYTHON_ROOT, 'processor.py')
const PROFILE_TEMPLATE = path.join(PYTHON_ROOT, 'templates', 'Add_Profile.xlsx')
const INVESTOR_TEMPLATE = path.join(PYTHON_ROOT, 'templates', 'Add_Investor_Mapping.xlsx')

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function resolvePythonExecutable() {
  const winVenv = path.join(PYTHON_BASE, 'venv', 'Scripts', 'python.exe')
  const nixVenv = path.join(PYTHON_BASE, 'venv', 'bin', 'python')
  if (process.platform === 'win32' && fs.existsSync(winVenv)) return winVenv
  if (fs.existsSync(nixVenv)) return nixVenv
  return process.platform === 'win32' ? 'python' : 'python3'
}

function toPublicUrl(folderName, fileName) {
  const stamp = Date.now()
  return `/mapFolder/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}?t=${stamp}`
}

function friendlyError(raw) {
  const message = String(raw || '').trim()
  if (!message) return 'Processing failed. Please review the uploaded file.'
  if (/Investors \(profile\).*not found/i.test(message) || /sheet not found/i.test(message)) {
    return 'Investors (profile) sheet not found.'
  }
  if (/Invalid Cash Flow Portal workbook/i.test(message)) {
    return 'Invalid Cash Flow Portal workbook.'
  }
  if (/No Excel|FileNotFound|not found/i.test(message)) {
    return 'Please upload an Excel (.xlsx) file.'
  }
  if (/openpyxl|Workbook|zip file|OLE2/i.test(message)) {
    return 'Invalid Cash Flow Portal workbook.'
  }
  return message.length > 240
    ? 'Processing failed. Please review the uploaded file.'
    : message
}

function runPython({ inputPath, outDir, membersPath }) {
  return new Promise((resolve, reject) => {
    const args = [
      SCRIPT_PATH,
      inputPath,
      '--out-dir',
      outDir,
      '--profile-template',
      PROFILE_TEMPLATE,
      '--investor-template',
      INVESTOR_TEMPLATE,
      '--json',
    ]
    if (membersPath) {
      args.push('--members-file', membersPath)
    }

    const child = spawn(resolvePythonExecutable(), args, {
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
          ? 'Python is required to process Cash Flow Portal Excel files.'
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

async function processCashFlowWorkbook({ filePath, originalName, membersFilePath, membersOriginalName }) {
  if (!filePath || !fs.existsSync(filePath)) {
    const error = new Error('Please upload an Excel (.xlsx) file.')
    error.status = 400
    throw error
  }

  const ext = path.extname(originalName || filePath).toLowerCase()
  if (ext !== '.xlsx') {
    const error = new Error('Please upload an Excel (.xlsx) file.')
    error.status = 400
    throw error
  }

  if (!fs.existsSync(SCRIPT_PATH)) {
    const error = new Error('Cash Flow mapping script is missing on the server.')
    error.status = 500
    throw error
  }
  if (!fs.existsSync(PROFILE_TEMPLATE) || !fs.existsSync(INVESTOR_TEMPLATE)) {
    const error = new Error('ETL template files are missing on the server.')
    error.status = 500
    throw error
  }

  ensureDir(MAP_FOLDER)

  if (!membersFilePath || !fs.existsSync(membersFilePath)) {
    const error = new Error('Please upload the Deal Members Excel (.xlsx) with sponsor names and emails.')
    error.status = 400
    throw error
  }

  const membersExt = path.extname(membersOriginalName || membersFilePath).toLowerCase()
  if (membersExt !== '.xlsx') {
    const error = new Error('Deal Members file must be an Excel (.xlsx) file.')
    error.status = 400
    throw error
  }

  logAudit(
    `Cash Flow mapping started: ${originalName || path.basename(filePath)} + ` +
    `${membersOriginalName || path.basename(membersFilePath)} → ${MAP_FOLDER}`
  )

  try {
    const result = await runPython({
      inputPath: filePath,
      outDir: MAP_FOLDER,
      membersPath: membersFilePath,
    })
    const dealFolders = Array.isArray(result.dealFolders) ? result.dealFolders : []
    const warnings = Array.isArray(result.warnings) ? result.warnings : []
    const summary = result.summary || {}

    if (!dealFolders.length) {
      const error = new Error('Processing failed. Please review the uploaded file.')
      error.status = 500
      throw error
    }

    const sourceBaseName = path.basename(originalName || filePath)
    const dealDownloads = dealFolders.map((deal) => {
      const folderName = deal.folderName
      const dealDir = path.join(MAP_FOLDER, folderName)
      const profileFileName = deal.profileFileName || `${folderName}_Add_Profile_FILLED.xlsx`
      const mappingFileName = deal.mappingFileName || `${folderName}_Add_Investor_Mapping_FILLED.xlsx`
      const profilePath = path.join(dealDir, profileFileName)
      const mappingPath = path.join(dealDir, mappingFileName)
      const warningsPath = path.join(dealDir, 'warnings.txt')

      if (!fs.existsSync(profilePath) || !fs.existsSync(mappingPath)) {
        const error = new Error('Processing failed. Please review the uploaded file.')
        error.status = 500
        throw error
      }

      // Keep a copy of the uploaded Cash Flow Excel in the deal folder for re-runs.
      try {
        const sourceCopy = path.join(dealDir, sourceBaseName)
        if (filePath && fs.existsSync(filePath)) {
          fs.copyFileSync(filePath, sourceCopy)
        }
      } catch {
        // non-fatal
      }

      try {
        const membersCopy = path.join(dealDir, membersOriginalName || path.basename(membersFilePath))
        if (membersFilePath && fs.existsSync(membersFilePath)) {
          fs.copyFileSync(membersFilePath, membersCopy)
        }
      } catch {
        // non-fatal
      }

      return {
        dealName: deal.dealName || folderName,
        folderName,
        folderPath: `python/mapFolder/${folderName}`,
        profiles: deal.profiles || 0,
        investments: deal.investments || 0,
        fileNames: {
          profile: profileFileName,
          mapping: mappingFileName,
        },
        downloads: {
          profile: toPublicUrl(folderName, profileFileName),
          mapping: toPublicUrl(folderName, mappingFileName),
          warnings: fs.existsSync(warningsPath)
            ? toPublicUrl(folderName, 'warnings.txt')
            : null,
        },
      }
    })

    const primary = dealDownloads[0]

    logAudit(
      `Cash Flow mapping completed: deals=${dealDownloads.length} profiles=${summary.profiles || 0} investments=${summary.investments || 0}`
    )

    return {
      success: true,
      mapFolder: 'python/mapFolder',
      summary: {
        profiles: summary.profiles || 0,
        investments: summary.investments || 0,
        deals: summary.deals || dealDownloads.length,
        beneficiaries: summary.beneficiaries || 0,
        warnings: warnings.length,
      },
      warnings,
      dealFolders: dealDownloads,
      downloads: primary.downloads,
    }
  } catch (error) {
    logError('CASHFLOW_MAP', error.message)
    if (!error.status) error.status = 400
    throw error
  } finally {
    try {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
      // ignore cleanup failures
    }
    try {
      if (membersFilePath && fs.existsSync(membersFilePath)) fs.unlinkSync(membersFilePath)
    } catch {
      // ignore cleanup failures
    }
  }
}

module.exports = {
  processCashFlowWorkbook,
  MAP_FOLDER,
}

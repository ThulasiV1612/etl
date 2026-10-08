const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { logAudit, logError } = require('../logger')

const PYTHON_ROOT = path.resolve(__dirname, '..', '..', '..', 'python', 'classes_mapping')
const PYTHON_BASE = path.resolve(__dirname, '..', '..', '..', 'python')
const MAP_FOLDER = path.resolve(__dirname, '..', '..', '..', 'python', 'mapFolder')
const SCRIPT_PATH = path.join(PYTHON_ROOT, 'processor.py')

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
  if (/Please upload a PDF/i.test(message)) {
    return 'Please upload a PDF (.pdf) file.'
  }
  if (/No classes parsed/i.test(message)) {
    return 'No classes parsed from the PDF. Please review the uploaded file.'
  }
  if (/Could not extract/i.test(message) || /tesseract/i.test(message)) {
    return 'Could not extract text from the PDF. Please review the uploaded file.'
  }
  if (/FileNotFound|not found/i.test(message)) {
    return 'Please upload a PDF (.pdf) file.'
  }
  return message.length > 240
    ? 'Processing failed. Please review the uploaded file.'
    : message
}

function runPython({ inputPath, outDir, dealName }) {
  return new Promise((resolve, reject) => {
    const args = [SCRIPT_PATH, inputPath, '--out-dir', outDir, '--json']
    if (dealName) {
      args.push('--deal-name', dealName)
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
          ? 'Python is required to process Cash Flow classes PDFs.'
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

async function processClassesPdf({ filePath, originalName, dealName }) {
  if (!filePath || !fs.existsSync(filePath)) {
    const error = new Error('Please upload a PDF (.pdf) file.')
    error.status = 400
    throw error
  }

  const ext = path.extname(originalName || filePath).toLowerCase()
  if (ext !== '.pdf') {
    const error = new Error('Please upload a PDF (.pdf) file.')
    error.status = 400
    throw error
  }

  if (!fs.existsSync(SCRIPT_PATH)) {
    const error = new Error('Classes mapping script is missing on the server.')
    error.status = 500
    throw error
  }

  ensureDir(MAP_FOLDER)

  logAudit(`Classes PDF mapping started: ${originalName || path.basename(filePath)} → ${MAP_FOLDER}`)

  try {
    const result = await runPython({
      inputPath: filePath,
      outDir: MAP_FOLDER,
      dealName: dealName || '',
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

    const mappingPath = path.join(MAP_FOLDER, primary.folderName, 'Class_Mapping_FILLED.xlsx')
    const warningsPath = path.join(MAP_FOLDER, primary.folderName, 'warnings.txt')

    if (!fs.existsSync(mappingPath)) {
      const error = new Error('Processing failed. Please review the uploaded file.')
      error.status = 500
      throw error
    }

    logAudit(
      `Classes PDF mapping completed: deal=${primary.folderName} classes=${summary.classes || 0}`
    )

    return {
      success: true,
      mapFolder: 'python/mapFolder',
      summary: {
        dealName: summary.dealName || primary.dealName || '',
        classes: summary.classes || 0,
        hurdles: summary.hurdles || 0,
        finalTiers: summary.finalTiers || 0,
        targetRaise: summary.targetRaise || '',
        warnings: warnings.length,
      },
      warnings,
      dealFolders: [
        {
          dealName: summary.dealName || primary.dealName || primary.folderName,
          folderName: primary.folderName,
          folderPath: `python/mapFolder/${primary.folderName}`,
          downloads: {
            mapping: toPublicUrl(primary.folderName, 'Class_Mapping_FILLED.xlsx'),
            warnings: fs.existsSync(warningsPath)
              ? toPublicUrl(primary.folderName, 'warnings.txt')
              : null,
          },
        },
      ],
      downloads: {
        mapping: toPublicUrl(primary.folderName, 'Class_Mapping_FILLED.xlsx'),
        warnings: fs.existsSync(warningsPath)
          ? toPublicUrl(primary.folderName, 'warnings.txt')
          : null,
      },
    }
  } catch (error) {
    logError('CLASSES_MAP', error.message)
    if (!error.status) error.status = 400
    throw error
  } finally {
    try {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
      // ignore cleanup failures
    }
  }
}

module.exports = {
  processClassesPdf,
  MAP_FOLDER,
}

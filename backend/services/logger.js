const fs = require('fs')
const path = require('path')
const winston = require('winston')

const logsDir = path.join(__dirname, '..', 'logs')

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

const timestampFormat = winston.format((info) => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  info.timestamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  return info
})

function createFileLogger(filename, level) {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      timestampFormat(),
      winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} | ${level.toUpperCase()} | ${message}`
      })
    ),
    transports: [
      new winston.transports.File({
        filename: path.join(logsDir, filename),
        level,
      }),
    ],
  })
}

const successLogger = createFileLogger('etl-success.log', 'info')
const errorLogger = createFileLogger('etl-error.log', 'error')
const auditLogger = createFileLogger('etl-audit.log', 'info')

function logSuccess(dealId, imageStatus = 'FOUND') {
  successLogger.info(`${dealId} inserted successfully | image=${imageStatus}`)
}

function logError(dealId, reason) {
  errorLogger.error(`${dealId} failed | reason=${reason}`)
}

function logAudit(message) {
  auditLogger.info(message)
}

module.exports = {
  logSuccess,
  logError,
  logAudit,
}

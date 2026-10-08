const { randomUUID, randomBytes } = require('crypto')

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_UNIQUE_ATTEMPTS = 10

function generateUuid() {
  return randomUUID()
}

function isValidUuid(value) {
  if (!value || typeof value !== 'string') return false
  return UUID_PATTERN.test(value.trim())
}

function createInvitedUsername() {
  return `invited_${randomBytes(12).toString('hex')}`
}

async function generateUniqueUuid({ existsCheck, usedIds = new Set() }) {
  for (let attempt = 0; attempt < MAX_UNIQUE_ATTEMPTS; attempt++) {
    const candidate = generateUuid()

    if (usedIds.has(candidate)) continue
    if (await existsCheck(candidate)) continue

    usedIds.add(candidate)
    return candidate
  }

  throw new Error('Failed to generate a unique UUID after multiple attempts')
}

module.exports = {
  generateUuid,
  generateUniqueUuid,
  createInvitedUsername,
  isValidUuid,
  UUID_PATTERN,
  MAX_UNIQUE_ATTEMPTS,
}

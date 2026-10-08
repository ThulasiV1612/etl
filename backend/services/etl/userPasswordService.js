const bcrypt = require('bcrypt')

const BCRYPT_ROUNDS = 10
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 16

function getLastTwoPhoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length >= 2) return digits.slice(-2)
  return digits.padStart(2, '0')
}

function generateUserPassword({ firstName, phone }) {
  const name = String(firstName || '').trim()
  const suffix = getLastTwoPhoneDigits(phone)
  let password = `${name}${suffix}`

  while (password.length < MIN_PASSWORD_LENGTH) {
    password += suffix
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    password = `${password.slice(0, MAX_PASSWORD_LENGTH - suffix.length)}${suffix}`
  }

  return password
}

async function hashUserPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS)
}

async function buildUserPasswordHash({ firstName, phone }) {
  const plainPassword = generateUserPassword({ firstName, phone })
  const passwordHash = await hashUserPassword(plainPassword)
  return { plainPassword, passwordHash }
}

module.exports = {
  BCRYPT_ROUNDS,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  generateUserPassword,
  hashUserPassword,
  buildUserPasswordHash,
}

/**
 * Placeholder / redacted emails from Cash Flow — store as-is (no @ required).
 * Matches Contacts.email storage: blank / privacy-redacted → "redacted".
 */

function isPlaceholderEmail(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return false
  if (raw.includes('@')) {
    // e.g. redacted@example.com still treated as a real-looking address
    return false
  }
  if (raw.startsWith('redacted__')) return true
  return (
    raw === 'redacted' ||
    raw === 'radicated' ||
    raw === '[redacted]' ||
    raw === '(redacted)' ||
    raw === 'n/a' ||
    raw === 'na' ||
    raw === '-' ||
    raw === 'none' ||
    raw === 'null'
  )
}

function isUsableEmailValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return false
  if (raw.includes('@')) return true
  return isPlaceholderEmail(raw)
}

/** Blank contact emails from redacted Cash Flow exports. */
const REDACTED_EMAIL_PLACEHOLDER = 'redacted'

/**
 * Contact-style email for DB (contact.email / deal_lp_investor.email):
 * empty or placeholder → "redacted". Real emails unchanged.
 */
function toContactStyleEmail(value) {
  const raw = String(value || '').trim()
  if (!raw || isPlaceholderEmail(raw)) return REDACTED_EMAIL_PLACEHOLDER
  return raw
}

module.exports = {
  isPlaceholderEmail,
  isUsableEmailValue,
  REDACTED_EMAIL_PLACEHOLDER,
  toContactStyleEmail,
}

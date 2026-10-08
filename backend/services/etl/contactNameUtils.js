/**
 * Contact name cleanup for ETL import.
 * Keeps letters (incl. accents), spaces, hyphen, and apostrophe.
 */

function sanitizeContactName(raw) {
  return String(raw || '')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/[^\p{L}\p{M}\s'-]/gu, ' ')
    .replace(/['-]+/g, (m) => m[0])
    .replace(/\s+/g, ' ')
    .trim()
}

function buildContactFullName(firstName, lastName, fallback = '') {
  const full = [firstName, lastName]
    .map((p) => sanitizeContactName(p))
    .filter(Boolean)
    .join(' ')
  return full || sanitizeContactName(fallback)
}

function splitFullName(fullName) {
  const parts = sanitizeContactName(fullName)
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) return { first_name: '', last_name: '' }
  if (parts.length === 1) return { first_name: parts[0], last_name: '' }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  }
}

module.exports = {
  sanitizeContactName,
  buildContactFullName,
  splitFullName,
}

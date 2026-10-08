/** U.S. SSN / ITIN — display XXX-XX-XXXX, store up to 9 digits. */

export const SSN_ITIN_LEN = 9

const REQUIRED_DEFAULT = "This field is required."

/** Strip non-digits; cap at 9 (national identifier). */
export function nineDigitsFromSsnItinInput(raw: string): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, SSN_ITIN_LEN)
}

/** Mask partial or full digit string as XXX-XX-XXXX. */
export function formatSsnItinDisplay(digits: string): string {
  const d = nineDigitsFromSsnItinInput(digits)
  if (d.length <= 3) return d
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

/** Use on input change — keeps only digits and applies dashes. */
export function formatSsnItinInput(raw: string): string {
  return formatSsnItinDisplay(nineDigitsFromSsnItinInput(raw))
}

/**
 * Mask SSN / ITIN for display — only the last 4 digits visible.
 * Uses ASCII "X" so the value sits on one baseline with the digits (bullets look uneven).
 * Idempotent for already-masked values (XXX-XX-1234 / •••-••-1234).
 * Examples: "" → ""; "1234" → "XXXX1234"; "123456789" → "XXX-XX-6789".
 */
export function maskSsnItinLast4(raw: string): string {
  const s = String(raw ?? "").trim()
  if (!s) return ""
  const compact = s.replace(/\s/g, "")
  const alreadyMasked = /^[X•x*]{3}-?[X•x*]{2}-?\d{4}$/.test(compact)
  if (alreadyMasked) {
    const last4 = compact.replace(/\D/g, "").slice(-4)
    return last4 ? `XXX-XX-${last4}` : ""
  }
  const d = nineDigitsFromSsnItinInput(s)
  if (!d) return ""
  if (d.length <= 4) return `XXXX${d}`
  return `XXX-XX-${d.slice(-4)}`
}

/** True when a field/answer key or label is an SSN / ITIN identifier. */
export function isSsnItinFieldKey(raw: string): boolean {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
  const compact = normalized.replace(/_/g, "")
  if (
    compact === "ssn" ||
    compact === "itin" ||
    compact === "tin" ||
    compact === "spousessn" ||
    compact === "socialsecurity" ||
    compact === "socialsecuritynumber" ||
    compact === "ssnitin"
  ) {
    return true
  }
  const label = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
  return (
    label === "ssn" ||
    label === "itin" ||
    label === "tin" ||
    label === "ssn / itin" ||
    label === "ssn/itin" ||
    label === "social security number" ||
    label === "social security" ||
    label === "spouse ssn"
  )
}

function parseSsnParts(d: string) {
  return {
    area: Number.parseInt(d.slice(0, 3), 10),
    group: Number.parseInt(d.slice(3, 5), 10),
    serial: Number.parseInt(d.slice(5, 9), 10),
  }
}

/** IRS-invalid SSN patterns (area / group / serial). */
export function isValidSsnNine(d: string): boolean {
  if (!/^\d{9}$/.test(d)) return false
  const { area, group, serial } = parseSsnParts(d)
  if (area === 0 || area === 666) return false
  if (area >= 900) return false
  if (group === 0) return false
  if (serial === 0) return false
  return true
}

/** ITIN: begins with 9; 4th–5th digits in IRS-allowed ranges. */
export function isValidItinNine(d: string): boolean {
  if (!/^\d{9}$/.test(d)) return false
  if (d[0] !== "9") return false
  const middle = Number.parseInt(d.slice(3, 5), 10)
  if (middle >= 70 && middle <= 88) return true
  if (middle === 90 || middle === 92) return true
  if (middle >= 94 && middle <= 99) return true
  return false
}

export function isValidSsnOrItinNine(d: string): boolean {
  if (!/^\d{9}$/.test(d)) return false
  if (d[0] === "9") return isValidItinNine(d)
  return isValidSsnNine(d)
}

export type SsnItinInlineStatus = "ok" | "empty" | "incomplete" | "invalid"

export function ssnItinInlineStatus(raw: string): SsnItinInlineStatus {
  const d = nineDigitsFromSsnItinInput(raw)
  if (!d.length) return "empty"
  if (d.length < SSN_ITIN_LEN) return "incomplete"
  if (!isValidSsnOrItinNine(d)) return "invalid"
  return "ok"
}

export function ssnItinFieldError(
  raw: string,
  opts?: { required?: boolean; requiredMessage?: string },
): string | null {
  const required = opts?.required ?? false
  const requiredMessage = opts?.requiredMessage ?? REQUIRED_DEFAULT
  const d = nineDigitsFromSsnItinInput(raw)
  if (!d.length) return required ? requiredMessage : null
  if (d.length < SSN_ITIN_LEN) {
    return "Enter all 9 digits (XXX-XX-XXXX)."
  }
  if (!isValidSsnOrItinNine(d)) {
    if (d[0] === "9") {
      return "Enter a valid ITIN (9 digits, starts with 9 · XXX-XX-XXXX)."
    }
    return "Enter a valid SSN (9 digits · XXX-XX-XXXX)."
  }
  return null
}

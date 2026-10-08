/** Shown in tables and read-only inputs when email is missing or privacy-redacted. */
export const EMAIL_UNAVAILABLE_LABEL = "Email unavailable"

const UNAVAILABLE_TOKENS = new Set([
  "",
  "—",
  "-",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "redacted",
  "not visible",
  "email unavailable",
  "unavailable",
])

function normalizeEmailToken(raw: string): string {
  return raw.trim().toLowerCase()
}

/** True when the value is a real address safe to show / use for mailto. */
export function isDisplayableEmail(
  email: string | null | undefined | unknown,
): boolean {
  const em = String(email ?? "").trim()
  if (!em) return false
  if (UNAVAILABLE_TOKENS.has(normalizeEmailToken(em))) return false
  if (/redacted/i.test(em)) return false
  return em.includes("@")
}

/**
 * Display label for email columns and read-only inputs.
 * Missing, placeholder, or redacted values → {@link EMAIL_UNAVAILABLE_LABEL}.
 */
export function displayEmail(email: string | null | undefined | unknown): string {
  const em = String(email ?? "").trim()
  if (isDisplayableEmail(em)) return em
  return EMAIL_UNAVAILABLE_LABEL
}

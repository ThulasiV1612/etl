/** Deal form ZIP / PIN: digits only, max 5 (US-style). */
export function normalizeZipCodeDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 5)
}

/** Empty is allowed; if present, must be exactly 5 digits. */
export function zipCodeFieldError(value: string): string | undefined {
  const t = value.trim()
  if (!t) return undefined
  if (!/^\d{5}$/.test(t)) return "Enter exactly 5 digits."
  return undefined
}

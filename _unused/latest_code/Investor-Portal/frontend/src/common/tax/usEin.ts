/** U.S. EIN — display XX-XXXXXXX, store up to 9 digits. */

export const EIN_LEN = 9

const REQUIRED_DEFAULT = "This field is required."

export function nineDigitsFromEinInput(raw: string): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, EIN_LEN)
}

export function formatEinDisplay(digits: string): string {
  const d = nineDigitsFromEinInput(digits)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}-${d.slice(2)}`
}

export function formatEinInput(raw: string): string {
  return formatEinDisplay(nineDigitsFromEinInput(raw))
}

/** Basic IRS check: 9 digits; prefix 00 is not assigned. */
export function isValidEinNine(d: string): boolean {
  if (!/^\d{9}$/.test(d)) return false
  if (d.slice(0, 2) === "00") return false
  return true
}

export type EinInlineStatus = "ok" | "empty" | "incomplete" | "invalid"

export function einInlineStatus(raw: string): EinInlineStatus {
  const d = nineDigitsFromEinInput(raw)
  if (!d.length) return "empty"
  if (d.length < EIN_LEN) return "incomplete"
  if (!isValidEinNine(d)) return "invalid"
  return "ok"
}

export function einFieldError(
  raw: string,
  opts?: { required?: boolean; requiredMessage?: string },
): string | null {
  const required = opts?.required ?? false
  const requiredMessage = opts?.requiredMessage ?? REQUIRED_DEFAULT
  const d = nineDigitsFromEinInput(raw)
  if (!d.length) return required ? requiredMessage : null
  if (d.length < EIN_LEN) {
    return "Enter all 9 digits (XX-XXXXXXX)."
  }
  if (!isValidEinNine(d)) {
    return "Enter a valid EIN (XX-XXXXXXX)."
  }
  return null
}

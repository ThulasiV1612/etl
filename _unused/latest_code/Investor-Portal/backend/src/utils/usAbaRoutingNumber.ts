/** U.S. ABA routing transit number (9 digits + checksum). */

export const ABA_ROUTING_LEN = 9

export function digitsFromAbaRoutingInput(raw: string): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, ABA_ROUTING_LEN)
}

export function isValidUsAbaRoutingNumber(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false
  if (digits.slice(0, 2) === "00") return false
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1] as const
  let sum = 0
  for (let i = 0; i < ABA_ROUTING_LEN; i++) {
    sum += Number(digits[i]) * weights[i]!
  }
  return sum % 10 === 0
}

export function abaRoutingNumberValidationMessage(raw: string): string | null {
  const digits = digitsFromAbaRoutingInput(raw)
  if (!digits.length) return null
  if (digits.length < ABA_ROUTING_LEN) {
    return "Enter a valid 9-digit routing number."
  }
  if (!isValidUsAbaRoutingNumber(digits)) {
    return "Enter a valid U.S. bank routing number (ABA)."
  }
  return null
}

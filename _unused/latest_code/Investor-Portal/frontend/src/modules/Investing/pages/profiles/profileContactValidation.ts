import {
  isValidUsNanp10,
  nationalTenDigitsFromRawInput,
} from "@/common/phone/usPhoneNumber"

const REQUIRED_MSG = "This field is required."

/** Non-empty value must look like a normal email. */
export function getEmailFieldError(
  raw: string,
  options?: { required?: boolean },
): string | undefined {
  const t = raw.trim()
  if (!t) {
    return options?.required ? REQUIRED_MSG : undefined
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(t)) {
    return "Enter a valid email address."
  }
  return undefined
}

/** Optional or required U.S. NANP phone (10 digits). */
export function getUsPhoneFieldError(
  raw: string,
  options?: { required?: boolean },
): string | undefined {
  const pd = nationalTenDigitsFromRawInput(raw)
  if (pd.length === 0) {
    return options?.required ? REQUIRED_MSG : undefined
  }
  if (pd.length < 10) {
    return "Enter a complete 10-digit U.S. phone number."
  }
  if (!isValidUsNanp10(pd)) {
    return "That is not a valid U.S. area code or exchange."
  }
  return undefined
}

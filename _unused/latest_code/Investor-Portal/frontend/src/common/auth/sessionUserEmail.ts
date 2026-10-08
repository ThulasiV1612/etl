import { SESSION_USER_DETAILS_KEY } from "./sessionKeys"

/** Primary email for the signed-in user (`userDetails[0].email` in sessionStorage). */
export function getSessionUserEmail(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_DETAILS_KEY)
    if (!raw) return ""
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return ""
    const entry = parsed[0]
    if (entry == null || typeof entry !== "object" || Array.isArray(entry))
      return ""
    const email = String((entry as Record<string, unknown>).email ?? "").trim()
    return email.toLowerCase()
  } catch {
    return ""
  }
}

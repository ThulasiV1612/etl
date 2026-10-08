import { SESSION_USER_DETAILS_KEY } from "./sessionKeys"

/** Portal user id from `userDetails[0]` in sessionStorage (JWT `id`). */
export function getSessionUserId(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_DETAILS_KEY)
    if (!raw) return ""
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return ""
    const entry = parsed[0]
    if (entry == null || typeof entry !== "object" || Array.isArray(entry))
      return ""
    const row = entry as Record<string, unknown>
    const id = row.id ?? row.userId ?? row.user_id
    return typeof id === "string" ? id.trim() : ""
  } catch {
    return ""
  }
}

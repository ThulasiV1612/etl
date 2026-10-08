import { SESSION_USER_DETAILS_KEY } from "../../common/auth/sessionKeys"

export function readSessionUser(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_DETAILS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const first = parsed[0]
    if (first == null || typeof first !== "object" || Array.isArray(first))
      return null
    return first as Record<string, unknown>
  } catch {
    return null
  }
}

/** Merges API `user` into the first `userDetails` entry (same shape as sign-in). */
export function mergeSessionUserDetails(apiUser: Record<string, unknown>): void {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_DETAILS_KEY)
    const prev = raw ? (JSON.parse(raw) as unknown[]) : []
    const base =
      prev[0] && typeof prev[0] === "object" && !Array.isArray(prev[0])
        ? (prev[0] as Record<string, unknown>)
        : {}
    const merged = {
      ...base,
      ...apiUser,
      organization_name:
        (typeof apiUser.organization_name === "string"
          ? apiUser.organization_name
          : undefined) ??
        (typeof base.organization_name === "string" ? base.organization_name : "") ??
        "",
    }
    sessionStorage.setItem(SESSION_USER_DETAILS_KEY, JSON.stringify([merged]))
  } catch {
    sessionStorage.setItem(SESSION_USER_DETAILS_KEY, JSON.stringify([apiUser]))
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("portal-session-user-updated"))
  }
}

import { SESSION_BEARER_KEY } from "../../common/auth/sessionKeys"
import { getApiV1Base } from "../../common/utils/apiBaseUrl"

export type ProfilePatchBody = Partial<{
  firstName: string
  lastName: string
  phone: string
  companyName: string
  username: string
}>

function authJsonHeaders(): HeadersInit {
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  const h: HeadersInit = { "Content-Type": "application/json" }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function authGetHeaders(): HeadersInit {
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  const h: HeadersInit = {}
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

/** Loads the signed-in user from the API (JWT). Use for display name when session cache may be stale. */
export async function fetchMyProfile(): Promise<Record<string, unknown> | null> {
  const base = getApiV1Base()
  if (!base) return null
  try {
    const res = await fetch(`${base}/auth/me`, {
      method: "GET",
      headers: authGetHeaders(),
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as {
      user?: unknown
    }
    if (!res.ok) return null
    const user = data.user
    if (!user || typeof user !== "object" || Array.isArray(user)) return null
    return user as Record<string, unknown>
  } catch {
    return null
  }
}

/** Parse JSON body; on failure return a synthetic message from raw text (e.g. HTML error pages). */
async function readJsonResponse(res: Response): Promise<{
  data: Record<string, unknown>
  rawText: string
}> {
  const rawText = await res.text()
  if (!rawText.trim()) return { data: {}, rawText: "" }
  try {
    return { data: JSON.parse(rawText) as Record<string, unknown>, rawText }
  } catch {
    return {
      data: {
        message: rawText.replace(/\s+/g, " ").trim().slice(0, 200),
      },
      rawText,
    }
  }
}

function errorMessageFromResponse(
  res: Response,
  data: Record<string, unknown>,
): string {
  const m = data.message
  if (typeof m === "string" && m.trim()) return m.trim()
  return `Request failed (${res.status} ${res.statusText || ""})`.trim()
}

export async function patchMyProfile(
  body: ProfilePatchBody,
): Promise<{ user: Record<string, unknown> }> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(`${base}/auth/me`, {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify(body),
  })
  const { data } = await readJsonResponse(res)
  if (!res.ok) throw new Error(errorMessageFromResponse(res, data))
  const user = data.user
  if (!user || typeof user !== "object" || Array.isArray(user)) {
    throw new Error("Invalid response from server.")
  }
  return { user: user as Record<string, unknown> }
}

export async function postChangePassword(body: {
  currentPassword: string
  newPassword: string
}): Promise<{ user: Record<string, unknown> }> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(`${base}/auth/change-password`, {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify(body),
  })
  const { data } = await readJsonResponse(res)
  if (!res.ok) throw new Error(errorMessageFromResponse(res, data))
  const user = data.user
  if (!user || typeof user !== "object" || Array.isArray(user)) {
    throw new Error("Invalid response from server.")
  }
  return { user: user as Record<string, unknown> }
}

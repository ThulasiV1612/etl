import {
  SESSION_BEARER_KEY,
  SESSION_REFRESH_KEY,
} from "./sessionKeys"
import { getApiV1Base } from "../utils/apiBaseUrl"

export function getStoredAccessToken(): string | null {
  if (typeof sessionStorage === "undefined") return null
  const raw = sessionStorage.getItem(SESSION_BEARER_KEY)
  return raw?.trim() ? raw.trim() : null
}

export function getStoredRefreshToken(): string | null {
  if (typeof sessionStorage === "undefined") return null
  const raw = sessionStorage.getItem(SESSION_REFRESH_KEY)
  return raw?.trim() ? raw.trim() : null
}

/** True when refresh may be sent via HttpOnly cookie (no sessionStorage value). */
export function usesHttpOnlyRefreshCookie(): boolean {
  return !getStoredRefreshToken()
}

export function storeAuthTokens(
  accessToken: string,
  refreshToken?: string | null,
): void {
  sessionStorage.setItem(SESSION_BEARER_KEY, accessToken)
  if (typeof refreshToken === "string" && refreshToken.trim()) {
    sessionStorage.setItem(SESSION_REFRESH_KEY, refreshToken.trim())
  } else {
    sessionStorage.removeItem(SESSION_REFRESH_KEY)
  }
}

/** Exchange refresh token for a new access + refresh pair. */
export async function refreshAuthTokens(): Promise<boolean> {
  const base = getApiV1Base()
  const refreshToken = getStoredRefreshToken()
  if (!base) return false
  if (!refreshToken && typeof document === "undefined") return false

  try {
    const res = await fetch(`${base}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(
        refreshToken ? { refreshToken } : {},
      ),
    })
    const data = (await res.json().catch(() => ({}))) as {
      accessToken?: string
      refreshToken?: string
      token?: string
    }
    if (!res.ok) return false

    const access =
      typeof data.accessToken === "string"
        ? data.accessToken
        : typeof data.token === "string"
          ? data.token
          : null
    if (!access) return false

    storeAuthTokens(
      access,
      typeof data.refreshToken === "string" ? data.refreshToken : refreshToken,
    )
    return true
  } catch {
    return false
  }
}

/** Revoke tokens server-side before clearing local session. */
export async function revokeAuthTokens(): Promise<void> {
  const base = getApiV1Base()
  const accessToken = getStoredAccessToken()
  const refreshToken = getStoredRefreshToken()
  if (!base || (!accessToken && !refreshToken)) return

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  try {
    await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({
        ...(refreshToken ? { refreshToken } : {}),
      }),
    })
  } catch {
    /* non-blocking */
  }
}

import { SESSION_ACTIVITY_SESSION_ID_KEY, SESSION_BEARER_KEY } from "./sessionKeys"
import { getApiV1Base } from "../utils/apiBaseUrl"

function authHeaders(): Record<string, string> | null {
  const base = getApiV1Base()
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  if (!base || !token) return null
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

export function getStoredActivitySessionId(): string | null {
  if (typeof sessionStorage === "undefined") return null
  const raw = sessionStorage.getItem(SESSION_ACTIVITY_SESSION_ID_KEY)
  return raw?.trim() ? raw.trim() : null
}

export function setStoredActivitySessionId(id: string): void {
  sessionStorage.setItem(SESSION_ACTIVITY_SESSION_ID_KEY, id)
}

/** Ensure an open session exists (e.g. after page refresh). */
export async function ensureActivitySession(): Promise<string | null> {
  const headers = authHeaders()
  if (!headers) return null
  const base = getApiV1Base()
  if (!base) return null

  try {
    const res = await fetch(`${base}/auth/activity/session`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({
        activitySessionId: getStoredActivitySessionId(),
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      activitySessionId?: string
    }
    if (!res.ok || typeof data.activitySessionId !== "string") return null
    setStoredActivitySessionId(data.activitySessionId)
    return data.activitySessionId
  } catch {
    return null
  }
}

export async function recordActivityPageView(
  pagePath: string,
  pageLabel: string,
): Promise<void> {
  const headers = authHeaders()
  if (!headers) return
  const base = getApiV1Base()
  if (!base) return

  try {
    const res = await fetch(`${base}/auth/activity/page-view`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({
        activitySessionId: getStoredActivitySessionId(),
        pagePath,
        pageLabel,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      activitySessionId?: string
    }
    if (res.ok && typeof data.activitySessionId === "string") {
      setStoredActivitySessionId(data.activitySessionId)
    }
  } catch {
    /* non-blocking */
  }
}

/** Record logout before clearing session storage. */
export async function recordActivityLogout(): Promise<void> {
  const headers = authHeaders()
  if (!headers) return
  const base = getApiV1Base()
  if (!base) return
  const sessionId = getStoredActivitySessionId()
  if (!sessionId) return

  try {
    await fetch(`${base}/auth/activity/logout`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ activitySessionId: sessionId }),
    })
  } catch {
    /* non-blocking */
  }
}

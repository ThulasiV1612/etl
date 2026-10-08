import { decodeJwtPayload } from "../../modules/auth/utils/decode-jwt-payload"
import {
  getStoredAccessToken,
  getStoredRefreshToken,
  refreshAuthTokens,
} from "./authTokensApi"
import { getApiV1Base } from "../utils/apiBaseUrl"
import {
  clearLastSessionActivity,
  markIdleSessionTimeoutNotice,
  touchSessionActivity,
} from "./idleSession"
import { portalAuthHeaders, ACTIVE_ORGANIZATION_HEADER, PORTAL_OMIT_ACTIVE_ORG_HEADER } from "./portalAuthHeaders"
import { clearPortalSessionStorage } from "./sessionKeys"

let refreshInFlight: Promise<boolean> | null = null
let nativeFetch: typeof fetch = (...args) => fetch(...args)

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

function isPortalApiV1Request(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin)
    return parsed.pathname.includes("/api/v1/")
  } catch {
    return url.includes("/api/v1/")
  }
}

function isAuthExemptUrl(url: string): boolean {
  return /\/api\/v1\/auth\/(signin|signup|refresh|forgot-password|reset-password)(\/|$|\?)/i.test(
    url,
  )
}

/** Single-flight refresh so parallel 401s share one token exchange. */
export async function tryRefreshAccessTokenOnce(): Promise<boolean> {
  if (!getApiV1Base()) return false
  if (!refreshInFlight) {
    refreshInFlight = refreshAuthTokens().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

export function handleAuthSessionExpired(): void {
  if (typeof window === "undefined") return
  const path = window.location.pathname
  if (path.includes("/signin") || path.includes("/signup")) return

  const hadSession =
    Boolean(getStoredAccessToken()) || Boolean(getStoredRefreshToken())
  if (!hadSession) return

  markIdleSessionTimeoutNotice()
  clearPortalSessionStorage()
  clearLastSessionActivity()

  const returnPath = `${window.location.pathname}${window.location.search}`
  const next =
    returnPath && returnPath !== "/"
      ? `?next=${encodeURIComponent(returnPath)}`
      : ""
  window.location.assign(`/signin${next}`)
}

function shouldOmitActiveOrganization(init?: RequestInit): boolean {
  const headers = new Headers(init?.headers)
  return headers.get(PORTAL_OMIT_ACTIVE_ORG_HEADER) === "1"
}

function mergeFreshAuthHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers)
  const omitActiveOrganization = shouldOmitActiveOrganization(init)
  if (omitActiveOrganization) {
    headers.delete(PORTAL_OMIT_ACTIVE_ORG_HEADER)
    headers.delete(ACTIVE_ORGANIZATION_HEADER)
  }
  const auth = portalAuthHeaders({ omitActiveOrganization })
  for (const [key, value] of Object.entries(auth)) {
    if (value != null && value !== "") {
      headers.set(key, String(value))
    }
  }
  return headers
}

type PortalFetchInit = RequestInit & { _portalAuthRetried?: boolean }

const retriedRequests = new WeakMap<RequestInit, boolean>()

function wasRetried(init?: RequestInit): boolean {
  return init != null && retriedRequests.get(init) === true
}

function markRetried(init: RequestInit): RequestInit {
  retriedRequests.set(init, true)
  return init
}

/**
 * Fetch wrapper: attaches portal auth headers and retries once after refresh on 401.
 */
export async function portalFetch(
  input: RequestInfo | URL,
  init?: PortalFetchInit,
): Promise<Response> {
  const url = resolveRequestUrl(input)
  const isApi = isPortalApiV1Request(url)

  const response = await nativeFetch(input, {
    ...init,
    headers: isApi ? mergeFreshAuthHeaders(init) : init?.headers,
    credentials: init?.credentials ?? "include",
  })

  if (isApi && !isAuthExemptUrl(url) && response.ok) {
    touchSessionActivity();
  }

  if (
    !isApi ||
    response.status !== 401 ||
    isAuthExemptUrl(url) ||
    wasRetried(init)
  ) {
    return response
  }

  const refreshed = await tryRefreshAccessTokenOnce()
  if (!refreshed) {
    handleAuthSessionExpired()
    return response
  }

  const retryInit = markRetried({ ...(init ?? {}) })
  const retryResponse = await nativeFetch(input, {
    ...retryInit,
    headers: mergeFreshAuthHeaders(retryInit),
    credentials: retryInit.credentials ?? "include",
  })
  if (isApi && !isAuthExemptUrl(url) && retryResponse.ok) {
    touchSessionActivity();
  }
  return retryResponse
}

/** Patch global fetch so existing API modules get refresh-on-401 without refactors. */
export function installPortalFetchInterceptor(): void {
  if (typeof window === "undefined") return
  const w = window as Window & { __portalFetchInstalled?: boolean }
  if (w.__portalFetchInstalled) return
  w.__portalFetchInstalled = true

  nativeFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveRequestUrl(input)
    if (!isPortalApiV1Request(url)) {
      return nativeFetch(input, init)
    }
    return portalFetch(input, init)
  }
}

/** Refresh before access JWT expires (or when legacy token has no jti). */
export async function ensureValidAccessToken(): Promise<boolean> {
  const access = getStoredAccessToken()
  if (!access) return false

  const payload = decodeJwtPayload<{ exp?: number; jti?: string }>(access)
  if (!payload) {
    return tryRefreshAccessTokenOnce()
  }

  const missingJti = !String(payload.jti ?? "").trim()
  const expMs = typeof payload.exp === "number" ? payload.exp * 1000 : 0
  const expiresSoon = expMs > 0 && expMs <= Date.now() + 60_000
  const expired = expMs > 0 && expMs <= Date.now()

  if (expired || missingJti || expiresSoon) {
    const refreshed = await tryRefreshAccessTokenOnce()
    if (refreshed) touchSessionActivity()
    return refreshed
  }

  return true
}
